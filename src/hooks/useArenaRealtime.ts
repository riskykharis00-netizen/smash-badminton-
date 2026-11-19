import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DB_SCHEMA_VERSION,
  buildDefaultCourts,
  buildSeedBookings,
} from '../data/defaultArenaData';
import {
  ADDON_CATALOG,
  OPERATING_HOURS,
  type Booking,
  type BookingAddon,
  type BookingKind,
  type BookingStatus,
  type Court,
  type CourtStatus,
  type PaymentMethod,
  type SlotHold,
  type WsServerMessage,
} from '../types/booking';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'local';

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

const LOCAL_DB_KEY = `smash_arena_local_db_v${DB_SCHEMA_VERSION}`;
const LOCAL_PASSCODE = '00000';
const LOCAL_TOKEN = 'local-mgmt-00000';

interface LocalDbState {
  version: number;
  courts: Court[];
  bookings: Booking[];
}

function loadLocalDb(): LocalDbState {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDbState;
      if (
        parsed.version === DB_SCHEMA_VERSION &&
        Array.isArray(parsed.courts) &&
        Array.isArray(parsed.bookings)
      ) {
        return parsed;
      }
    }
  } catch {
    // Fallback to seed
  }
  const courts = buildDefaultCourts();
  const bookings = buildSeedBookings(courts);
  const initial: LocalDbState = { version: DB_SCHEMA_VERSION, courts, bookings };
  saveLocalDb(initial);
  return initial;
}

function saveLocalDb(state: LocalDbState) {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

async function parseJsonResponse<T>(res: Response): Promise<{ isJson: boolean; data: T | null }> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!contentType.includes('application/json') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    return { isJson: false, data: null };
  }
  try {
    return { isJson: true, data: JSON.parse(text) as T };
  } catch {
    return { isJson: false, data: null };
  }
}

function generateLocalBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SM-${suffix}`;
}

export function useArenaRealtime() {
  const [courts, setCourts] = useState<Court[]>(() => buildDefaultCourts());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [holds, setHolds] = useState<SlotHold[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [backendMode, setBackendMode] = useState<'unknown' | 'server' | 'local'>('unknown');
  const [managementToken, setManagementToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('smash_mgmt_token');
    } catch {
      return null;
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const pendingHoldRef = useRef<{ courtId: string; date: string; slots: number[] } | null>(null);
  const unmountedRef = useRef<boolean>(false);

  const activateLocalMode = useCallback(() => {
    const localState = loadLocalDb();
    setCourts(localState.courts);
    setBookings(localState.bookings);
    setHolds([]);
    setOnlineCount(1);
    setBackendMode('local');
    setConnectionStatus('local');
    setLastSyncedAt(new Date().toISOString());
    setIsLoading(false);
  }, []);

  const broadcastLocalSync = useCallback((state: LocalDbState) => {
    saveLocalDb(state);
    if (bcRef.current) {
      bcRef.current.postMessage({ type: 'local:sync', payload: state });
    }
  }, []);

  const fetchInitialState = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/state');
      const { isJson, data } = await parseJsonResponse<{
        courts?: Court[];
        bookings?: Booking[];
        holds?: SlotHold[];
        onlineCount?: number;
      }>(res);

      if (!res.ok || !isJson || !data || !Array.isArray(data.courts)) {
        activateLocalMode();
        return false;
      }

      setCourts(data.courts);
      setBookings(data.bookings ?? []);
      setHolds(data.holds ?? []);
      if (typeof data.onlineCount === 'number') {
        setOnlineCount(data.onlineCount);
      }
      setBackendMode('server');
      setLastSyncedAt(new Date().toISOString());
      setIsLoading(false);
      return true;
    } catch {
      activateLocalMode();
      return false;
    }
  }, [activateLocalMode]);

  const connectWs = useCallback(() => {
    if (unmountedRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        retryAttemptRef.current = 0;
        setBackendMode('server');
        setConnectionStatus('connected');
        if (pendingHoldRef.current) {
          socket.send(JSON.stringify({ type: 'hold:sync', payload: pendingHoldRef.current }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsServerMessage;
          setLastSyncedAt(new Date().toISOString());

          switch (msg.type) {
            case 'init':
              setCourts(msg.payload.courts);
              setBookings(msg.payload.bookings);
              setHolds(msg.payload.holds);
              setOnlineCount(msg.payload.onlineCount);
              setIsLoading(false);
              break;

            case 'booking:created':
              setBookings((prev) => {
                if (prev.some((b) => b.id === msg.payload.id)) {
                  return prev;
                }
                return [msg.payload, ...prev];
              });
              break;

            case 'booking:updated':
              setBookings((prev) =>
                prev.map((b) => (b.id === msg.payload.id ? msg.payload : b))
              );
              break;

            case 'booking:deleted':
              setBookings((prev) => prev.filter((b) => b.id !== msg.payload.id));
              break;

            case 'court:updated':
              setCourts((prev) =>
                prev.map((c) => (c.id === msg.payload.id ? msg.payload : c))
              );
              break;

            case 'holds:updated':
              setHolds(msg.payload);
              break;

            case 'presence:update':
              setOnlineCount(msg.payload.onlineCount);
              break;
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      socket.onclose = () => {
        if (unmountedRef.current) return;
        setBackendMode((current) => {
          if (current === 'local') {
            setConnectionStatus('local');
            return 'local';
          }
          setConnectionStatus('reconnecting');
          const delay = Math.min(1000 * Math.pow(1.5, retryAttemptRef.current), 8000);
          retryAttemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            connectWs();
          }, delay);
          return current;
        });
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      activateLocalMode();
    }
  }, [activateLocalMode]);

  useEffect(() => {
    unmountedRef.current = false;

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('smash_arena_sync');
      bcRef.current = bc;
      bc.onmessage = (event) => {
        const msg = event.data as { type?: string; payload?: LocalDbState };
        if (msg?.type === 'local:sync' && msg.payload) {
          setCourts(msg.payload.courts);
          setBookings(msg.payload.bookings);
          setLastSyncedAt(new Date().toISOString());
        }
      };
    }

    fetchInitialState().then((hasServer) => {
      if (hasServer && !unmountedRef.current) {
        connectWs();
      }
    });

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (bcRef.current) {
        bcRef.current.close();
      }
    };
  }, [connectWs, fetchInitialState]);

  const syncHold = useCallback((courtId: string, date: string, slots: number[]) => {
    const payload = { courtId, date, slots };
    pendingHoldRef.current = payload;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'hold:sync', payload }));
    }
  }, []);

  const unlockManagement = useCallback(async (passcode: string): Promise<void> => {
    const cleaned = passcode.trim();

    if (backendMode !== 'local') {
      try {
        const res = await fetch('/api/management/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: cleaned }),
        });
        const { isJson, data } = await parseJsonResponse<{
          ok?: boolean;
          token?: string;
          error?: string;
        }>(res);

        if (isJson && data) {
          if (!res.ok || !data.token) {
            throw new Error(data.error || 'Sandi salah. Silakan coba kembali.');
          }
          try {
            sessionStorage.setItem('smash_mgmt_token', data.token);
          } catch {
            // Ignore storage errors
          }
          setManagementToken(data.token);
          return;
        }
      } catch (err) {
        // Re-throw real auth rejection (wrong password); only fall back on network/non-JSON static host
        if (err instanceof Error && err.message.toLowerCase().includes('sandi')) {
          throw err;
        }
      }
    }

    // Static hosting (Vercel) fallback verification
    if (cleaned !== LOCAL_PASSCODE) {
      throw new Error('Sandi salah. Silakan coba kembali.');
    }
    try {
      sessionStorage.setItem('smash_mgmt_token', LOCAL_TOKEN);
    } catch {
      // Ignore storage errors
    }
    setManagementToken(LOCAL_TOKEN);
  }, [backendMode]);

  const lockManagement = useCallback(() => {
    try {
      sessionStorage.removeItem('smash_mgmt_token');
    } catch {
      // Ignore storage failures
    }
    setManagementToken(null);
  }, []);

  const createBooking = useCallback(
    async (input: CreateBookingInput): Promise<Booking> => {
      if (backendMode !== 'local') {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (managementToken) {
            headers['x-management-token'] = managementToken;
          }
          const res = await fetch('/api/bookings', {
            method: 'POST',
            headers,
            body: JSON.stringify(input),
          });
          const { isJson, data } = await parseJsonResponse<Booking & { error?: string }>(res);
          if (isJson && data) {
            if (!res.ok) {
              if (res.status === 401) lockManagement();
              throw new Error(data.error || 'Gagal membuat pemesanan.');
            }
            setBookings((prev) => (prev.some((b) => b.id === data.id) ? prev : [data, ...prev]));
            return data;
          }
        } catch (err) {
          if (err instanceof Error && !err.message.includes('Failed to fetch')) {
            throw err;
          }
        }
      }

      // Local fallback mode
      const current = loadLocalDb();
      const court = current.courts.find((c) => c.id === input.courtId);
      if (!court) throw new Error('Lapangan tidak ditemukan.');
      if (court.status === 'maintenance' && input.kind !== 'maintenance') {
        throw new Error(`${court.name} sedang dalam status perawatan.`);
      }

      const normalizedSlots = Array.from(
        new Set(input.slots.map(Number).filter((hr) => OPERATING_HOURS.includes(hr)))
      ).sort((a, b) => a - b);
      if (normalizedSlots.length === 0) {
        throw new Error('Slot jam yang dipilih tidak valid.');
      }

      const conflict = current.bookings.find(
        (b) =>
          b.courtId === input.courtId &&
          b.date === input.date &&
          b.status !== 'Dibatalkan' &&
          b.slots.some((s) => normalizedSlots.includes(s))
      );
      if (conflict) {
        throw new Error(
          `Slot bentrok dengan kode booking ${conflict.bookingCode} (${conflict.customerName}).`
        );
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

      const subtotal =
        input.kind === 'maintenance' ? 0 : normalizedSlots.length * court.hourlyPrice;
      const addonTotal = resolvedAddons.reduce((sum, a) => sum + a.price * a.qty, 0);
      const nowIso = new Date().toISOString();

      const created: Booking = {
        id: `bk-${Math.random().toString(36).slice(2, 10)}`,
        bookingCode: generateLocalBookingCode(),
        courtId: input.courtId,
        date: input.date,
        slots: normalizedSlots,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim() || '-',
        customerEmail: input.customerEmail,
        paymentMethod: 'Bayar di Kasir',
        status: input.status || 'Menunggu',
        kind: input.kind || 'customer',
        addons: resolvedAddons,
        subtotal,
        totalAmount: subtotal + addonTotal,
        notes: input.notes?.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const nextState: LocalDbState = {
        ...current,
        bookings: [created, ...current.bookings],
      };
      broadcastLocalSync(nextState);
      setBookings(nextState.bookings);
      return created;
    },
    [backendMode, broadcastLocalSync, lockManagement, managementToken]
  );

  const updateBooking = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Booking, 'status' | 'notes' | 'paymentMethod' | 'courtId' | 'date' | 'slots'>>
    ): Promise<Booking> => {
      if (backendMode !== 'local') {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (managementToken) {
            headers['x-management-token'] = managementToken;
          }
          const res = await fetch(`/api/bookings/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(patch),
          });
          const { isJson, data } = await parseJsonResponse<Booking & { error?: string }>(res);
          if (isJson && data) {
            if (!res.ok) {
              if (res.status === 401) lockManagement();
              throw new Error(data.error || 'Gagal memperbarui jadwal.');
            }
            setBookings((prev) => prev.map((b) => (b.id === data.id ? data : b)));
            return data;
          }
        } catch (err) {
          if (err instanceof Error && !err.message.includes('Failed to fetch')) {
            throw err;
          }
        }
      }

      const current = loadLocalDb();
      const idx = current.bookings.findIndex((b) => b.id === id);
      if (idx === -1) throw new Error('Data booking tidak ditemukan.');

      const existing = current.bookings[idx];
      const updated: Booking = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      const nextBookings = current.bookings.map((b) => (b.id === id ? updated : b));
      const nextState: LocalDbState = { ...current, bookings: nextBookings };
      broadcastLocalSync(nextState);
      setBookings(nextBookings);
      return updated;
    },
    [backendMode, broadcastLocalSync, lockManagement, managementToken]
  );

  const deleteBooking = useCallback(
    async (id: string): Promise<void> => {
      if (backendMode !== 'local') {
        try {
          const headers: Record<string, string> = {};
          if (managementToken) {
            headers['x-management-token'] = managementToken;
          }
          const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE', headers });
          const { isJson, data } = await parseJsonResponse<{ error?: string }>(res);
          if (isJson && data) {
            if (!res.ok) {
              if (res.status === 401) lockManagement();
              throw new Error(data.error || 'Gagal menghapus data booking.');
            }
            setBookings((prev) => prev.filter((b) => b.id !== id));
            return;
          }
        } catch (err) {
          if (err instanceof Error && !err.message.includes('Failed to fetch')) {
            throw err;
          }
        }
      }

      const current = loadLocalDb();
      const nextBookings = current.bookings.filter((b) => b.id !== id);
      const nextState: LocalDbState = { ...current, bookings: nextBookings };
      broadcastLocalSync(nextState);
      setBookings(nextBookings);
    },
    [backendMode, broadcastLocalSync, lockManagement, managementToken]
  );

  const updateCourt = useCallback(
    async (
      id: string,
      patch: { status?: CourtStatus; hourlyPrice?: number }
    ): Promise<Court> => {
      if (backendMode !== 'local') {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (managementToken) {
            headers['x-management-token'] = managementToken;
          }
          const res = await fetch(`/api/courts/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(patch),
          });
          const { isJson, data } = await parseJsonResponse<Court & { error?: string }>(res);
          if (isJson && data) {
            if (!res.ok) {
              if (res.status === 401) lockManagement();
              throw new Error(data.error || 'Gagal memperbarui status lapangan.');
            }
            setCourts((prev) => prev.map((c) => (c.id === data.id ? data : c)));
            return data;
          }
        } catch (err) {
          if (err instanceof Error && !err.message.includes('Failed to fetch')) {
            throw err;
          }
        }
      }

      const current = loadLocalDb();
      const existing = current.courts.find((c) => c.id === id);
      if (!existing) throw new Error('Lapangan tidak ditemukan.');

      const updated: Court = {
        ...existing,
        status: patch.status ?? existing.status,
        hourlyPrice:
          typeof patch.hourlyPrice === 'number' && patch.hourlyPrice >= 5000
            ? patch.hourlyPrice
            : existing.hourlyPrice,
      };
      const nextCourts = current.courts.map((c) => (c.id === id ? updated : c));
      const nextState: LocalDbState = { ...current, courts: nextCourts };
      broadcastLocalSync(nextState);
      setCourts(nextCourts);
      return updated;
    },
    [backendMode, broadcastLocalSync, lockManagement, managementToken]
  );

  return {
    courts,
    bookings,
    holds,
    onlineCount,
    connectionStatus,
    isLoading,
    lastSyncedAt,
    isManagementUnlocked: Boolean(managementToken),
    unlockManagement,
    lockManagement,
    syncHold,
    createBooking,
    updateBooking,
    deleteBooking,
    updateCourt,
  };
}
