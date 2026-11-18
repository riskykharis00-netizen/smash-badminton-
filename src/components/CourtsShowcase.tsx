import { ExternalLink, MapPin } from 'lucide-react';
import { useState } from 'react';
import { ADDON_CATALOG, formatRupiah, type Court } from '../types/booking';

interface CourtsShowcaseProps {
  courts: Court[];
  onSelectCourtFilter: (courtId: 'all' | 'court-a' | 'court-b') => void;
}

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/xqv1zkGD8SwRxFT86';

export function CourtsShowcase({ courts, onSelectCourtFilter }: CourtsShowcaseProps) {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const markImgError = (key: string) => {
    setImgErrors((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <section id="lapangan" className="border-b border-slate-200 bg-slate-50 py-14 lg:py-16">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium text-emerald-700">
              Fasilitas & Tarif Resmi · Lapangan Manisrejo, Magetan
            </p>
            <h2 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Lapangan Keramik A & B
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-slate-600">
            Kedua lapangan menggunakan lantai keramik indoor dengan pencahayaan LED merata, buka
            setiap hari pukul 08.00 sampai 00.00 WIB dengan tarif tetap Rp 15.000 per jam.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Marquee Card: Lapangan A & B Keramik */}
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7">
            <div className="relative h-64 w-full overflow-hidden bg-slate-900 sm:h-72">
              {!imgErrors.keramik ? (
                <img
                  src="/src/assets/images/court_keramik_1795043294100.jpg"
                  alt="Lapangan badminton indoor berlantai keramik bersih dan terang di Manisrejo Magetan"
                  referrerPolicy="no-referrer"
                  onError={() => markImgError('keramik')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-emerald-950 text-white font-display text-2xl">
                  Lapangan Keramik A & B
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between text-white">
                <div>
                  <p className="text-xs text-emerald-300">
                    Lapangan A & Lapangan B · 08.00 – 00.00 WIB
                  </p>
                  <h3 className="font-display text-2xl font-bold tracking-tight">
                    Arena Lantai Keramik
                  </h3>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  Rp 15.000 / jam
                </span>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Permukaan Keramik Halus · Garis Lapangan Presisi · Pencahayaan LED
                </p>
                <p className="text-xs text-slate-600">
                  Tarif tetap sepanjang hari dari jam 08.00 pagi hingga jam 00.00 malam.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectCourtFilter('court-a')}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 transition-colors hover:border-emerald-600 hover:text-emerald-700 whitespace-nowrap cursor-pointer"
                >
                  Jadwal Lap. A
                </button>
                <button
                  type="button"
                  onClick={() => onSelectCourtFilter('court-b')}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 transition-colors hover:border-emerald-600 hover:text-emerald-700 whitespace-nowrap cursor-pointer"
                >
                  Jadwal Lap. B
                </button>
              </div>
            </div>
          </article>

          {/* Add-ons Card: Sewa Raket & Beli Cock */}
          <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-5">
            <div className="relative h-52 w-full overflow-hidden bg-slate-900">
              {!imgErrors.proshop ? (
                <img
                  src="/src/assets/images/pro_shop_shuttle_1795042788324.jpg"
                  alt="Raket badminton dan shuttlecock siap pakai di Smash Arena"
                  referrerPolicy="no-referrer"
                  onError={() => markImgError('proshop')}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white font-display text-2xl">
                  Sewa Raket & Beli Cock
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between p-6">
              <div>
                <p className="text-xs font-medium text-slate-500">Tambahan Perlengkapan</p>
                <h3 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
                  Sewa Raket & Beli Cock
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Dapat langsung ditambahkan saat melakukan pemesanan slot lapangan.
                </p>
              </div>
              <ul className="mt-4 divide-y divide-slate-100 text-sm">
                {ADDON_CATALOG.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.unit}</p>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {formatRupiah(item.price)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          {/* Summary Table for Lapangan A & B */}
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-slate-500">Tarif Berlaku Real-Time</p>
                <h3 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
                  Ringkasan Kondisi & Harga Lapangan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onSelectCourtFilter('all')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:border-emerald-600 hover:text-emerald-700 whitespace-nowrap shrink-0 cursor-pointer self-start"
              >
                Tampilkan Semua di Jadwal
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 pr-4">Lapangan</th>
                    <th className="py-2.5 px-3">Jenis Lantai</th>
                    <th className="py-2.5 px-3">Jam Operasional</th>
                    <th className="py-2.5 px-3 text-right">Tarif per Jam</th>
                    <th className="py-2.5 pl-3 text-right">Kondisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courts.map((court) => (
                    <tr key={court.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4 font-semibold text-slate-900 whitespace-nowrap">
                        {court.name}
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {court.surface}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        08:00 – 00:00 WIB
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatRupiah(court.hourlyPrice)}
                      </td>
                      <td className="py-3 pl-3 text-right text-xs font-medium whitespace-nowrap">
                        {court.status === 'active' ? (
                          <span className="text-emerald-700">Operasional</span>
                        ) : (
                          <span className="text-rose-700">Perawatan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          {/* Venue Location & Google Maps Card */}
          <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
            <div>
              <p className="text-xs font-medium text-emerald-700">Alamat & Petunjuk Arah</p>
              <h3 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
                Lapangan Manisrejo, Magetan
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Lokasi GOR berlokasi di kawasan Manisrejo, Kabupaten Magetan, Jawa Timur. Gunakan
                tautan Google Maps resmi di bawah ini untuk navigasi langsung ke titik lokasi.
              </p>

              <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Alamat</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    Lapangan Manisrejo, Magetan
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Jam Buka</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                    08.00 – 00.00 WIB
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">WhatsApp Admin</dt>
                  <dd className="font-mono font-semibold text-emerald-700 tabular-nums">
                    <a
                      href="https://wa.me/6282142272367"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      082142272367
                    </a>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Tautan Maps</dt>
                  <dd className="font-mono text-slate-700 truncate max-w-[220px]">
                    maps.app.goo.gl/xqv1zkGD8SwRxFT86
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5">
              <a
                href={GOOGLE_MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
              >
                <MapPin className="h-4 w-4 text-emerald-400" />
                <span>Buka Lokasi di Google Maps</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-300" />
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
