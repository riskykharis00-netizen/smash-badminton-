import { Eye, EyeOff, Lock, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { UnauthorizedDomainNotice } from './UnauthorizedDomainNotice';

interface ManagementPasscodeModalProps {
  open: boolean;
  onClose: () => void;
  onUnlock: (passcode: string) => Promise<void>;
  authUserEmail?: string | null;
}

export function ManagementPasscodeModal({
  open,
  onClose,
  onUnlock,
  authUserEmail,
}: ManagementPasscodeModalProps) {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = passcode.trim();
    if (!cleaned) {
      setError('Masukkan sandi terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onUnlock(cleaned);
      setPasscode('');
      setShowPasscode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sandi salah.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mgmt-auth-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-700">Akses Pengelola</p>
              <h2
                id="mgmt-auth-title"
                className="font-display text-2xl font-bold tracking-tight text-slate-900"
              >
                Sandi Manajemen Jadwal
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup dialog sandi"
            onClick={() => {
              setError(null);
              setPasscode('');
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Masukkan sandi pengelola untuk membuka Manajemen Jadwal Real-Time. Jika belum masuk, Anda
          akan diminta masuk dengan akun Google pengelola.
        </p>

        {authUserEmail && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            Akun aktif: <span className="font-semibold text-slate-900">{authUserEmail}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="mgmt-passcode" className="block text-xs font-semibold text-slate-700">
              Sandi Akses
            </label>
            <div className="relative mt-1">
              <input
                id="mgmt-passcode"
                type={showPasscode ? 'text' : 'password'}
                inputMode="numeric"
                autoFocus
                autoComplete="off"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Masukkan sandi..."
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-10 font-mono text-sm tracking-widest text-slate-900 placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />
              <button
                type="button"
                aria-label={showPasscode ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                onClick={() => setShowPasscode((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <UnauthorizedDomainNotice errorMessage={error} />}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPasscode('');
                onClose();
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? 'Memeriksa...' : 'Buka Manajemen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
