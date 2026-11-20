import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { FIREBASE_AUTH_SETTINGS_URL, UNAUTHORIZED_DOMAIN_ERROR_CODE } from '../lib/firebase';

interface UnauthorizedDomainNoticeProps {
  errorMessage: string;
}

export function UnauthorizedDomainNotice({ errorMessage }: UnauthorizedDomainNoticeProps) {
  const [copied, setCopied] = useState(false);

  const isUnauthorizedDomain = errorMessage.startsWith(UNAUTHORIZED_DOMAIN_ERROR_CODE);
  if (!isUnauthorizedDomain) {
    return (
      <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700">
        {errorMessage}
      </p>
    );
  }

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopy = () => {
    if (!currentHost) return;
    navigator.clipboard?.writeText(currentHost);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="alert"
      className="space-y-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"
    >
      <p className="font-semibold text-rose-800">Domain Belum Diizinkan di Firebase</p>
      <p className="leading-relaxed text-rose-700">
        Agar login Google berjalan di alamat ini, tambahkan domain berikut ke menu{' '}
        <strong>Authentication → Settings → Authorized domains</strong> di Firebase Console:
      </p>

      {currentHost && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-white px-2.5 py-1.5">
          <code className="truncate font-mono text-[11px] font-semibold text-slate-900">
            {currentHost}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Tersalin' : 'Salin'}</span>
          </button>
        </div>
      )}

      <a
        href={FIREBASE_AUTH_SETTINGS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
      >
        <span>Buka Pengaturan Authorized Domains</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
