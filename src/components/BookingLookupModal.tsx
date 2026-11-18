import { MessageCircle, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildWhatsAppConfirmationUrl,
  formatIndonesianDate,
  formatRupiah,
  formatSlotList,
  type Booking,
  type Court,
} from '../types/booking';

interface BookingLookupModalProps {
  open: boolean;
  onClose: () => void;
  bookings: Booking[];
  courts: Court[];
}

export function BookingLookupModal({
  open,
  onClose,
  bookings,
  courts,
}: BookingLookupModalProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return bookings.filter(
      (b) =>
        b.bookingCode.toLowerCase().includes(clean) ||
        b.customerPhone.toLowerCase().includes(clean) ||
        b.customerName.toLowerCase().includes(clean)
    );
  }, [bookings, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lookup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-emerald-700">Verifikasi Real-Time</p>
            <h2 id="lookup-title" className="mt-1 font-display text-2xl font-bold text-slate-900">
              Cek Status Kode Booking
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pencarian kode booking"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Masukkan kode booking (contoh: SM-A102) atau nomor WA..."
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto">
          {query.trim().length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Ketik kode booking, nama tim, atau nomor WhatsApp untuk melihat detail terkini.
            </p>
          ) : matches.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Data pemesanan tidak ditemukan untuk kata kunci tersebut.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {matches.map((b) => {
                const court = courts.find((c) => c.id === b.courtId);
                const courtName = court?.name || b.courtId;
                const waUrl = buildWhatsAppConfirmationUrl(b, courtName);

                return (
                  <div key={b.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {b.bookingCode}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700">
                        {b.status} · {b.paymentMethod}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{b.customerName}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {courtName} · {formatIndonesianDate(b.date)}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-800 tabular-nums">
                        Jam {formatSlotList(b.slots)}
                      </span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {formatRupiah(b.totalAmount)}
                      </span>
                    </div>
                    {waUrl && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>Kirim Konfirmasi WhatsApp ({b.customerPhone})</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
