import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Booking,
  BookingKind,
  BookingStatus,
  Court,
  CourtStatus,
  PaymentMethod,
  SlotHold,
  WsServerMessage,
} from '../types/booking';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export interface CreateBookingInput {
  courtId: string;
  date: string;
  slots: number[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  paymentMethod: PaymentMethod;
  addons?: Array<{ id: string; qty: number }>;
  notes?: string;
  kind?: BookingKind;
  status?: BookingStatus;
}

export function useArenaRealtime() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [holds, setHolds] = useState<SlotHold[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [managementToken, setManagementToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('smash_mgmt_token');
    } catch {
      return null;
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const pendingHoldRef = useRef<{ courtId: string; date: string; slots: number[] } | null>(null);
  const unmountedRef = useRef<boolean>(false);

  const fetchFallbackState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = await res.json();
      setCourts(data.courts ?? []);
      setBookings(data.bookings ?? []);
      setHolds(data.holds ?? []);
      if (typeof data.onlineCount === 'number') {
        setOnlineCount(data.onlineCount);
      }
      setLastSyncedAt(new Date().toISOString());
      setIsLoading(false);
    } catch {
      // Handled via WebSocket reconnect
    }
  }, []);

  const connectWs = useCallback(() => {
    if (unmountedRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        retryAttemptRef.current = 0;
        setConnectionStatus('connected');
        if (pendingHoldRef.current) {
          socket.send(JSON.stringify({ type: 'hold:sync', payload: pendingHoldRef.current }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsServerMessage;
          setLastSyncedAt(new Date().toISOString());

          switch (msg.type) {
            case 'init':
              setCourts(msg.payload.courts);
              setBookings(msg.payload.bookings);
              setHolds(msg.payload.holds);
              setOnlineCount(msg.payload.onlineCount);
              setIsLoading(false);
              break;

            case 'booking:created':
              setBookings((prev) => {
                // Idempotency guard against duplicate broadcasts
                if (prev.some((b) => b.id === msg.payload.id)) {
                  return prev;
                }
                return [msg.payload, ...prev];
              });
              break;

            case 'booking:updated':
              setBookings((prev) =>
                prev.map((b) => (b.id === msg.payload.id ? msg.payload : b))
              );
              break;

            case 'booking:deleted':
              setBookings((prev) => prev.filter((b) => b.id !== msg.payload.id));
              break;

            case 'court:updated':
              setCourts((prev) =>
                prev.map((c) => (c.id === msg.payload.id ? msg.payload : c))
              );
              break;

            case 'holds:updated':
              setHolds(msg.payload);
              break;

            case 'presence:update':
              setOnlineCount(msg.payload.onlineCount);
              break;
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      socket.onclose = () => {
        if (unmountedRef.current) return;
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(1.5, retryAttemptRef.current), 8000);
        retryAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWs();
        }, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      setConnectionStatus('reconnecting');
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    fetchFallbackState();
    connectWs();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWs, fetchFallbackState]);

  const syncHold = useCallback((courtId: string, date: string, slots: number[]) => {
    const payload = { courtId, date, slots };
    pendingHoldRef.current = payload;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'hold:sync', payload }));
    }
  }, []);

  const unlockManagement = useCallback(async (passcode: string): Promise<void> => {
    const res = await fetch('/api/management/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    if (!res.ok || !data.token) {
      throw new Error(data.error || 'Sandi salah.');
    }
    try {
      sessionStorage.setItem('smash_mgmt_token', data.token);
    } catch {
      // Ignore storage failures
    }
    setManagementToken(data.token);
  }, []);

  const lockManagement = useCallback(() => {
    try {
      sessionStorage.removeItem('smash_mgmt_token');
    } catch {
      // Ignore storage failures
    }
    setManagementToken(null);
  }, []);

  const createBooking = useCallback(
    async (input: CreateBookingInput): Promise<Booking> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (managementToken) {
        headers['x-management-token'] = managementToken;
      }
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) lockManagement();
        throw new Error(data.error || 'Gagal membuat pemesanan.');
      }
      setBookings((prev) => (prev.some((b) => b.id === data.id) ? prev : [data, ...prev]));
      return data as Booking;
    },
    [lockManagement, managementToken]
  );

  const updateBooking = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Booking, 'status' | 'notes' | 'paymentMethod' | 'courtId' | 'date' | 'slots'>>
    ): Promise<Booking> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (managementToken) {
        headers['x-management-token'] = managementToken;
      }
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) lockManagement();
        throw new Error(data.error || 'Gagal memperbarui jadwal.');
      }
      setBookings((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      return data as Booking;
    },
    [lockManagement, managementToken]
  );

  const deleteBooking = useCallback(
    async (id: string): Promise<void> => {
      const headers: Record<string, string> = {};
      if (managementToken) {
        headers['x-management-token'] = managementToken;
      }
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) lockManagement();
        throw new Error(data.error || 'Gagal menghapus data booking.');
      }
      setBookings((prev) => prev.filter((b) => b.id !== id));
    },
    [lockManagement, managementToken]
  );

  const updateCourt = useCallback(
    async (
      id: string,
      patch: { status?: CourtStatus; hourlyPrice?: number }
    ): Promise<Court> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (managementToken) {
        headers['x-management-token'] = managementToken;
      }
      const res = await fetch(`/api/courts/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) lockManagement();
        throw new Error(data.error || 'Gagal memperbarui status lapangan.');
      }
      setCourts((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      return data as Court;
    },
    [lockManagement, managementToken]
  );

  return {
    courts,
    bookings,
    holds,
    onlineCount,
    connectionStatus,
    isLoading,
    lastSyncedAt,
    isManagementUnlocked: Boolean(managementToken),
    unlockManagement,
    lockManagement,
    syncHold,
    createBooking,
    updateBooking,
    deleteBooking,
    updateCourt,
  };
}
