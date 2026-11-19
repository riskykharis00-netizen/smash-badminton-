import {
  addDaysIsoDate,
  getTodayIsoDate,
  type Booking,
  type Court,
} from '../types/booking';

export const DB_SCHEMA_VERSION = 4;

export function buildDefaultCourts(): Court[] {
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

export function buildSeedBookings(courts: Court[]): Booking[] {
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
