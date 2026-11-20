import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Terjadi gangguan tak terduga pada aplikasi.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let readableMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; path?: string };
        if (parsed && typeof parsed.error === 'string') {
          readableMessage = parsed.path
            ? `Akses data (${parsed.path}) ditolak atau gagal: ${parsed.error}`
            : parsed.error;
        }
      } catch {
        // Keep plain string message
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-xs font-semibold text-rose-700">Gangguan Sinkronisasi</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
              Terjadi Kesalahan Aplikasi
            </h1>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">{readableMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
