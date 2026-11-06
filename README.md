# Invitations

A warm little home for your get-togethers: create invitations, share a link, and see who's coming.

## Run locally

Use Node.js 22.12 or newer. Install the frontend and API dependencies:

```powershell
npm.cmd install
npm.cmd --prefix server install
```

Create `server/.env` using `server/.env.example` as a reference. Connect it to the project's existing PostgreSQL database; the API expects the `users`, `invitations`, and `rsvps` tables.

Start the API in one terminal:

```powershell
cd server
npm.cmd start
```

Start the frontend from this directory in another:

```powershell
npm.cmd run dev
```

Open **http://localhost:5173**. The API runs at **http://localhost:3001**; its health endpoint is `/api/health`. On macOS or Linux, use `npm` in place of `npm.cmd`.

The development and build scripts use Vite's native configuration loader to work with this Windows environment. If the frontend runs on another origin, update `CLIENT_URL` in `server/.env`. Set `VITE_API_URL` in a frontend `.env.local` when using a different API.

Configure `SMTP_HOST`, `SMTP_PORT`, and `MAIL_FROM` (or `SMTP_USER` as the sender), plus `SMTP_USER` and `SMTP_PASS` when your mail server requires authentication. Email is required for password recovery. Without it, guest replies still save, RSVP emails are skipped, and recovery clearly reports that email is unavailable. Set `CLIENT_URL` to the real frontend origin, using HTTPS in production; recovery links always use this configured origin. Keep environment files and credentials out of version control.

## Account administration

Register the owner's account normally, then enable administrator access from the API host. Run this **inside `server/`**, using the existing account's email and the same `DATABASE_URL` as the API:

```powershell
npm.cmd run make-admin -- owner@example.com
```

Sign in again and open **`/admin`** (or choose **Admin** in the navigation). The command promotes an existing account; public signup always creates an ordinary member. There is no default administrator password or public role-claim endpoint. Administrators can promote other members from the dashboard. Existing accounts remain members until explicitly promoted.

The dashboard includes account totals, name/email search, role/status filters, pagination, invitation counts, join/sign-in dates, account editing, suspension/reactivation, and password reset emails. Account changes and admin recovery requests are recorded in the latest-50 activity feed. Sensitive actions require the acting administrator's password. Self-suspension, self-demotion, and removal of the last active administrator are blocked, including concurrent changes.

Suspension preserves account and invitation data, revokes all existing sessions, blocks sign-in, and hides the account's shared invitations and RSVP endpoints. Reactivation restores access to shared invitations, but the member must sign in again. Changing email or role also revokes existing sessions. Password changes retain the current session with a new token and sign out other sessions.

## Password recovery

Choose **Forgot password?** on the login page, enter the account email, and follow the emailed link to **`/reset-password`**. Links expire in 30 minutes, work once, and are stored only as SHA-256 hashes. The token travels in the URL fragment so it stays out of HTTP request logs and referrer headers. A successful reset signs out all previous sessions and returns to login. Changing an email address also invalidates outstanding reset links.

Public recovery responses are identical for active, absent, and suspended accounts, with a minimum response delay; delivery failures are logged on the API without revealing account existence. Repeated mail is limited by a one-minute cooldown and a per-email limit. Login, signup, recovery, reset, password changes, and admin confirmations have database-backed rate limits that persist across API instances. Configure `TRUST_PROXY_HOPS` only to match your deployment's trusted reverse proxies (default: one hop on Vercel, zero elsewhere).

The API automatically adds the account columns and supporting tables to the existing database at startup, within a transaction. Startup fails closed if migration fails. Back up the database before deploying schema changes. No production data or email delivery is used by the tests.

## Checks

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The tests cover session expiry, remembered versus tab-only sign-in, token rotation, blocked browser storage, API failures, and canceled requests. Account integration tests use an isolated in-memory PostgreSQL database through PGlite and an email stub. They exercise authorization, role escalation attempts, concurrency, account suspension, audit records, rate limits, reset expiry/reuse, and mail failure handling. Install both frontend and server dependencies before running them.

## Features

- Responsive login and signup, password visibility, autofill, and inline validation.
- Remembered or tab-only sign-in; expired credentials return you to login.
- Light, dark, and device themes.
- Invitation editor with live preview and an optional map pin.
- Searchable invitations and guest replies, attendance summaries, and sharing.
- Public invitations with accessible RSVP controls and reply confirmation.
- Administrator dashboard with account management and an activity log.
- Email password recovery with expiring, single-use links and session revocation.
