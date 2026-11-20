export type CourtCategory = 'keramik';

export type CourtStatus = 'active' | 'maintenance';

export type BookingStatus =
  | 'Menunggu'
  | 'Lunas'
  | 'Check-In'
  | 'Selesai'
  | 'Dibatalkan';

export type BookingKind = 'customer' | 'tournament' | 'maintenance';

export type PaymentMethod = 'Bayar di Kasir';

export interface Court {
  id: string;
  name: string;
  code: string;
  category: CourtCategory;
  categoryLabel: string;
  surface: string;
  lighting: string;
  status: CourtStatus;
  hourlyPrice: number;
  imageUrl: string;
}

export interface BookingAddon {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface Booking {
  id: string;
  bookingCode: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  slots: number[]; // Hour integers e.g. [18, 19] meaning 18:00-20:00
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod: PaymentMethod;
  status: BookingStatus;
  kind: BookingKind;
  addons: BookingAddon[];
  subtotal: number;
  totalAmount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlotHold {
  key: string; // `${courtId}:${date}:${hour}`
  courtId: string;
  date: string;
  hour: number;
  clientId: string;
  expiresAt: number;
}

export interface ArenaStatePayload {
  courts: Court[];
  bookings: Booking[];
  holds: SlotHold[];
  onlineCount: number;
  serverTime: string;
}

export type WsServerMessage =
  | { type: 'init'; payload: ArenaStatePayload }
  | { type: 'booking:created'; payload: Booking }
  | { type: 'booking:updated'; payload: Booking }
  | { type: 'booking:deleted'; payload: { id: string } }
  | { type: 'court:updated'; payload: Court }
  | { type: 'holds:updated'; payload: SlotHold[] }
  | { type: 'presence:update'; payload: { onlineCount: number } };

export const OPERATING_HOURS: number[] = Array.from(
  { length: 16 },
  (_, idx) => 8 + idx
); // 08:00 .. 23:00 (last slot 23:00 - 00:00)

export const ADDON_CATALOG: Array<{
  id: string;
  name: string;
  unit: string;
  price: number;
  maxQty: number;
}> = [
  {
    id: 'sewa-raket',
    name: 'Sewa Raket',
    unit: 'per raket / sesi',
    price: 10000,
    maxQty: 12,
  },
  {
    id: 'beli-cock',
    name: 'Beli Cock (Per Biji)',
    unit: 'per biji',
    price: 12000,
    maxQty: 36,
  },
];

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCompactRupiah(amount: number): string {
  if (amount >= 1000) {
    const thousands = Math.round(amount / 1000);
    return `Rp ${thousands}rb`;
  }
  return `Rp ${amount}`;
}

export function formatClockHour(hour: number): string {
  if (hour === 24 || hour === 0) return '00:00';
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatHourRange(hour: number): string {
  return `${formatClockHour(hour)} – ${formatClockHour(hour + 1)}`;
}

export function formatSlotList(slots: number[]): string {
  if (slots.length === 0) return '-';
  const sorted = [...slots].sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push(`${formatClockHour(rangeStart)}–${formatClockHour(prev + 1)}`);
      rangeStart = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(`${formatClockHour(rangeStart)}–${formatClockHour(prev + 1)}`);
  return ranges.join(', ');
}

export function getCurrentWibDateAndHour(now: Date = new Date()): {
  dateIso: string;
  hour: number;
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const rawHour = Number(get('hour'));
    const hour = rawHour === 24 ? 0 : rawHour;
    if (year && month && day && Number.isFinite(hour)) {
      return { dateIso: `${year}-${month}-${day}`, hour };
    }
  } catch {
    // Fallback to local clock if Intl timeZone is unavailable
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { dateIso: `${year}-${month}-${day}`, hour: now.getHours() };
}

export function getTodayIsoDate(): string {
  return getCurrentWibDateAndHour().dateIso;
}

export function isSlotPast(isoDate: string, hour: number, now: Date = new Date()): boolean {
  const wib = getCurrentWibDateAndHour(now);
  if (isoDate < wib.dateIso) return true;
  if (isoDate > wib.dateIso) return false;
  return hour <= wib.hour;
}

export function addDaysIsoDate(baseIso: string, delta: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatIndonesianDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export const VENUE_WHATSAPP_NUMBER = '082142272367';
export const VENUE_GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/xqv1zkGD8SwRxFT86';

export function normalizeWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function buildWhatsAppMessage(booking: Booking, courtName: string): string {
  const addonLines =
    booking.addons.length > 0
      ? `\nTambahan: ${booking.addons.map((a) => `${a.name} (${a.qty}x)`).join(', ')}`
      : '';

  const notesLine = booking.notes ? `\nCatatan: ${booking.notes}` : '';

  return [
    `*KONFIRMASI BOOKING — SMASH ARENA*`,
    `Lokasi: Lapangan Manisrejo, Magetan`,
    ``,
    `Kode Booking: *${booking.bookingCode}*`,
    `Nama Pemesan: ${booking.customerName}`,
    `No. WhatsApp: ${booking.customerPhone}`,
    `Lapangan: ${courtName} (Lantai Keramik)`,
    `Tanggal: ${formatIndonesianDate(booking.date)}`,
    `Jam Bermain: ${formatSlotList(booking.slots)} WIB`,
    `Status Pembayaran: *${booking.status}* (${booking.paymentMethod})`,
    `Total Tagihan: *${formatRupiah(booking.totalAmount)}*${addonLines}${notesLine}`,
    ``,
    `Lokasi Google Maps: ${VENUE_GOOGLE_MAPS_URL}`,
    `Terima kasih telah bermain di Smash Arena.`,
  ].join('\n');
}

export function buildWhatsAppConfirmationUrl(
  booking: Booking,
  courtName: string,
  targetPhone?: string
): string | null {
  const waNumber = normalizeWhatsAppNumber(targetPhone || booking.customerPhone);
  if (!waNumber) return null;
  const message = buildWhatsAppMessage(booking, courtName);
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}


