import {
  ArrowDown,
  Calendar,
  Check,
  Clock,
  Cloud,
  Copy,
  Database,
  LogOut,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ConnectionStatus, CreateBookingInput } from '../hooks/useArenaRealtime';
import { extractReadableError } from '../lib/firebase';
import { UnauthorizedDomainNotice } from './UnauthorizedDomainNotice';
import {
  ADDON_CATALOG,
  OPERATING_HOURS,
  VENUE_WHATSAPP_NUMBER,
  addDaysIsoDate,
  buildWhatsAppConfirmationUrl,
  formatCompactRupiah,
  formatHourRange,
  formatIndonesianDate,
  formatRupiah,
  formatSlotList,
  getTodayIsoDate,
  isSlotPast,
  type Booking,
  type Court,
  type PaymentMethod,
  type SlotHold,
} from '../types/booking';

interface LiveScheduleMatrixProps {
  courts: Court[];
  bookings: Booking[];
  holds: SlotHold[];
  connectionStatus: ConnectionStatus;
  onlineCount: number;
  isLoading: boolean;
  authUserEmail?: string | null;
  authUserName?: string | null;
  onSignInGoogle?: () => Promise<unknown>;
  onSignOutGoogle?: () => Promise<void>;
  selectedCourtFilter: 'all' | 'court-a' | 'court-b';
  onSelectCourtFilter: (filter: 'all' | 'court-a' | 'court-b') => void;
  onSyncHold: (courtId: string, date: string, slots: number[]) => void;
  onCreateBooking: (input: CreateBookingInput) => Promise<Booking>;
  onOpenLookup: () => void;
}

