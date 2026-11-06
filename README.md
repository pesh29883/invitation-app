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

SMTP is optional. Without it, guest replies are saved but email notifications are skipped. Keep environment files and credentials out of version control.

## Checks

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The tests cover session expiry, remembered versus tab-only sign-in, blocked browser storage, API errors, and canceled requests.

## Features

- Responsive login and signup, password visibility, autofill, and inline validation.
- Remembered or tab-only sign-in; expired credentials return you to login.
- Light, dark, and device themes.
- Invitation editor with live preview and an optional map pin.
- Searchable invitations and guest replies, attendance summaries, and sharing.
- Public invitations with accessible RSVP controls and reply confirmation.
