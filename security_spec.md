# Security Specification — Smash Arena Firestore Rules

## 1. Data Invariants
1. **PII Isolation**: Customer WhatsApp numbers (`customerPhone`) and email addresses (`customerEmail`) MUST NEVER exist on public `/bookings/{bookingId}` documents; they live strictly in `/booking_contacts/{bookingId}` and are readable only by `ownerUid` or verified admin.
2. **Court Integrity**: Bookings and holds may only target `court-a` or `court-b` with valid `YYYY-MM-DD` date strings and 1–16 slot hours in `8..23`.
3. **Owner & Verified Auth Binding**: Only verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) can create bookings, holds, or contact records, and `ownerUid` MUST equal `request.auth.uid`.
4. **Atomic Booking + Contact Creation**: Creating a customer booking in `/bookings/{bookingId}` requires `/booking_contacts/{bookingId}` to be created in the exact same write batch (`existsAfter(...)`), preventing orphaned bookings or leaked contact records.
5. **Admin Isolation**: Only verified admins (bootstrapped runtime admin `riskykharis00@gmail.com` or registered `/admins/{uid}`) may update court pricing/status, create `tournament`/`maintenance` blocks, update booking payment/check-in statuses, or delete bookings.
6. **Terminal State Locking**: Once a booking reaches `Selesai` or `Dibatalkan`, non-admin owners cannot mutate it.
7. **Strict Timestamps & Keys**: Every create enforces `createdAt == request.time && updatedAt == request.time` and exact `keys().hasAll(...) && keys().hasOnly(...)` schema checks; every update enforces `updatedAt == request.time`, immutable `createdAt`/`ownerUid`, and `affectedKeys().hasOnly(...)`.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Fail with PERMISSION_DENIED)
1. **Unauthenticated Booking Create**: Anonymous/unauthenticated caller tries `create` on `/bookings/bk-1`.
2. **Ghost/Shadow Field Injection**: Verified user adds `isAdmin: true` or `shadowField: "x"` on `/bookings/bk-1`.
3. **UID Spoofing**: Verified user A (`uid-a`) creates `/bookings/bk-2` with `ownerUid: "uid-b"`.
4. **Client Timestamp Forgery**: Verified user submits `createdAt: new Date(0)` instead of `serverTimestamp()`.
5. **PII Leak Attempt (Cross-User Get/List)**: Verified user A reads `/booking_contacts/bk-user-b` or lists `/booking_contacts` without filtering `ownerUid == uid-a`.
6. **Non-Admin Tournament/Maintenance Block**: Non-admin user tries to create `/bookings/bk-3` with `kind: "tournament"`.
7. **Non-Admin Court Tariff Tampering**: Non-admin user updates `/courts/court-a` to set `hourlyPrice: 1`.
8. **ID Poisoning**: Caller attempts `create` at `/bookings/${'a'.repeat(200)}` or `/bookings/bad$id`.
9. **Array Bombing**: Caller submits `slots` with 50 integers (`slots.size() > 16`) or `addons` with 20 objects.
10. **Non-Admin Status Escalation**: Regular user updates their own booking `/bookings/bk-1` from `status: "Menunggu"` to `status: "Lunas"`.
11. **Terminal State Bypass**: Regular user updates their `Dibatalkan` booking back to `Menunggu`.
12. **Self-Assigned Admin**: Non-admin user tries to `create` `/admins/{myUid}` to gain admin privileges.
