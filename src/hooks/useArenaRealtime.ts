import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDefaultCourts } from '../data/defaultArenaData';
import {
  ADMIN_EMAIL,
  OperationType,
  UNAUTHORIZED_DOMAIN_ERROR_CODE,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isAdminEmail,
} from '../lib/firebase';
import {
  ADDON_CATALOG,
  OPERATING_HOURS,
  isSlotPast,
  type Booking,
  type BookingAddon,
  type BookingKind,
  type BookingStatus,
  type Court,
  type CourtStatus,
  type PaymentMethod,
  type SlotHold,
} from '../types/booking';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'local' | 'cloud';

export interface CreateBookingInput {
  courtId: string;
  date: string;
  slots: number[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod: PaymentMethod;
  addons?: Array<{ id: string; qty: number }>;
  notes?: string;
  kind?: BookingKind;
  status?: BookingStatus;
}

const MANAGEMENT_PASSCODE = '00000';
const MGMT_SESSION_KEY = 'smash_mgmt_unlocked';

interface PublicBookingDoc {
  id: string;
  bookingCode: string;
  courtId: string;
  date: string;
  slots: number[];
  displayName: string;
  paymentMethod: PaymentMethod;
  status: BookingStatus;
  kind: BookingKind;
  addons: BookingAddon[];
  subtotal: number;
  totalAmount: number;
  notes?: string;
  ownerUid: string;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

interface BookingContactDoc {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  ownerUid: string;
}

interface HoldDoc {
  courtId: string;
  date: string;
  hour: number;
  ownerUid: string;
  expiresAt: number;
}

function toIsoString(val: Timestamp | string | undefined): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  return new Date().toISOString();
}

function generateBookingId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 10; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `bk-${suffix}`;
}