export function LiveScheduleMatrix({
  courts,
  bookings,
  holds,
  connectionStatus,
  onlineCount,
  isLoading,
  authUserEmail,
  authUserName,
  onSignInGoogle,
  onSignOutGoogle,
  selectedCourtFilter,
  onSelectCourtFilter,
  onSyncHold,
  onCreateBooking,
  onOpenLookup,
}: LiveScheduleMatrixProps) {
  const todayIso = useMemo(() => getTodayIsoDate(), []);
  const dateOptions = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIsoDate(todayIso, i)),
    [todayIso]
  );

  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({});

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const paymentMethod: PaymentMethod = 'Bayar di Kasir';
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [inspectedBooking, setInspectedBooking] = useState<Booking | null>(null);

  const [minuteTick, setMinuteTick] = useState(0);
  const [isSummaryInView, setIsSummaryInView] = useState(false);
  const summaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsSummaryInView(entry.isIntersecting),
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedSlots.length]);

  const filteredCourts = useMemo(() => {
    if (selectedCourtFilter === 'all') return courts;
    return courts.filter((c) => c.id === selectedCourtFilter);
  }, [courts, selectedCourtFilter]);

  useEffect(() => {
    if (!selectedCourtId || selectedSlots.length === 0) return;

    const court = courts.find((c) => c.id === selectedCourtId);
    if (court && court.status === 'maintenance') {
      setSelectedSlots([]);
      onSyncHold(selectedCourtId, selectedDate, []);
      return;
    }

    const now = new Date();
    const validSlots = selectedSlots.filter((hr) => {
      if (isSlotPast(selectedDate, hr, now)) {
        return false;
      }
      const taken = bookings.some(
        (b) =>
          b.courtId === selectedCourtId &&
          b.date === selectedDate &&
          b.status !== 'Dibatalkan' &&
          b.slots.includes(hr)
      );
      return !taken;
    });

    if (validSlots.length !== selectedSlots.length) {
      setSelectedSlots(validSlots);
      onSyncHold(selectedCourtId, selectedDate, validSlots);
      setFormError('Sebagian slot yang Anda pilih baru saja dipesan atau waktunya sudah lewat.');
    }
  }, [bookings, courts, minuteTick, onSyncHold, selectedCourtId, selectedDate, selectedSlots]);

  const handleDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    setSelectedCourtId('');
    setSelectedSlots([]);
    setFormError(null);
    onSyncHold('', nextDate, []);
  };

  const handleToggleSlot = (court: Court, hour: number) => {
    if (court.status === 'maintenance' || isSlotPast(selectedDate, hour)) return;
    setFormError(null);

    if (selectedCourtId !== court.id) {
      const next = [hour];
      setSelectedCourtId(court.id);
      setSelectedSlots(next);
      onSyncHold(court.id, selectedDate, next);
      return;
    }

    const exists = selectedSlots.includes(hour);
    const next = exists
      ? selectedSlots.filter((s) => s !== hour)
      : [...selectedSlots, hour].sort((a, b) => a - b);

    setSelectedSlots(next);
    if (next.length === 0) {
      setSelectedCourtId('');
    }
    onSyncHold(next.length > 0 ? court.id : '', selectedDate, next);
  };

  const handleClearSelection = () => {
    setSelectedCourtId('');
    setSelectedSlots([]);
    setFormError(null);
    onSyncHold('', selectedDate, []);
  };

  const selectedCourt = useMemo(
    () => courts.find((c) => c.id === selectedCourtId) || null,
    [courts, selectedCourtId]
  );

  const courtSubtotal = useMemo(() => {
    if (!selectedCourt) return 0;
    return selectedSlots.length * selectedCourt.hourlyPrice;
  }, [selectedCourt, selectedSlots]);

  const addonTotal = useMemo(() => {
    return ADDON_CATALOG.reduce((sum, item) => {
      const qty = addonQtys[item.id] || 0;
      return sum + item.price * qty;
    }, 0);
  }, [addonQtys]);

  const totalAmount = courtSubtotal + addonTotal;

  const adjustAddon = (id: string, delta: number, maxQty: number) => {
    setAddonQtys((prev) => {
      const nextVal = Math.max(0, Math.min(maxQty, (prev[id] || 0) + delta));
      return { ...prev, [id]: nextVal };
    });
  };

  const handleSubmitBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCourt || selectedSlots.length === 0) {
      setFormError('Pilih minimal satu jam lapangan terlebih dahulu.');
      return;
    }

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();
    if (cleanName.length < 2) {
      setFormError('Masukkan nama pemesan atau nama tim minimal 2 karakter.');
      return;
    }
    if (cleanPhone.length < 8) {
      setFormError('Masukkan nomor WhatsApp aktif minimal 8 digit.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const addonsPayload = Object.entries(addonQtys)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ id, qty }));

      const created = await onCreateBooking({
        courtId: selectedCourt.id,
        date: selectedDate,
        slots: selectedSlots,
        customerName: cleanName,
        customerPhone: cleanPhone,
        paymentMethod,
        addons: addonsPayload,
        notes: notes.trim() || undefined,
      });

      setConfirmedBooking(created);
      setSelectedCourtId('');
      setSelectedSlots([]);
      setAddonQtys({});
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      onSyncHold('', selectedDate, []);
    } catch (err) {
      setFormError(extractReadableError(err, 'Terjadi kesalahan saat menyimpan booking.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getShortDayLabel = (iso: string, index: number) => {
    if (index === 0) return 'Hari Ini';
    if (index === 1) return 'Besok';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(new Date(y, m - 1, d));
  };

  const getShortDateLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(
      new Date(y, m - 1, d)
    );
  };

  return (
    <section id="jadwal-live" className="bg-slate-50 py-14 lg:py-16">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-medium text-emerald-700">
              Matriks Ketersediaan Lapangan A & B (08.00 – 00.00 WIB)
            </p>
            <h2 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Jadwal Booking Real-Time
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700">
              {connectionStatus === 'cloud' ? (
                <>
                  <Cloud className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Cloud Online · Sinkronisasi Real-Time</span>
                </>
              ) : connectionStatus === 'connected' ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    Sinkronisasi Live · <strong className="tabular-nums">{onlineCount}</strong> aktif
                  </span>
                </>
              ) : connectionStatus === 'local' ? (
                <>
                  <Database className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Mode Lokal · Sinkronisasi Antar Tab</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  <span>Menyambung ulang jadwal...</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenLookup}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Cek Kode Booking</span>
            </button>
          </div>
        </div>

        {/* Filter & Date Toolbar */}
        <div className="mt-7 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {dateOptions.map((iso, idx) => {
              const active = selectedDate === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleDateChange(iso)}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`text-[11px] font-medium ${
                      active ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    {getShortDayLabel(iso, idx)}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {getShortDateLabel(iso)}
                  </span>
                </button>
              );
            })}

            <label className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:border-slate-300">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <input
                type="date"
                aria-label="Pilih tanggal lain"
                value={selectedDate}
                min={todayIso}
                onChange={(e) => e.target.value && handleDateChange(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none tabular-nums"
              />
            </label>
          </div>

          <div className="inline-flex items-center gap-1 self-start rounded-lg bg-slate-100 p-1 lg:self-auto">
            {(
              [
                { id: 'all', label: 'Semua (A & B)' },
                { id: 'court-a', label: 'Lapangan A' },
                { id: 'court-b', label: 'Lapangan B' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectCourtFilter(tab.id)}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedCourtFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main 2-Column Workspace */}
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Matrix Column */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
              <p className="text-sm font-semibold text-slate-900">
                {formatIndonesianDate(selectedDate)}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span>Tersedia = Kosong</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-emerald-700">Dipilih = Pilihan Anda</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-amber-700">Ditahan = Pengguna Lain</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-500">Terisi = Sudah Dibooking</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400">Lewat = Waktu Berlalu</span>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="h-11 w-full animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="sticky left-0 z-10 w-36 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                        Jam (WIB)
                      </th>
                      {filteredCourts.map((court) => (
                        <th
                          key={court.id}
                          className="border-l border-slate-200 px-4 py-3 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                              {court.name}
                            </span>
                            {court.status === 'maintenance' ? (
                              <span className="text-xs font-semibold text-rose-700">
                                Perawatan
                              </span>
                            ) : (
                              <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                                {formatRupiah(court.hourlyPrice)}/jam
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-normal text-slate-500 whitespace-nowrap">
                            {court.categoryLabel}
                          </p>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {OPERATING_HOURS.map((hour) => {
                      const isPast = isSlotPast(selectedDate, hour);
                      return (
                        <tr key={hour} className={isPast ? 'bg-slate-50/40' : 'hover:bg-slate-50/40'}>
                          <td className="sticky left-0 z-10 bg-white px-4 py-2 align-middle">
                            <div
                              className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                                isPast ? 'text-slate-400' : 'text-slate-800'
                              }`}
                            >
                              {formatHourRange(hour)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {isPast ? 'Waktu Berlalu' : 'Durasi 1 Jam'}
                            </div>
                          </td>

                          {filteredCourts.map((court) => {
                            const booking = bookings.find(
                              (b) =>
                                b.courtId === court.id &&
                                b.date === selectedDate &&
                                b.status !== 'Dibatalkan' &&
                                b.slots.includes(hour)
                            );
                            const isSelectedByMe =
                              selectedCourtId === court.id && selectedSlots.includes(hour);
                            const heldByOther =
                              !isSelectedByMe &&
                              holds.some(
                                (h) =>
                                  h.courtId === court.id &&
                                  h.date === selectedDate &&
                                  h.hour === hour
                              );

                            if (court.status === 'maintenance') {
                              return (
                                <td
                                  key={court.id}
                                  className="border-l border-slate-200 bg-rose-50/50 p-1.5"
                                >
                                  <div className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium text-rose-700">
                                    <Wrench className="h-3.5 w-3.5" />
                                    <span>Perawatan</span>
                                  </div>
                                </td>
                              );
                            }

                            if (booking) {
                              const isBlock = booking.kind !== 'customer';
                              return (
                                <td
                                  key={court.id}
                                  className={`border-l border-slate-200 p-1.5 ${
                                    isBlock ? 'bg-rose-50/40' : 'bg-slate-50'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setInspectedBooking(booking)}
                                    className="flex h-12 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 text-left transition-colors hover:border-slate-300 cursor-pointer"
                                  >
                                    <span className="truncate text-xs font-semibold text-slate-800">
                                      {booking.customerName}
                                    </span>
                                    <span className="text-[11px] font-medium text-slate-500 shrink-0">
                                      {booking.kind === 'tournament'
                                        ? 'Turnamen'
                                        : booking.kind === 'maintenance'
                                        ? 'Diblokir'
                                        : booking.status}
                                    </span>
                                  </button>
                                </td>
                              );
                            }

                            if (isPast) {
                              return (
                                <td
                                  key={court.id}
                                  className="border-l border-slate-200 bg-slate-50/70 p-1.5"
                                >
                                  <div className="flex h-12 w-full items-center justify-center rounded-md border border-slate-200/80 bg-slate-100/70 px-3 text-xs font-medium text-slate-400 select-none">
                                    Sudah Lewat
                                  </div>
                                </td>
                              );
                            }

                            if (isSelectedByMe) {
                              return (
                                <td key={court.id} className="border-l border-slate-200 p-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSlot(court, hour)}
                                    className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 cursor-pointer"
                                  >
                                    <Check className="h-4 w-4 shrink-0" />
                                    <span>Dipilih ({formatCompactRupiah(court.hourlyPrice)})</span>
                                  </button>
                                </td>
                              );
                            }

                            if (heldByOther) {
                              return (
                                <td key={court.id} className="border-l border-slate-200 p-1.5">
                                  <div className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>Ditahan (Proses Pesan)</span>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td key={court.id} className="border-l border-slate-200 p-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSlot(court, hour)}
                                  className="group flex h-12 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3.5 transition-colors hover:border-emerald-600 hover:bg-emerald-50/70 cursor-pointer"
                                >
                                  <span className="text-xs font-semibold text-emerald-700">
                                    Tersedia
                                  </span>
                                  <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums group-hover:text-emerald-800">
                                    {formatCompactRupiah(court.hourlyPrice)}
                                  </span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Booking Summary & Form Panel */}
          <aside
            ref={summaryRef}
            id="ringkasan-pemesanan"
            className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 lg:sticky lg:top-20 lg:col-span-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                  Ringkasan Pemesanan
                </h3>
                <p className="text-xs text-slate-500">
                  Slot dikunci otomatis setelah konfirmasi
                </p>
              </div>
              {selectedSlots.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {selectedSlots.length === 0 || !selectedCourt ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-slate-800">
                  Belum ada jam yang dipilih
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Klik satu atau beberapa kotak berlabel <strong>Tersedia</strong> pada Lapangan A
                  atau Lapangan B untuk mulai memesan.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitBooking} className="mt-5 space-y-5">
                <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Lapangan</span>
                    <span className="font-semibold text-slate-900">
                      {selectedCourt.name} · {selectedCourt.categoryLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Tanggal</span>
                    <span className="font-medium text-slate-800 tabular-nums">
                      {formatIndonesianDate(selectedDate)}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-slate-500">Sesi ({selectedSlots.length} jam)</span>
                    <span className="text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                      {formatSlotList(selectedSlots)}
                    </span>
                  </div>
                </div>

                {/* Add-ons Stepper */}
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    Sewa Raket & Beli Cock (Opsional)
                  </p>
                  <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {ADDON_CATALOG.map((addon) => {
                      const qty = addonQtys[addon.id] || 0;
                      return (
                        <div
                          key={addon.id}
                          className="flex items-center justify-between gap-2 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-slate-800">
                              {addon.name}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {formatRupiah(addon.price)} ({addon.unit})
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              aria-label={`Kurangi ${addon.name}`}
                              onClick={() => adjustAddon(addon.id, -1, addon.maxQty)}
                              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center font-mono text-xs font-semibold tabular-nums">
                              {qty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Tambah ${addon.name}`}
                              onClick={() => adjustAddon(addon.id, 1, addon.maxQty)}
                              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Customer Form Fields */}
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="booking-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nama Pemesan / Tim
                    </label>
                    <input
                      id="booking-name"
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Contoh: Andi Wijaya"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-phone"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nomor WhatsApp Aktif
                    </label>
                    <input
                      id="booking-phone"
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="082142272367"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none tabular-nums"
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-slate-700">Metode Pembayaran</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Bayar di Kasir Arena (pembayaran dilakukan langsung di tempat)
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="booking-notes"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Catatan (Opsional)
                    </label>
                    <input
                      id="booking-notes"
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Misal: Mabar 4 orang"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="space-y-1.5 border-t border-slate-200 pt-4 text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>
                      Sewa Lapangan ({selectedSlots.length} jam ×{' '}
                      {formatCompactRupiah(selectedCourt.hourlyPrice)})
                    </span>
                    <span className="font-mono tabular-nums">{formatRupiah(courtSubtotal)}</span>
                  </div>
                  {addonTotal > 0 && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Raket & Cock</span>
                      <span className="font-mono tabular-nums">{formatRupiah(addonTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 text-base font-bold text-slate-900">
                    <span>Total Pembayaran</span>
                    <span className="font-mono text-emerald-700 tabular-nums">
                      {formatRupiah(totalAmount)}
                    </span>
                  </div>
                </div>

                {formError && <UnauthorizedDomainNotice errorMessage={formError} />}

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                  {authUserEmail ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          Akun Google: {authUserName || authUserEmail}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{authUserEmail}</p>
                      </div>
                      {onSignOutGoogle && (
                        <button
                          type="button"
                          onClick={() => void onSignOutGoogle()}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                        >
                          <LogOut className="h-3 w-3" />
                          <span>Keluar</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] leading-snug text-slate-600">
                        Masuk dengan Google untuk menyimpan bukti &amp; nomor WhatsApp Anda secara aman.
                      </p>
                      {onSignInGoogle && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            void onSignInGoogle().catch((err) => {
                              setFormError(extractReadableError(err, 'Gagal masuk Google.'));
                            });
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          Masuk Google
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting
                    ? 'Memproses Jadwal...'
                    : authUserEmail
                    ? 'Konfirmasi & Kunci Jadwal'
                    : 'Masuk Google & Kunci Jadwal'}
                </button>
              </form>
            )}
          </aside>
        </div>
      </div>

      {/* Confirmed Digital Booking Receipt Modal */}
      {confirmedBooking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700">Pemesanan Berhasil Dikunci</p>
                <h3
                  id="receipt-title"
                  className="mt-1 font-display text-2xl font-bold text-slate-900"
                >
                  Bukti Booking Digital
                </h3>
              </div>
              <button
                type="button"
                aria-label="Tutup bukti booking"
                onClick={() => setConfirmedBooking(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-xs text-slate-500">Kode Booking</p>
                <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                  {confirmedBooking.bookingCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(confirmedBooking.bookingCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>

            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Pemesan</dt>
                <dd className="font-semibold text-slate-900">{confirmedBooking.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Lokasi</dt>
                <dd className="text-right font-medium text-slate-900">
                  Lapangan Manisrejo, Magetan{' '}
                  <a
                    href="https://maps.app.goo.gl/xqv1zkGD8SwRxFT86"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-xs font-semibold text-emerald-700 underline"
                  >
                    (Google Maps)
                  </a>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Lapangan</dt>
                <dd className="font-medium text-slate-900">
                  {courts.find((c) => c.id === confirmedBooking.courtId)?.name ||
                    confirmedBooking.courtId}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tanggal</dt>
                <dd className="font-medium text-slate-900">
                  {formatIndonesianDate(confirmedBooking.date)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Jam Bermain</dt>
                <dd className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                  {formatSlotList(confirmedBooking.slots)}
                </dd>
              </div>
              {confirmedBooking.addons.length > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Tambahan</dt>
                  <dd className="text-right text-xs font-medium text-slate-800">
                    {confirmedBooking.addons.map((a) => `${a.name} ×${a.qty}`).join(', ')}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Status Pembayaran</dt>
                <dd className="font-semibold text-emerald-700">
                  {confirmedBooking.status} · {confirmedBooking.paymentMethod}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base font-bold">
                <dt className="text-slate-900">Total Tagihan</dt>
                <dd className="font-mono text-slate-900 tabular-nums">
                  {formatRupiah(confirmedBooking.totalAmount)}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col gap-2.5">
              {(() => {
                const courtName =
                  courts.find((c) => c.id === confirmedBooking.courtId)?.name ||
                  confirmedBooking.courtId;
                const waCustomerUrl = buildWhatsAppConfirmationUrl(confirmedBooking, courtName);
                const waAdminUrl = buildWhatsAppConfirmationUrl(
                  confirmedBooking,
                  courtName,
                  VENUE_WHATSAPP_NUMBER
                );
                return (
                  <>
                    {waCustomerUrl && (
                      <a
                        href={waCustomerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>Kirim Konfirmasi ke Pemesan</span>
                      </a>
                    )}
                    {waAdminUrl && (
                      <a
                        href={waAdminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>Konfirmasi ke Admin ({VENUE_WHATSAPP_NUMBER})</span>
                      </a>
                    )}
                  </>
                );
              })()}

              <button
                type="button"
                onClick={() => setConfirmedBooking(null)}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Occupied Slot Modal */}
      {inspectedBooking && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Informasi Slot Terisi</p>
                <h3 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  {inspectedBooking.customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBooking(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Kode</dt>
                <dd className="font-mono font-semibold text-slate-900">
                  {inspectedBooking.bookingCode}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Sesi</dt>
                <dd className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                  {formatSlotList(inspectedBooking.slots)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold text-slate-900">{inspectedBooking.status}</dd>
              </div>
              {inspectedBooking.customerPhone !== '-' && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">WhatsApp</dt>
                  <dd className="font-mono text-xs font-medium text-slate-800 tabular-nums">
                    {inspectedBooking.customerPhone}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-5 flex flex-col gap-2">
              {(() => {
                const courtName =
                  courts.find((c) => c.id === inspectedBooking.courtId)?.name ||
                  inspectedBooking.courtId;
                const waUrl = buildWhatsAppConfirmationUrl(inspectedBooking, courtName);
                return waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Kirim Konfirmasi via WhatsApp</span>
                  </a>
                ) : null;
              })()}

              <button
                type="button"
                onClick={() => setInspectedBooking(null)}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Mobile Summary Bar */}
      {selectedSlots.length > 0 &&
        selectedCourt &&
        !isSummaryInView &&
        !confirmedBooking &&
        !inspectedBooking && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:hidden">
            <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900">
                  {selectedCourt.name} · {selectedSlots.length} jam (
                  <span className="font-mono text-emerald-700 tabular-nums">
                    {formatSlotList(selectedSlots)}
                  </span>
                  )
                </p>
                <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {formatRupiah(totalAmount)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="Reset pilihan slot"
                  onClick={handleClearSelection}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    window.setTimeout(() => {
                      document.getElementById('booking-name')?.focus();
                    }, 350);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
                >
                  <span>Isi Data Pemesan</span>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
