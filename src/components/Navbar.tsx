import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export type WorkspaceMode = 'booking' | 'management';

interface NavbarProps {
  mode: WorkspaceMode;
  onChangeMode: (mode: WorkspaceMode, sectionId?: string) => void;
}

export function Navbar({ mode, onChangeMode }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (targetMode: WorkspaceMode, sectionId?: string) => {
    setMobileOpen(false);
    onChangeMode(targetMode, sectionId);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#beranda"
          onClick={(e) => {
            e.preventDefault();
            handleNav('booking', 'beranda');
          }}
          className="font-display text-2xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
        >
          SMASH ARENA
        </a>

        {/* Zone 2: 4 single-line text nav links */}
        <nav
          aria-label="Navigasi Utama"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <a
            href="#beranda"
            onClick={(e) => {
              e.preventDefault();
              handleNav('booking', 'beranda');
            }}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
              mode === 'booking' ? 'text-slate-900' : ''
            }`}
          >
            Beranda
          </a>
          <a
            href="#lapangan"
            onClick={(e) => {
              e.preventDefault();
              handleNav('booking', 'lapangan');
            }}
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
          >
            Fasilitas & Tarif
          </a>
          <a
            href="#jadwal-live"
            onClick={(e) => {
              e.preventDefault();
              handleNav('booking', 'jadwal-live');
            }}
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900"
          >
            Jadwal Live
          </a>
          <button
            type="button"
            onClick={() => handleNav('management')}
            className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-slate-900 ${
              mode === 'management'
                ? 'text-emerald-700 font-semibold underline decoration-emerald-600 decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Manajemen Jadwal
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleNav('booking', 'jadwal-live')}
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Pesan Lapangan
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden cursor-pointer"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            <button
              type="button"
              onClick={() => handleNav('booking', 'beranda')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
            >
              Beranda
            </button>
            <button
              type="button"
              onClick={() => handleNav('booking', 'lapangan')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
            >
              Fasilitas & Tarif
            </button>
            <button
              type="button"
              onClick={() => handleNav('booking', 'jadwal-live')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
            >
              Jadwal Live
            </button>
            <button
              type="button"
              onClick={() => handleNav('management')}
              className={`rounded-lg px-3 py-2.5 text-left ${
                mode === 'management' ? 'bg-emerald-50 font-semibold text-emerald-800' : 'hover:bg-slate-50'
              }`}
            >
              Manajemen Jadwal
            </button>
            <button
              type="button"
              onClick={() => handleNav('booking', 'jadwal-live')}
              className="mt-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-center font-semibold text-white"
            >
              Pesan Lapangan
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