function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SM-${suffix}`;
}

export function useArenaRealtime() {
  const [courts, setCourts] = useState<Court[]>(() => buildDefaultCourts());
  const [publicBookings, setPublicBookings] = useState<PublicBookingDoc[]>([]);
  const [contactMap, setContactMap] = useState<Map<string, BookingContactDoc>>(() => new Map());
  const [rawHolds, setRawHolds] = useState<Array<{ id: string; data: HoldDoc }>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [onlineCount] = useState<number>(1);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isRegistryAdmin, setIsRegistryAdmin] = useState<boolean>(false);

  const [managementUnlocked, setManagementUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(MGMT_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const hasSeededCourtsRef = useRef<boolean>(false);
  const myHoldIdsRef = useRef<string[]>([]);

  const isAdminUser = useMemo(() => {
    if (!authUser) return false;
    return isAdminEmail(authUser.email) || isRegistryAdmin;
  }, [authUser, isRegistryAdmin]);

  const signInWithGoogle = useCallback(async (): Promise<User> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw new Error('Masuk Google dibatalkan. Silakan coba lagi untuk melanjutkan.');
      }
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        throw new Error(
          `${UNAUTHORIZED_DOMAIN_ERROR_CODE}: Domain "${host}" belum diizinkan di Firebase Authentication -> Authorized domains.`
        );
      }
      throw new Error('Gagal masuk dengan akun Google. Periksa koneksi atau izinkan pop-up browser.');
    }
  }, []);

  const signOutUser = useCallback(async (): Promise<void> => {
    await signOut(auth);
    try {
      sessionStorage.removeItem(MGMT_SESSION_KEY);
    } catch {
      // Ignore storage failures
    }
    setManagementUnlocked(false);
    setContactMap(new Map());
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user && !isAdminEmail(user.email)) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          setIsRegistryAdmin(adminSnap.exists());
        } catch {
          setIsRegistryAdmin(false);
        }
      } else {
        setIsRegistryAdmin(false);
      }
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Auto-lock management if user signs out or switches away from admin
  useEffect(() => {
    if (isAuthReady && managementUnlocked && !isAdminUser) {
      setManagementUnlocked(false);
      try {
        sessionStorage.removeItem(MGMT_SESSION_KEY);
      } catch {
        // Ignore
      }
    }
  }, [isAdminUser, isAuthReady, managementUnlocked]);

  // Public Courts real-time listener + auto-seed for admin if collection is empty
  useEffect(() => {
    const courtsQuery = query(collection(db, 'courts'), where('id', 'in', ['court-a', 'court-b']));
    const unsub = onSnapshot(
      courtsQuery,
      (snapshot) => {
        setConnectionStatus('cloud');
        setLastSyncedAt(new Date().toISOString());

        if (snapshot.empty) {
          const defaults = buildDefaultCourts();
          setCourts(defaults);
          if (isAdminUser && !hasSeededCourtsRef.current) {
            hasSeededCourtsRef.current = true;
            const batch = writeBatch(db);
            for (const c of defaults) {
              batch.set(doc(db, 'courts', c.id), {
                ...c,
                updatedAt: serverTimestamp(),
              });
            }
            void batch.commit().catch((err) => {
              hasSeededCourtsRef.current = false;
              console.error('Seed courts error:', err);
            });
          }
          return;
        }

        const loaded = snapshot.docs
          .map((d) => {
            const data = d.data() as Court;
            return {
              id: data.id || d.id,
              name: data.name,
              code: data.code,
              category: data.category,
              categoryLabel: data.categoryLabel,
              surface: data.surface,
              lighting: data.lighting,
              status: data.status,
              hourlyPrice: Number(data.hourlyPrice),
              imageUrl: data.imageUrl,
            } satisfies Court;
          })
          .sort((a, b) => a.code.localeCompare(b.code));

        setCourts(loaded);
      },
      (err) => {
        setConnectionStatus('reconnecting');
        console.error('Courts snapshot error:', err);
      }
    );

    return () => unsub();
  }, [isAdminUser]);

  // Public Bookings real-time listener (NO PII stored in this collection)
  useEffect(() => {
    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('courtId', 'in', ['court-a', 'court-b'])
    );
    const unsub = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setConnectionStatus('cloud');
        setLastSyncedAt(new Date().toISOString());
        const list = snapshot.docs
          .map((d) => d.data() as PublicBookingDoc)
          .sort((a, b) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
        setPublicBookings(list);
        setIsLoading(false);
      },
      (err) => {
        setConnectionStatus('reconnecting');
        setIsLoading(false);
        console.error('Bookings snapshot error:', err);
      }
    );

    return () => unsub();
  }, []);

  // Private Contacts listener (Strictly restricted to authenticated owner or admin)
  useEffect(() => {
    if (!isAuthReady || !authUser) {
      setContactMap(new Map());
      return;
    }

    const contactsQuery = isAdminUser
      ? query(collection(db, 'booking_contacts'))
      : query(collection(db, 'booking_contacts'), where('ownerUid', '==', authUser.uid));

    const unsub = onSnapshot(
      contactsQuery,
      (snapshot) => {
        const nextMap = new Map<string, BookingContactDoc>();
        for (const d of snapshot.docs) {
          const data = d.data() as BookingContactDoc;
          nextMap.set(data.bookingId || d.id, data);
        }
        setContactMap(nextMap);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'booking_contacts');
      }
    );

    return () => unsub();
  }, [authUser, isAdminUser, isAuthReady]);

  // Temporary Holds listener
  useEffect(() => {
    const holdsQuery = query(
      collection(db, 'holds'),
      where('courtId', 'in', ['court-a', 'court-b'])
    );
    const unsub = onSnapshot(
      holdsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          data: d.data() as HoldDoc,
        }));
        setRawHolds(list);
      },
      (err) => {
        console.error('Holds snapshot error:', err);
      }
    );

    return () => unsub();
  }, []);

  // Merge non-PII public bookings with authorized private contacts
  const bookings: Booking[] = useMemo(() => {
    return publicBookings.map((b) => {
      const contact = contactMap.get(b.id);
      return {
        id: b.id,
        bookingCode: b.bookingCode,
        courtId: b.courtId,
        date: b.date,
        slots: Array.isArray(b.slots) ? b.slots : [],
        customerName: contact?.customerName || b.displayName,
        customerPhone: contact?.customerPhone || '-',
        customerEmail: contact?.customerEmail,
        paymentMethod: b.paymentMethod,
        status: b.status,
        kind: b.kind,
        addons: Array.isArray(b.addons) ? b.addons : [],
        subtotal: b.subtotal,
        totalAmount: b.totalAmount,
        notes: b.notes,
        createdAt: toIsoString(b.createdAt),
        updatedAt: toIsoString(b.updatedAt),
      };
    });
  }, [contactMap, publicBookings]);

  const holds: SlotHold[] = useMemo(() => {
    const now = Date.now();
    return rawHolds
      .filter(({ data }) => data.expiresAt > now && data.ownerUid !== authUser?.uid)
      .map(({ id, data }) => ({
        key: id,
        courtId: data.courtId,
        date: data.date,
        hour: data.hour,
        clientId: data.ownerUid,
        expiresAt: data.expiresAt,
      }));
  }, [authUser?.uid, rawHolds]);

  const syncHold = useCallback(
    async (courtId: string, date: string, slots: number[]) => {
      const user = auth.currentUser;
      if (!user) return;

      const nextIds =
        courtId && date && slots.length > 0
          ? slots.filter((hr) => OPERATING_HOURS.includes(hr)).map((hr) => `${courtId}_${date}_${hr}`)
          : [];

      const toDelete = myHoldIdsRef.current.filter((id) => !nextIds.includes(id));
      myHoldIdsRef.current = nextIds;

      if (toDelete.length === 0 && nextIds.length === 0) return;

      try {
        const batch = writeBatch(db);
        for (const oldId of toDelete) {
          batch.delete(doc(db, 'holds', oldId));
        }
        const expiresAt = Date.now() + 120_000;
        for (const hr of slots) {
          if (!OPERATING_HOURS.includes(hr) || !courtId || !date) continue;
          const holdId = `${courtId}_${date}_${hr}`;
          batch.set(doc(db, 'holds', holdId), {
            courtId,
            date,
            hour: hr,
            ownerUid: user.uid,
            expiresAt,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      } catch (err) {
        console.error('Sync hold warning:', err);
      }
    },
    []
  );

  const unlockManagement = useCallback(
    async (passcode: string): Promise<void> => {
      if (passcode.trim() !== MANAGEMENT_PASSCODE) {
        throw new Error('Sandi salah. Silakan coba kembali.');
      }

      let currentUser = auth.currentUser;
      if (!currentUser) {
        currentUser = await signInWithGoogle();
      }

      let allowed = isAdminEmail(currentUser.email);
      if (!allowed) {
        try {
          const snap = await getDoc(doc(db, 'admins', currentUser.uid));
          allowed = snap.exists();
          setIsRegistryAdmin(allowed);
        } catch {
          allowed = false;
        }
      }

      if (!allowed) {
        throw new Error(
          `Akun ${currentUser.email || 'ini'} bukan pengelola arena. Silakan masuk dengan akun admin (${ADMIN_EMAIL}).`
        );
      }

      try {
        sessionStorage.setItem(MGMT_SESSION_KEY, 'true');
      } catch {
        // Ignore storage issues
      }
      setManagementUnlocked(true);
    },
    [signInWithGoogle]
  );

  const lockManagement = useCallback(() => {
    try {
      sessionStorage.removeItem(MGMT_SESSION_KEY);
    } catch {
      // Ignore storage issues
    }
    setManagementUnlocked(false);
  }, []);

  const createBooking = useCallback(
    async (input: CreateBookingInput): Promise<Booking> => {
      let user = auth.currentUser;
      if (!user) {
        user = await signInWithGoogle();
      }

      const court = courts.find((c) => c.id === input.courtId);
      if (!court) {
        throw new Error('Lapangan tidak ditemukan.');
      }
      if (court.status === 'maintenance' && input.kind !== 'maintenance') {
        throw new Error(`${court.name} sedang dalam status perawatan.`);
      }

      const normalizedSlots = Array.from(
        new Set(input.slots.map(Number).filter((hr) => OPERATING_HOURS.includes(hr)))
      ).sort((a, b) => a - b);

      if (normalizedSlots.length === 0) {
        throw new Error('Slot jam yang dipilih tidak valid.');
      }

      const isAdminCaller = isAdminEmail(user.email) || isRegistryAdmin;
      if (!isAdminCaller && normalizedSlots.some((hr) => isSlotPast(input.date, hr))) {
        throw new Error('Sebagian jam yang dipilih sudah lewat. Silakan pilih jam berikutnya.');
      }

      const conflict = bookings.find(
        (b) =>
          b.courtId === input.courtId &&
          b.date === input.date &&
          b.status !== 'Dibatalkan' &&
          b.slots.some((s) => normalizedSlots.includes(s))
      );
      if (conflict) {
        throw new Error(
          `Slot bentrok dengan kode booking ${conflict.bookingCode} (${conflict.customerName}). Silakan pilih jam lain.`
        );
      }

      const cleanName = input.customerName.trim();
      const cleanPhone = input.customerPhone.trim() || '-';
      if (cleanName.length < 2) {
        throw new Error('Nama pemesan wajib diisi minimal 2 karakter.');
      }
      if (
        input.kind !== 'tournament' &&
        input.kind !== 'maintenance' &&
        cleanPhone.length < 8
      ) {
        throw new Error('Nomor WhatsApp aktif wajib diisi minimal 8 digit.');
      }

      const resolvedAddons: BookingAddon[] = [];
      if (Array.isArray(input.addons)) {
        for (const item of input.addons) {
          const catalogItem = ADDON_CATALOG.find((a) => a.id === item.id);
          const qty = Math.max(0, Math.min(catalogItem?.maxQty ?? 36, Number(item.qty) || 0));
          if (catalogItem && qty > 0) {
            resolvedAddons.push({
              id: catalogItem.id,
              name: catalogItem.name,
              price: catalogItem.price,
              qty,
            });
          }
        }
      }

      const kind: BookingKind = input.kind || 'customer';
      const subtotal =
        kind === 'maintenance' ? 0 : normalizedSlots.length * court.hourlyPrice;
      const addonTotal = resolvedAddons.reduce((sum, a) => sum + a.price * a.qty, 0);
      const totalAmount = subtotal + addonTotal;
      const initialStatus: BookingStatus =
        isAdminEmail(user.email) || isRegistryAdmin
          ? input.status || 'Menunggu'
          : 'Menunggu';

      const bookingId = generateBookingId();
      const bookingCode = generateBookingCode();
      const cleanNotes = input.notes?.trim();

      const bookingPayload: Record<string, unknown> = {
        id: bookingId,
        bookingCode,
        courtId: input.courtId,
        date: input.date,
        slots: normalizedSlots,
        displayName: cleanName,
        paymentMethod: 'Bayar di Kasir',
        status: initialStatus,
        kind,
        addons: resolvedAddons,
        subtotal,
        totalAmount,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanNotes) {
        bookingPayload.notes = cleanNotes;
      }

      const contactPayload: Record<string, unknown> = {
        bookingId,
        bookingCode,
        customerName: cleanName,
        customerPhone: cleanPhone,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      };
      const cleanEmail = input.customerEmail?.trim() || user.email || undefined;
      if (cleanEmail) {
        contactPayload.customerEmail = cleanEmail;
      }

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'bookings', bookingId), bookingPayload);
        batch.set(doc(db, 'booking_contacts', bookingId), contactPayload);
        for (const hr of normalizedSlots) {
          batch.delete(doc(db, 'holds', `${input.courtId}_${input.date}_${hr}`));
        }
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `bookings/${bookingId}`);
      }

      const nowIso = new Date().toISOString();
      return {
        id: bookingId,
        bookingCode,
        courtId: input.courtId,
        date: input.date,
        slots: normalizedSlots,
        customerName: cleanName,
        customerPhone: cleanPhone,
        customerEmail: cleanEmail,
        paymentMethod: 'Bayar di Kasir',
        status: initialStatus,
        kind,
        addons: resolvedAddons,
        subtotal,
        totalAmount,
        notes: cleanNotes,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },
    [bookings, courts, isRegistryAdmin, signInWithGoogle]
  );

  const updateBooking = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Booking, 'status' | 'notes' | 'paymentMethod' | 'courtId' | 'date' | 'slots'>>
    ): Promise<Booking> => {
      const existing = bookings.find((b) => b.id === id);
      if (!existing) {
        throw new Error('Data booking tidak ditemukan.');
      }

      const nextCourtId = patch.courtId || existing.courtId;
      const nextDate = patch.date || existing.date;
      const nextSlots =
        Array.isArray(patch.slots) && patch.slots.length > 0
          ? Array.from(new Set(patch.slots.map(Number).filter((hr) => OPERATING_HOURS.includes(hr)))).sort(
              (a, b) => a - b
            )
          : existing.slots;
      const nextStatus = patch.status || existing.status;

      if (nextStatus !== 'Dibatalkan') {
        const conflict = bookings.find(
          (b) =>
            b.id !== existing.id &&
            b.courtId === nextCourtId &&
            b.date === nextDate &&
            b.status !== 'Dibatalkan' &&
            b.slots.some((s) => nextSlots.includes(s))
        );
        if (conflict) {
          throw new Error(`Jadwal bentrok dengan ${conflict.bookingCode} (${conflict.customerName}).`);
        }
      }

      const court = courts.find((c) => c.id === nextCourtId);
      const subtotal =
        existing.kind === 'maintenance' || !court
          ? existing.subtotal
          : nextSlots.length * court.hourlyPrice;
      const addonTotal = existing.addons.reduce((sum, a) => sum + a.price * a.qty, 0);
      const totalAmount = existing.kind === 'maintenance' ? 0 : subtotal + addonTotal;

      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        paymentMethod: patch.paymentMethod || existing.paymentMethod,
        courtId: nextCourtId,
        date: nextDate,
        slots: nextSlots,
        subtotal,
        totalAmount,
        updatedAt: serverTimestamp(),
      };
      if (patch.notes !== undefined) {
        updatePayload.notes = patch.notes;
      }

      try {
        await updateDoc(doc(db, 'bookings', id), updatePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `bookings/${id}`);
      }

      return {
        ...existing,
        courtId: nextCourtId,
        date: nextDate,
        slots: nextSlots,
        status: nextStatus,
        paymentMethod: patch.paymentMethod || existing.paymentMethod,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
        subtotal,
        totalAmount,
        updatedAt: new Date().toISOString(),
      };
    },
    [bookings, courts]
  );

  const deleteBooking = useCallback(async (id: string): Promise<void> => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bookings', id));
      batch.delete(doc(db, 'booking_contacts', id));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookings/${id}`);
    }
  }, []);

  const updateCourt = useCallback(
    async (
      id: string,
      patch: { status?: CourtStatus; hourlyPrice?: number }
    ): Promise<Court> => {
      const existing = courts.find((c) => c.id === id);
      if (!existing) {
        throw new Error('Lapangan tidak ditemukan.');
      }

      const updated: Court = {
        ...existing,
        status: patch.status ?? existing.status,
        hourlyPrice:
          typeof patch.hourlyPrice === 'number' && patch.hourlyPrice >= 5000
            ? patch.hourlyPrice
            : existing.hourlyPrice,
      };

      try {
        await setDoc(doc(db, 'courts', id), {
          ...updated,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `courts/${id}`);
      }

      return updated;
    },
    [courts]
  );

  return {
    courts,
    bookings,
    holds,
    onlineCount,
    connectionStatus,
    isLoading,
    lastSyncedAt,
    authUser,
    isAuthReady,
    isAdminUser,
    signInWithGoogle,
    signOutUser,
    isManagementUnlocked: managementUnlocked && isAdminUser,
    unlockManagement,
    lockManagement,
    syncHold,
    createBooking,
    updateBooking,
    deleteBooking,
    updateCourt,
  };
}
