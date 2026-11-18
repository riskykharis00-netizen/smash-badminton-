import {
  CheckCircle2,
  Eye,
  Lock,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { ConnectionStatus, CreateBookingInput } from '../hooks/useArenaRealtime';
import {
  OPERATING_HOURS,
  buildWhatsAppConfirmationUrl,
  formatClockHour,
  formatIndonesianDate,
  formatRupiah,
  formatSlotList,
  getTodayIsoDate,
  type Booking,
  type BookingKind,
  type BookingStatus,
  type Court,
  type CourtStatus,
  type PaymentMethod,
} from '../types/booking';

interface ManagementDashboardProps {
  courts: Court[];
  bookings: Booking[];
  connectionStatus: ConnectionStatus;
  onlineCount: number;
  isLoading: boolean;
  onCreateBooking: (input: CreateBookingInput) => Promise<Booking>;
  onUpdateBooking: (
    id: string,
    patch: Partial<Pick<Booking, 'status' | 'notes' | 'paymentMethod'>>
  ) => Promise<Booking>;
  onDeleteBooking: (id: string) => Promise<void>;
  onUpdateCourt: (
    id: string,
    patch: { status?: CourtStatus; hourlyPrice?: number }
  ) => Promise<Court>;
  onLockManagement: () => void;
}

export function ManagementDashboard({
  courts,
  bookings,
  connectionStatus,
  onlineCount,
  isLoading,
  onCreateBooking,
  onUpdateBooking,
  onDeleteBooking,
  onUpdateCourt,
  onLockManagement,
}: ManagementDashboardProps) {
  const todayIso = useMemo(() => getTodayIsoDate(), []);
  const [activeTab, setActiveTab] = useState<'schedule' | 'courts'>('schedule');
  const [dateFilter, setDateFilter] = useState<string>(todayIso);
  const [statusFilter, setStatusFilter] = useState<'Semua' | BookingStatus>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<'walkin' | 'block' | null>(null);
  const [formCourtId, setFormCourtId] = useState<string>(courts[0]?.id || 'court-a');
  const [formDate, setFormDate] = useState<string>(todayIso);
  const [formSlots, setFormSlots] = useState<number[]>([]);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPayment, setFormPayment] = useState<PaymentMethod>('Bayar di Kasir');
  const [formStatus, setFormStatus] = useState<BookingStatus>('Lunas');
  const [formKind, setFormKind] = useState<BookingKind>('customer');
  const [formNotes, setFormNotes] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});

  const kpiDate = dateFilter || todayIso;
  const kpiMetrics = useMemo(() => {
    const dayBookings = bookings.filter(
      (b) => b.date === kpiDate && b.status !== 'Dibatalkan'
    );
    const bookedSlots = dayBookings.reduce((sum, b) => sum + b.slots.length, 0);
    const totalCapacity =
      courts.filter((c) => c.status === 'active').length * OPERATING_HOURS.length;
    const occupancyPct = totalCapacity > 0 ? Math.round((bookedSlots / totalCapacity) * 100) : 0;
    const activeCount = dayBookings.filter((b) =>
      ['Menunggu', 'Lunas', 'Check-In'].includes(b.status)
    ).length;
    const checkInCount = dayBookings.filter((b) => b.status === 'Check-In').length;
    const revenue = dayBookings.reduce((sum, b) => sum + b.totalAmount, 0);

    return {
      bookedSlots,
      totalCapacity,
      occupancyPct,
      activeCount,
      checkInCount,
      revenue,
    };
  }, [bookings, courts, kpiDate]);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (dateFilter && b.date !== dateFilter) return false;
        if (statusFilter !== 'Semua' && b.status !== statusFilter) return false;
        if (q) {
          const matchCode = b.bookingCode.toLowerCase().includes(q);
          const matchName = b.customerName.toLowerCase().includes(q);
          const matchPhone = b.customerPhone.toLowerCase().includes(q);
          if (!matchCode && !matchName && !matchPhone) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.slots[0] ?? 0) - (b.slots[0] ?? 0);
      });
  }, [bookings, dateFilter, searchQuery, statusFilter]);

  const openModal = (kindMode: 'walkin' | 'block') => {
    setModalMode(kindMode);
    setFormCourtId(courts[0]?.id || 'court-a');
    setFormDate(dateFilter || todayIso);
    setFormSlots([]);
    setFormName(kindMode === 'block' ? 'Turnamen Internal' : '');
    setFormPhone(kindMode === 'block' ? '-' : '');
    setFormPayment('Bayar di Kasir');
    setFormStatus(kindMode === 'block' ? 'Lunas' : 'Check-In');
    setFormKind(kindMode === 'block' ? 'tournament' : 'customer');
    setFormNotes('');
    setModalError(null);
  };

  const occupiedSlotsInModal = useMemo(() => {
    const set = new Set<number>();
    bookings
      .filter(
        (b) =>
          b.courtId === formCourtId &&
          b.date === formDate &&
          b.status !== 'Dibatalkan'
      )
      .forEach((b) => b.slots.forEach((s) => set.add(s)));
    return set;
  }, [bookings, formCourtId, formDate]);

  const handleModalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (formSlots.length === 0) {
      setModalError('Pilih minimal satu jam pada lapangan tersebut.');
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      await onCreateBooking({
        courtId: formCourtId,
        date: formDate,
        slots: formSlots,
        customerName: formName.trim(),
        customerPhone: formPhone.trim() || '-',
        paymentMethod: formPayment,
        status: formStatus,
        kind: formKind,
        notes: formNotes.trim() || undefined,
      });
      setModalMode(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal menyimpan jadwal.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleStatusUpdate = async (bookingId: string, nextStatus: BookingStatus) => {
    setActionError(null);
    try {
      await onUpdateBooking(bookingId, { status: nextStatus });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengubah status.');
    }
  };

  const handleDelete = async (bookingId: string) => {
    setActionError(null);
    try {
      await onDeleteBooking(bookingId);
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus booking.');
    }
  };

  const statusTextStyle = (status: BookingStatus) => {
    switch (status) {
      case 'Lunas':
        return 'text-emerald-700 font-semibold';
      case 'Check-In':
        return 'text-sky-700 font-semibold';
      case 'Menunggu':
        return 'text-amber-700 font-semibold';
      case 'Selesai':
        return 'text-slate-600 font-medium';
      case 'Dibatalkan':
        return 'text-rose-700 font-medium';
    }
  };

  return (
    <section className="min-h-[calc(100vh-140px)] bg-slate-50 py-10">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Konsol Pengelola Arena (Lapangan A & B)</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                {connectionStatus === 'connected' ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                    Sinkronisasi Live ({onlineCount} terhubung)
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                    Menyambung ulang...
                  </>
                )}
              </span>
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Manajemen Jadwal Real-Time
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openModal('block')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Blokir Turnamen / Perawatan</span>
            </button>

            <button
              type="button"
              onClick={() => openModal('walkin')}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Input Booking Walk-In</span>
            </button>

            <button
              type="button"
              onClick={onLockManagement}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Kunci</span>
            </button>
          </div>
        </div>

        {/* 4-Card KPI Strip */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">
              Okupansi ({dateFilter ? dateFilter : 'Hari Ini'})
            </p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
              {kpiMetrics.occupancyPct}%
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
              {kpiMetrics.bookedSlots} / {kpiMetrics.totalCapacity} slot terisi
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Transaksi Aktif</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
              {kpiMetrics.activeCount} Booking
            </p>
            <p className="mt-1 text-xs text-slate-500">Menunggu, Lunas & Check-In</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Pendapatan Terjadwal</p>
            <p className="mt-2 font-display text-3xl font-bold text-emerald-700 tabular-nums">
              {formatRupiah(kpiMetrics.revenue)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Termasuk sewa raket & cock</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Sedang Check-In</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
              {kpiMetrics.checkInCount} Sesi
            </p>
            <p className="mt-1 text-xs text-slate-500">Tercatat hadir di arena</p>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'schedule'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daftar Jadwal & Transaksi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('courts')}
              className={`rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'courts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kontrol Lapangan & Tarif
            </button>
          </div>
        </div>

        {actionError && (
          <div
            role="alert"
            className="mt-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700"
          >
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kode, nama, atau WhatsApp..."
                    className="w-64 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Filter tanggal"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-emerald-600 focus:outline-none tabular-nums"
                  />
                  {dateFilter && (
                    <button
                      type="button"
                      onClick={() => setDateFilter('')}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      Semua Tanggal
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
                {(['Semua', 'Menunggu', 'Lunas', 'Check-In', 'Selesai', 'Dibatalkan'] as const).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        statusFilter === st
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st}
                    </button>
                  )
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  Tidak ada jadwal booking yang cocok
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ubah filter tanggal/status atau tambahkan pemesanan walk-in baru.
                </p>
                <button
                  type="button"
                  onClick={() => openModal('walkin')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Input Booking Pertama</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">Kode</th>
                      <th className="px-4 py-3">Tanggal & Jam</th>
                      <th className="px-4 py-3">Lapangan</th>
                      <th className="px-4 py-3">Pemesan / Acara</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredBookings.map((booking) => {
                      const court = courts.find((c) => c.id === booking.courtId);
                      return (
                        <tr key={booking.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                            {booking.bookingCode}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs font-medium text-slate-900 tabular-nums">
                              {booking.date}
                            </div>
                            <div className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                              {formatSlotList(booking.slots)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-xs font-semibold text-slate-900">
                              {court?.name || booking.courtId}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {court?.categoryLabel}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-slate-900">
                              {booking.customerName}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {booking.customerPhone} · {booking.paymentMethod}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatRupiah(booking.totalAmount)}
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <span className={statusTextStyle(booking.status)}>
                              {booking.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDetailBookingId(booking.id)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Detail</span>
                              </button>

                              {booking.status === 'Menunggu' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(booking.id, 'Lunas')}
                                  className="rounded border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                                >
                                  Lunasi
                                </button>
                              )}
                              {booking.status === 'Lunas' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(booking.id, 'Check-In')}
                                  className="rounded border border-sky-600 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer"
                                >
                                  Check-In
                                </button>
                              )}
                              {booking.status === 'Check-In' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(booking.id, 'Selesai')}
                                  className="rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200 cursor-pointer"
                                >
                                  Selesai
                                </button>
                              )}
                              {booking.status !== 'Dibatalkan' &&
                                booking.status !== 'Selesai' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusUpdate(booking.id, 'Dibatalkan')}
                                    className="rounded border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-rose-300 hover:text-rose-700 cursor-pointer"
                                  >
                                    Batalkan
                                  </button>
                                )}

                              {confirmDeleteId === booking.id ? (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(booking.id)}
                                  className="rounded bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                >
                                  Konfirmasi Hapus
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Hapus booking ${booking.bookingCode}`}
                                  onClick={() => setConfirmDeleteId(booking.id)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'courts' && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {courts.map((court) => {
              const draftPrice = priceEdits[court.id] ?? court.hourlyPrice;
              const isDirty = draftPrice !== court.hourlyPrice;

              return (
                <div
                  key={court.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-slate-500">
                          {court.surface}
                        </p>
                        <h3 className="mt-0.5 font-display text-2xl font-bold text-slate-900">
                          {court.name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCourt(court.id, {
                            status: court.status === 'active' ? 'maintenance' : 'active',
                          })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                          court.status === 'active'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        {court.status === 'active' ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Operasional</span>
                          </>
                        ) : (
                          <>
                            <Wrench className="h-3.5 w-3.5" />
                            <span>Perawatan</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      {court.lighting} · Jam buka 08.00 – 00.00 WIB
                    </p>

                    <div className="mt-4">
                      <label className="block text-xs font-semibold text-slate-600">
                        Tarif Sewa per Jam (Rp)
                      </label>
                      <input
                        type="number"
                        step={1000}
                        min={5000}
                        value={draftPrice}
                        onChange={(e) =>
                          setPriceEdits((prev) => ({
                            ...prev,
                            [court.id]: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-semibold text-slate-900 tabular-nums focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">
                      {court.status === 'active'
                        ? 'Terbuka untuk pemesanan online'
                        : 'Tertutup di matriks pelanggan'}
                    </span>
                    {isDirty && (
                      <button
                        type="button"
                        onClick={() => onUpdateCourt(court.id, { hourlyPrice: draftPrice })}
                        className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                      >
                        Simpan Tarif
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Walk-In / Block Slot Modal */}
      {modalMode && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  {modalMode === 'walkin' ? 'Resepsionis Arena' : 'Pengaturan Jadwal Khusus'}
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  {modalMode === 'walkin'
                    ? 'Input Booking Walk-In'
                    : 'Blokir Jadwal Turnamen / Perawatan'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Lapangan</label>
                  <select
                    value={formCourtId}
                    onChange={(e) => {
                      setFormCourtId(e.target.value);
                      setFormSlots([]);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                  >
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.categoryLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => {
                      setFormDate(e.target.value);
                      setFormSlots([]);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Pilih Slot Jam ({formatIndonesianDate(formDate)})
                </p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {OPERATING_HOURS.map((hr) => {
                    const occupied = occupiedSlotsInModal.has(hr);
                    const selected = formSlots.includes(hr);
                    return (
                      <button
                        key={hr}
                        type="button"
                        disabled={occupied}
                        onClick={() =>
                          setFormSlots((prev) =>
                            prev.includes(hr)
                              ? prev.filter((item) => item !== hr)
                              : [...prev, hr].sort((a, b) => a - b)
                          )
                        }
                        className={`rounded-md border px-2 py-2 font-mono text-[11px] font-semibold tabular-nums transition-colors ${
                          occupied
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through'
                            : selected
                            ? 'cursor-pointer border-emerald-600 bg-emerald-600 text-white'
                            : 'cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-emerald-600'
                        }`}
                      >
                        {formatClockHour(hr)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {modalMode === 'block' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Jenis Blokir</label>
                  <select
                    value={formKind}
                    onChange={(e) => setFormKind(e.target.value as BookingKind)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                  >
                    <option value="tournament">Turnamen / Latihan Khusus</option>
                    <option value="maintenance">Perawatan / Perbaikan Lapangan</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {modalMode === 'walkin' ? 'Nama Tamu / Tim' : 'Keterangan Acara'}
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nama pemesan atau nama acara"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              {modalMode === 'walkin' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">No. WhatsApp</label>
                    <input
                      type="tel"
                      required
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="082142272367"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Status Awal</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as BookingStatus)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    >
                      <option value="Check-In">Check-In (Langsung Main)</option>
                      <option value="Lunas">Lunas</option>
                      <option value="Menunggu">Menunggu Pembayaran</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700">Catatan</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Catatan tambahan (opsional)"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              {modalError && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {modalError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {modalSaving ? 'Menyimpan...' : 'Simpan ke Jadwal Live'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking Details Modal with WhatsApp Confirmation */}
      {(() => {
        const detailBooking = detailBookingId
          ? bookings.find((b) => b.id === detailBookingId) || null
          : null;
        if (!detailBooking) return null;
        const courtName =
          courts.find((c) => c.id === detailBooking.courtId)?.name || detailBooking.courtId;
        const waUrl = buildWhatsAppConfirmationUrl(detailBooking, courtName);

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-detail-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs font-bold text-emerald-700">
                    {detailBooking.bookingCode}
                  </p>
                  <h2
                    id="admin-detail-title"
                    className="mt-1 font-display text-2xl font-bold text-slate-900"
                  >
                    Detail Pemesanan
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Tutup detail pemesanan"
                  onClick={() => setDetailBookingId(null)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Nama Pemesan</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {detailBooking.customerName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Nomor WhatsApp</dt>
                  <dd className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                    {detailBooking.customerPhone}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Lapangan</dt>
                  <dd className="font-medium text-slate-900">{courtName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Tanggal</dt>
                  <dd className="font-medium text-slate-900 text-right">
                    {formatIndonesianDate(detailBooking.date)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Jam Bermain</dt>
                  <dd className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                    {formatSlotList(detailBooking.slots)} WIB
                  </dd>
                </div>
                {detailBooking.addons.length > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Tambahan</dt>
                    <dd className="text-right text-xs font-medium text-slate-800">
                      {detailBooking.addons.map((a) => `${a.name} ×${a.qty}`).join(', ')}
                    </dd>
                  </div>
                )}
                {detailBooking.notes && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Catatan</dt>
                    <dd className="text-right text-xs text-slate-700">{detailBooking.notes}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Status</dt>
                  <dd className={statusTextStyle(detailBooking.status)}>
                    {detailBooking.status} · {detailBooking.paymentMethod}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base font-bold">
                  <dt className="text-slate-900">Total Tagihan</dt>
                  <dd className="font-mono text-slate-900 tabular-nums">
                    {formatRupiah(detailBooking.totalAmount)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-col gap-2.5">
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Kirim Konfirmasi WhatsApp</span>
                  </a>
                ) : (
                  <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs text-slate-500">
                    Nomor WhatsApp tidak tersedia untuk jadwal blokir internal ini.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setDetailBookingId(null)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
