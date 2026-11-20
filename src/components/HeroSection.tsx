import { ArrowRight, CalendarCheck2 } from 'lucide-react';
import { useState } from 'react';

interface HeroSectionProps {
  availableTodayCount: number;
  activeCourtCount: number;
  onBookClick: () => void;
  onManagementClick: () => void;
}

export function HeroSection({
  availableTodayCount,
  activeCourtCount,
  onBookClick,
  onManagementClick,
}: HeroSectionProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <section id="beranda" className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Content Column */}
          <div className="flex flex-col justify-center lg:col-span-6">
            <p className="text-xs font-medium tracking-wide text-slate-500">
              Lapangan Manisrejo, Magetan · {activeCourtCount} Lapangan Keramik (A & B) · 08.00 – 00.00 WIB
            </p>

            <h1 className="mt-4 font-display text-[clamp(2.5rem,4.5vw,3.9rem)] font-bold leading-[1.03] tracking-tight text-slate-900 text-balance">
              Pesan Lapangan Badminton Tanpa Menunggu Konfirmasi
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
              Cek ketersediaan Lapangan A dan Lapangan B di Lapangan Manisrejo, Magetan secara
              langsung, pilih jam bermain dari pukul 08.00 hingga 00.00 WIB dengan tarif Rp 15.000
              per jam, dan kelola jadwal secara real-time.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onBookClick}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <CalendarCheck2 className="h-4 w-4" />
                <span>Lihat Jadwal Tersedia</span>
              </button>

              <button
                type="button"
                onClick={onManagementClick}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Manajemen Jadwal</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <a
                href="https://maps.app.goo.gl/xqv1zkGD8SwRxFT86"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-700 underline decoration-emerald-600/40 underline-offset-4 hover:text-emerald-800 whitespace-nowrap shrink-0"
              >
                Lihat Lokasi Google Maps
              </a>
            </div>
          </div>

          {/* Right Media Column */}
          <div className="lg:col-span-6">
            <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 sm:h-96 lg:h-full lg:min-h-[420px]">
              {!imgError ? (
                <img
                  src="./src/assets/images/court_keramik_1795043294100.jpg"
                  alt="Interior Lapangan A dan Lapangan B Smash Arena berlantai keramik bersih dan rata"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-8 text-center text-white">
                  <span className="font-display text-3xl font-bold tracking-tight">SMASH ARENA</span>
                  <span className="mt-2 text-sm text-slate-300">
                    Lapangan A & Lapangan B · Lantai Keramik
                  </span>
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />

              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white">
                <div>
                  <p className="text-xs font-medium text-emerald-300">Ketersediaan Hari Ini</p>
                  <p className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums">
                    {availableTodayCount} Slot Jam Tersedia
                  </p>
                </div>
                <p className="hidden sm:block text-right text-xs text-slate-200 tabular-nums">
                  Rp 15.000 / jam
                  <br />
                  Buka setiap hari 08.00 – 00.00
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width 4-column Arena Quick Specs Strip below Hero Split */}
        <div className="mt-12 grid grid-cols-2 divide-y divide-slate-200 border-t border-slate-200 pt-8 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="pb-4 sm:pb-0 sm:pr-6">
            <p className="text-xs font-medium text-slate-500">01. Lapangan Keramik</p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              Lapangan A & B
            </p>
            <p className="mt-0.5 text-xs text-slate-600">Lantai keramik halus & garis jelas</p>
          </div>
          <div className="pb-4 pl-4 sm:pb-0 sm:px-6">
            <p className="text-xs font-medium text-slate-500">02. Tarif Sewa Lapangan</p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              Rp 15.000 / Jam
            </p>
            <p className="mt-0.5 text-xs text-slate-600">Tarif flat pagi hingga tengah malam</p>
          </div>
          <div className="pt-4 sm:pt-0 sm:px-6">
            <p className="text-xs font-medium text-slate-500">03. Jam Operasional</p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              08.00 – 00.00 WIB
            </p>
            <p className="mt-0.5 text-xs text-slate-600">16 sesi per hari tiap lapangan</p>
          </div>
          <div className="pl-4 pt-4 sm:pt-0 sm:pl-6">
            <p className="text-xs font-medium text-slate-500">04. Sewa Raket & Cock</p>
            <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              Rp 10rb & Rp 12rb
            </p>
            <p className="mt-0.5 text-xs text-slate-600">Sewa raket & beli cock per biji</p>
          </div>
        </div>
      </div>
    </section>
  );
}
