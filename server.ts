import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import type {
  ArenaStatePayload,
  Booking,
  BookingAddon,
  BookingKind,
  BookingStatus,
  Court,
  PaymentMethod,
  SlotHold,
  WsServerMessage,
} from './src/types/booking.ts';
import {
  ADDON_CATALOG,
  OPERATING_HOURS,
  addDaysIsoDate,
  getTodayIsoDate,
} from './src/types/booking.ts';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'arena-state.json');
const DB_SCHEMA_VERSION = 4;
const MANAGEMENT_PASSCODE = process.env.MANAGEMENT_PASSCODE || '00000';
const MANAGEMENT_TOKEN = crypto
  .createHmac('sha256', process.cwd() + ':smash-arena-mgmt')
  .update(MANAGEMENT_PASSCODE)
  .digest('hex');

function isManagementAuthorized(req: express.Request): boolean {
  const token = req.header('x-management-token');
  return typeof token === 'string' && token === MANAGEMENT_TOKEN;
}

interface PersistedDb {
  version: number;
  courts: Court[];
  bookings: Booking[];
}

function buildDefaultCourts(): Court[] {
  return [
    {
      id: 'court-a',
      name: 'Lapangan A',
      code: 'A',
      category: 'keramik',
      categoryLabel: 'Lantai Keramik',
      surface: 'Keramik Indoor Halus & Rata',
      lighting: 'Lampu LED Terang · Net Standar',
      status: 'active',
      hourlyPrice: 15000,
      imageUrl: '/src/assets/images/court_keramik_1795043294100.jpg',
    },
    {
      id: 'court-b',
      name: 'Lapangan B',
      code: 'B',
      category: 'keramik',
      categoryLabel: 'Lantai Keramik',
      surface: 'Keramik Indoor Halus & Rata',
      lighting: 'Lampu LED Terang · Net Standar',
      status: 'active',
      hourlyPrice: 15000,
      imageUrl: '/src/assets/images/court_keramik_1795043294100.jpg',
    },
  ];
}

