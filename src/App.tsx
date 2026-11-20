/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { CourtsShowcase } from './components/CourtsShowcase';
import { Footer } from './components/Footer';
import { HeroSection } from './components/HeroSection';
import { LiveScheduleMatrix } from './components/LiveScheduleMatrix';
import { Navbar, type WorkspaceMode } from './components/Navbar';
import { useArenaRealtime } from './hooks/useArenaRealtime';
import { OPERATING_HOURS, getTodayIsoDate, isSlotPast } from './types/booking';

const ManagementDashboard = lazy(() =>
  import('./components/ManagementDashboard').then((m) => ({ default: m.ManagementDashboard }))
);
const BookingLookupModal = lazy(() =>
  import('./components/BookingLookupModal').then((m) => ({ default: m.BookingLookupModal }))
);
const ManagementPasscodeModal = lazy(() =>
  import('./components/ManagementPasscodeModal').then((m) => ({
    default: m.ManagementPasscodeModal,
  }))
);

export default function App() {
  const {
    courts,
    bookings,
    holds,
    onlineCount,
    connectionStatus,
    isLoading,
    authUser,
    signInWithGoogle,
    signOutUser,
    isManagementUnlocked,
    unlockManagement,
    lockManagement,
    syncHold,
    createBooking,
    updateBooking,
    deleteBooking,
    updateCourt,
  } = useArenaRealtime();

  const [mode, setMode] = useState<WorkspaceMode>('booking');
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<'all' | 'court-a' | 'court-b'>(
    'all'
  );
  const [lookupOpen, setLookupOpen] = useState(false);
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);

  const [minuteTick, setMinuteTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayIso = useMemo(() => getTodayIsoDate(), [minuteTick]);

  // Automatically exit management view if session token is cleared/expired
  useEffect(() => {
    if (mode === 'management' && !isManagementUnlocked) {
      setMode('booking');
    }
  }, [isManagementUnlocked, mode]);

  const activeCourtCount = useMemo(
    () => courts.filter((c) => c.status === 'active').length,
    [courts]
  );

  const availableTodayCount = useMemo(() => {
    const now = new Date();
    const upcomingHours = OPERATING_HOURS.filter((hr) => !isSlotPast(todayIso, hr, now));
    const upcomingSet = new Set(upcomingHours);
    const activeCourts = courts.filter((c) => c.status === 'active');
    const totalPossible = activeCourts.length * upcomingHours.length;
    const activeCourtIds = new Set(activeCourts.map((c) => c.id));
    const bookedUpcoming = bookings
      .filter(
        (b) =>
          b.date === todayIso &&
          b.status !== 'Dibatalkan' &&
          activeCourtIds.has(b.courtId)
      )
      .reduce(
        (sum, b) => sum + b.slots.filter((hr) => upcomingSet.has(hr)).length,
        0
      );
    return Math.max(0, totalPossible - bookedUpcoming);
  }, [bookings, courts, minuteTick, todayIso]);

  const handleNavigate = (targetMode: WorkspaceMode, sectionId?: string) => {
    if (targetMode === 'management' && !isManagementUnlocked) {
      setPasscodeModalOpen(true);
      return;
    }

    setMode(targetMode);
    if (targetMode === 'booking' && sectionId) {
      window.setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 40);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectCourtAndScroll = (filter: 'all' | 'court-a' | 'court-b') => {
    setSelectedCourtFilter(filter);
    handleNavigate('booking', 'jadwal-live');
  };

  const handleUnlockSuccess = async (passcode: string) => {
    await unlockManagement(passcode);
    setPasscodeModalOpen(false);
    setMode('management');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLockManagement = () => {
    lockManagement();
    setMode('booking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar mode={mode} onChangeMode={handleNavigate} />

      <main className="flex-1">
        {mode === 'booking' ? (
          <>
            <HeroSection
              availableTodayCount={availableTodayCount}
              activeCourtCount={activeCourtCount}
              onBookClick={() => handleNavigate('booking', 'jadwal-live')}
              onManagementClick={() => handleNavigate('management')}
            />

            <CourtsShowcase
              courts={courts}
              onSelectCourtFilter={handleSelectCourtAndScroll}
            />

            <LiveScheduleMatrix
              courts={courts}
              bookings={bookings}
              holds={holds}
              connectionStatus={connectionStatus}
              onlineCount={onlineCount}
              isLoading={isLoading}
              authUserEmail={authUser?.email || null}
              authUserName={authUser?.displayName || null}
              onSignInGoogle={signInWithGoogle}
              onSignOutGoogle={signOutUser}
              selectedCourtFilter={selectedCourtFilter}
              onSelectCourtFilter={setSelectedCourtFilter}
              onSyncHold={syncHold}
              onCreateBooking={createBooking}
              onOpenLookup={() => setLookupOpen(true)}
            />
          </>
        ) : (
          <Suspense
            fallback={
              <section className="min-h-[calc(100vh-140px)] bg-slate-50 py-10">
                <div className="mx-auto max-w-[1280px] space-y-6 px-4 sm:px-6 lg:px-8">
                  <div className="h-14 w-72 animate-pulse rounded-lg bg-slate-200" />
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-28 animate-pulse rounded-xl bg-white border border-slate-200" />
                    ))}
                  </div>
                  <div className="h-72 animate-pulse rounded-xl bg-white border border-slate-200" />
                </div>
              </section>
            }
          >
            <ManagementDashboard
              courts={courts}
              bookings={bookings}
              connectionStatus={connectionStatus}
              onlineCount={onlineCount}
              isLoading={isLoading}
              onCreateBooking={createBooking}
              onUpdateBooking={updateBooking}
              onDeleteBooking={deleteBooking}
              onUpdateCourt={updateCourt}
              onLockManagement={handleLockManagement}
            />
          </Suspense>
        )}
      </main>

      <Footer onNavigate={handleNavigate} />

      <Suspense fallback={null}>
        {lookupOpen && (
          <BookingLookupModal
            open={lookupOpen}
            onClose={() => setLookupOpen(false)}
            bookings={bookings}
            courts={courts}
          />
        )}

        {passcodeModalOpen && (
          <ManagementPasscodeModal
            open={passcodeModalOpen}
            onClose={() => setPasscodeModalOpen(false)}
            onUnlock={handleUnlockSuccess}
            authUserEmail={authUser?.email || null}
          />
        )}
      </Suspense>
    </div>
  );
}
