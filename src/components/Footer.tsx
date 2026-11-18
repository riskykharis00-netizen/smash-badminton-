import { ExternalLink, MapPin } from 'lucide-react';
import type { WorkspaceMode } from './Navbar';

interface FooterProps {
  onNavigate: (mode: WorkspaceMode, sectionId?: string) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="border-t border-slate-200 bg-white py-10">
      <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-xl font-bold tracking-tight text-slate-900">
            SMASH ARENA
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Lapangan Manisrejo, Magetan · 2 Lapangan Keramik (A & B) · Buka setiap hari 08.00 – 00.00 WIB
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => onNavigate('booking', 'lapangan')}
            className="hover:text-slate-900 cursor-pointer"
          >
            Fasilitas & Tarif
          </button>
          <button
            type="button"
            onClick={() => onNavigate('booking', 'jadwal-live')}
            className="hover:text-slate-900 cursor-pointer"
          >
            Pemesanan Lapangan
          </button>
          <button
            type="button"
            onClick={() => onNavigate('management')}
            className="hover:text-slate-900 cursor-pointer"
          >
            Manajemen Jadwal Real-Time
          </button>
          <span className="text-slate-300">|</span>
          <a
            href="https://wa.me/6282142272367"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono font-semibold text-slate-700 hover:text-emerald-700 tabular-nums"
          >
            WA: 082142272367
          </a>
          <a
            href="https://maps.app.goo.gl/xqv1zkGD8SwRxFT86"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>Lokasi Google Maps</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