function buildSeedBookings(courts: Court[]): Booking[] {
  const today = getTodayIsoDate();
  const tomorrow = addDaysIsoDate(today, 1);
  const nowIso = new Date().toISOString();

  const priceFor = (courtId: string, slots: number[]) => {
    const c = courts.find((item) => item.id === courtId);
    if (!c) return 0;
    return slots.length * c.hourlyPrice;
  };

  return [
    {
      id: 'bk-seed-1',
      bookingCode: 'SM-A101',
      courtId: 'court-a',
      date: today,
      slots: [9, 10],
      customerName: 'Raka Pratama',
      customerPhone: '082142272367',
      paymentMethod: 'Bayar di Kasir',
      status: 'Selesai',
      kind: 'customer',
      addons: [{ id: 'beli-cock', name: 'Beli Cock (Per Biji)', price: 12000, qty: 2 }],
      subtotal: priceFor('court-a', [9, 10]),
      totalAmount: priceFor('court-a', [9, 10]) + 24000,
      notes: 'Main pagi ganda',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'bk-seed-2',
      bookingCode: 'SM-A102',
      courtId: 'court-a',
      date: today,
      slots: [19, 20],
      customerName: 'Komunitas Manisrejo',
      customerPhone: '082142272367',
      paymentMethod: 'Bayar di Kasir',
      status: 'Lunas',
      kind: 'customer',
      addons: [
        { id: 'sewa-raket', name: 'Sewa Raket', price: 10000, qty: 2 },
        { id: 'beli-cock', name: 'Beli Cock (Per Biji)', price: 12000, qty: 3 },
      ],
      subtotal: priceFor('court-a', [19, 20]),
      totalAmount: priceFor('court-a', [19, 20]) + 20000 + 36000,
      notes: 'Mabar malam',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'bk-seed-3',
      bookingCode: 'SM-B103',
      courtId: 'court-b',
      date: today,
      slots: [18, 19],
      customerName: 'Dina & Tim',
      customerPhone: '082142272367',
      paymentMethod: 'Bayar di Kasir',
      status: 'Check-In',
      kind: 'customer',
      addons: [{ id: 'sewa-raket', name: 'Sewa Raket', price: 10000, qty: 1 }],
      subtotal: priceFor('court-b', [18, 19]),
      totalAmount: priceFor('court-b', [18, 19]) + 10000,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'bk-seed-4',
      bookingCode: 'SM-B104',
      courtId: 'court-b',
      date: today,
      slots: [21, 22],
      customerName: 'Hendra Wijaya',
      customerPhone: '082142272367',
      paymentMethod: 'Bayar di Kasir',
      status: 'Menunggu',
      kind: 'customer',
      addons: [{ id: 'beli-cock', name: 'Beli Cock (Per Biji)', price: 12000, qty: 4 }],
      subtotal: priceFor('court-b', [21, 22]),
      totalAmount: priceFor('court-b', [21, 22]) + 48000,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'bk-seed-5',
      bookingCode: 'SM-A105',
      courtId: 'court-a',
      date: tomorrow,
      slots: [20, 21, 22],
      customerName: 'Budi Santoso',
      customerPhone: '082142272367',
      paymentMethod: 'Bayar di Kasir',
      status: 'Lunas',
      kind: 'customer',
      addons: [],
      subtotal: priceFor('court-a', [20, 21, 22]),
      totalAmount: priceFor('court-a', [20, 21, 22]),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

function loadOrInitDb(): PersistedDb {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedDb;
      if (
        parsed.version === DB_SCHEMA_VERSION &&
        Array.isArray(parsed.courts) &&
        Array.isArray(parsed.bookings)
      ) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed reading arena DB, resetting to seed state:', err);
  }

  const courts = buildDefaultCourts();
  const bookings = buildSeedBookings(courts);
  const initial: PersistedDb = { version: DB_SCHEMA_VERSION, courts, bookings };
  saveDb(initial);
  return initial;
}

function saveDb(state: PersistedDb): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

const db: PersistedDb = loadOrInitDb();
const activeHolds = new Map<string, SlotHold>();
const HOLD_TTL_MS = 120_000;

function pruneExpiredHolds(): boolean {
  const now = Date.now();
  let changed = false;
  for (const [key, hold] of activeHolds.entries()) {
    if (hold.expiresAt <= now) {
      activeHolds.delete(key);
      changed = true;
    }
  }
  return changed;
}

function generateBookingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SM-${suffix}`;
}

function calculateSlotSubtotal(court: Court, slots: number[]): number {
  return slots.length * court.hourlyPrice;
}

function hasSlotConflict(
  courtId: string,
  date: string,
  slots: number[],
  excludeBookingId?: string
): Booking | undefined {
  return db.bookings.find(
    (b) =>
      b.id !== excludeBookingId &&
      b.courtId === courtId &&
      b.date === date &&
      b.status !== 'Dibatalkan' &&
      b.slots.some((s) => slots.includes(s))
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const clientIds = new Map<WebSocket, string>();

  function broadcast(message: WsServerMessage) {
    const encoded = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encoded);
      }
    }
  }

  function buildStatePayload(): ArenaStatePayload {
    pruneExpiredHolds();
    return {
      courts: db.courts,
      bookings: db.bookings,
      holds: Array.from(activeHolds.values()),
      onlineCount: wss.clients.size,
      serverTime: new Date().toISOString(),
    };
  }

  setInterval(() => {
    if (pruneExpiredHolds()) {
      broadcast({ type: 'holds:updated', payload: Array.from(activeHolds.values()) });
    }
  }, 15_000);

  wss.on('connection', (ws) => {
    const cid = crypto.randomUUID();
    clientIds.set(ws, cid);

    const initMsg: WsServerMessage = {
      type: 'init',
      payload: buildStatePayload(),
    };
    ws.send(JSON.stringify(initMsg));
    broadcast({ type: 'presence:update', payload: { onlineCount: wss.clients.size } });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          payload?: { courtId?: string; date?: string; slots?: number[] };
        };

        if (msg.type === 'hold:sync' && msg.payload) {
          const { courtId, date, slots } = msg.payload;
          for (const [key, hold] of activeHolds.entries()) {
            if (hold.clientId === cid) {
              activeHolds.delete(key);
            }
          }
          if (courtId && date && Array.isArray(slots)) {
            const expiresAt = Date.now() + HOLD_TTL_MS;
            for (const hour of slots) {
              if (OPERATING_HOURS.includes(hour)) {
                const key = `${courtId}:${date}:${hour}`;
                const existing = activeHolds.get(key);
                if (!existing || existing.clientId === cid) {
                  activeHolds.set(key, {
                    key,
                    courtId,
                    date,
                    hour,
                    clientId: cid,
                    expiresAt,
                  });
                }
              }
            }
          }
          broadcast({
            type: 'holds:updated',
            payload: Array.from(activeHolds.values()),
          });
        }
      } catch {
        // Ignore malformed socket frames
      }
    });

    ws.on('close', () => {
      let removed = false;
      for (const [key, hold] of activeHolds.entries()) {
        if (hold.clientId === cid) {
          activeHolds.delete(key);
          removed = true;
        }
      }
      clientIds.delete(ws);
      if (removed) {
        broadcast({
          type: 'holds:updated',
          payload: Array.from(activeHolds.values()),
        });
      }
      broadcast({ type: 'presence:update', payload: { onlineCount: wss.clients.size } });
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, clients: wss.clients.size });
  });

  app.get('/api/state', (_req, res) => {
    res.json(buildStatePayload());
  });

  app.post('/api/management/auth', (req, res) => {
    const passcode = String((req.body as { passcode?: string })?.passcode || '').trim();
    if (passcode !== MANAGEMENT_PASSCODE) {
      res.status(401).json({ error: 'Sandi salah. Silakan coba kembali.' });
      return;
    }
    res.json({ ok: true, token: MANAGEMENT_TOKEN });
  });

  app.get('/api/management/verify', (req, res) => {
    if (!isManagementAuthorized(req)) {
      res.status(401).json({ ok: false, error: 'Sesi manajemen tidak valid.' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/bookings', (req, res) => {
    const {
      courtId,
      date,
      slots,
      customerName,
      customerPhone,
      customerEmail,
      paymentMethod,
      addons,
      notes,
      kind,
      status,
    } = req.body as {
      courtId?: string;
      date?: string;
      slots?: number[];
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      paymentMethod?: PaymentMethod;
      addons?: Array<{ id: string; qty: number }>;
      notes?: string;
      kind?: BookingKind;
      status?: BookingStatus;
    };

    if ((kind === 'tournament' || kind === 'maintenance') && !isManagementAuthorized(req)) {
      res.status(401).json({ error: 'Sandi manajemen diperlukan untuk blokir jadwal.' });
      return;
    }

    if (!courtId || !date || !Array.isArray(slots) || slots.length === 0) {
      res.status(400).json({ error: 'Lapangan, tanggal, dan minimal satu jam wajib dipilih.' });
      return;
    }

    const court = db.courts.find((c) => c.id === courtId);
    if (!court) {
      res.status(404).json({ error: 'Lapangan tidak ditemukan.' });
      return;
    }

    if (court.status === 'maintenance' && kind !== 'maintenance') {
      res.status(409).json({ error: `${court.name} sedang dalam status perawatan.` });
      return;
    }

    const normalizedSlots = Array.from(
      new Set(slots.map(Number).filter((hr) => OPERATING_HOURS.includes(hr)))
    ).sort((a, b) => a - b);

    if (normalizedSlots.length === 0) {
      res.status(400).json({ error: 'Slot jam yang dipilih tidak valid.' });
      return;
    }

    const cleanName = (customerName || '').trim();
    const cleanPhone = (customerPhone || '').trim();

    if (!cleanName || cleanName.length < 2) {
      res.status(400).json({ error: 'Nama pemesan wajib diisi minimal 2 karakter.' });
      return;
    }

    if (kind !== 'tournament' && kind !== 'maintenance' && (!cleanPhone || cleanPhone.length < 8)) {
      res.status(400).json({ error: 'Nomor WhatsApp aktif wajib diisi dengan benar.' });
      return;
    }

    const conflict = hasSlotConflict(courtId, date, normalizedSlots);
    if (conflict) {
      res.status(409).json({
        error: `Slot bentrok dengan kode booking ${conflict.bookingCode} (${conflict.customerName}). Silakan pilih jam lain.`,
      });
      return;
    }

    const resolvedAddons: BookingAddon[] = [];
    if (Array.isArray(addons)) {
      for (const item of addons) {
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
      kind === 'maintenance' ? 0 : calculateSlotSubtotal(court, normalizedSlots);
    const addonTotal = resolvedAddons.reduce((sum, a) => sum + a.price * a.qty, 0);
    const totalAmount = subtotal + addonTotal;

    const validPayment: PaymentMethod = 'Bayar di Kasir';

    const initialStatus: BookingStatus =
      status && ['Menunggu', 'Lunas', 'Check-In', 'Selesai', 'Dibatalkan'].includes(status)
        ? status
        : 'Menunggu';

    const nowIso = new Date().toISOString();
    const newBooking: Booking = {
      id: `bk-${crypto.randomUUID().slice(0, 8)}`,
      bookingCode: generateBookingCode(),
      courtId,
      date,
      slots: normalizedSlots,
      customerName: cleanName,
      customerPhone: cleanPhone || '-',
      customerEmail: customerEmail?.trim() || undefined,
      paymentMethod: validPayment,
      status: initialStatus,
      kind: kind || 'customer',
      addons: resolvedAddons,
      subtotal,
      totalAmount,
      notes: notes?.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.bookings.unshift(newBooking);
    saveDb(db);

    let holdsChanged = false;
    for (const hr of normalizedSlots) {
      const key = `${courtId}:${date}:${hr}`;
      if (activeHolds.delete(key)) {
        holdsChanged = true;
      }
    }

    broadcast({ type: 'booking:created', payload: newBooking });
    if (holdsChanged) {
      broadcast({ type: 'holds:updated', payload: Array.from(activeHolds.values()) });
    }

    res.status(201).json(newBooking);
  });

  app.patch('/api/bookings/:id', (req, res) => {
    if (!isManagementAuthorized(req)) {
      res.status(401).json({ error: 'Sesi manajemen terkunci. Masukkan sandi 00000.' });
      return;
    }
    const { id } = req.params;
    const index = db.bookings.findIndex((b) => b.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Data booking tidak ditemukan.' });
      return;
    }

    const existing = db.bookings[index];
    const { status, notes, paymentMethod, courtId, date, slots } = req.body as {
      status?: BookingStatus;
      notes?: string;
      paymentMethod?: PaymentMethod;
      courtId?: string;
      date?: string;
      slots?: number[];
    };

    const nextCourtId = courtId || existing.courtId;
    const nextDate = date || existing.date;
    const nextSlots =
      Array.isArray(slots) && slots.length > 0
        ? Array.from(new Set(slots.map(Number).filter((hr) => OPERATING_HOURS.includes(hr)))).sort(
            (a, b) => a - b
          )
        : existing.slots;
    const nextStatus = status || existing.status;

    if (nextStatus !== 'Dibatalkan') {
      const conflict = hasSlotConflict(nextCourtId, nextDate, nextSlots, existing.id);
      if (conflict) {
        res.status(409).json({
          error: `Jadwal bentrok dengan ${conflict.bookingCode} (${conflict.customerName}).`,
        });
        return;
      }
    }

    const court = db.courts.find((c) => c.id === nextCourtId);
    const subtotal =
      existing.kind === 'maintenance' || !court
        ? existing.subtotal
        : calculateSlotSubtotal(court, nextSlots);
    const addonTotal = existing.addons.reduce((sum, a) => sum + a.price * a.qty, 0);

    const updated: Booking = {
      ...existing,
      courtId: nextCourtId,
      date: nextDate,
      slots: nextSlots,
      status: nextStatus,
      paymentMethod: paymentMethod || existing.paymentMethod,
      notes: notes !== undefined ? notes : existing.notes,
      subtotal,
      totalAmount: existing.kind === 'maintenance' ? 0 : subtotal + addonTotal,
      updatedAt: new Date().toISOString(),
    };

    db.bookings[index] = updated;
    saveDb(db);
    broadcast({ type: 'booking:updated', payload: updated });

    res.json(updated);
  });

  app.delete('/api/bookings/:id', (req, res) => {
    if (!isManagementAuthorized(req)) {
      res.status(401).json({ error: 'Sesi manajemen terkunci. Masukkan sandi 00000.' });
      return;
    }
    const { id } = req.params;
    const index = db.bookings.findIndex((b) => b.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Data booking tidak ditemukan.' });
      return;
    }

    db.bookings.splice(index, 1);
    saveDb(db);
    broadcast({ type: 'booking:deleted', payload: { id } });

    res.json({ deleted: true, id });
  });

  app.patch('/api/courts/:id', (req, res) => {
    if (!isManagementAuthorized(req)) {
      res.status(401).json({ error: 'Sesi manajemen terkunci. Masukkan sandi 00000.' });
      return;
    }
    const { id } = req.params;
    const index = db.courts.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Lapangan tidak ditemukan.' });
      return;
    }

    const existing = db.courts[index];
    const { status, hourlyPrice } = req.body as {
      status?: 'active' | 'maintenance';
      hourlyPrice?: number;
    };

    const updated: Court = {
      ...existing,
      status:
        status === 'maintenance'
          ? 'maintenance'
          : status === 'active'
          ? 'active'
          : existing.status,
      hourlyPrice:
        typeof hourlyPrice === 'number' && hourlyPrice >= 5000
          ? hourlyPrice
          : existing.hourlyPrice,
    };

    db.courts[index] = updated;
    saveDb(db);
    broadcast({ type: 'court:updated', payload: updated });

    res.json(updated);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Smash Arena server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
