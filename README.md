# Gaming Stall Ops (Nov 28 Counter)

Phone-first live operations counter for running a multi-laptop gaming stall at **₹149 per 30 minutes** (continuous no-pause timer, Cash/UPI split, `+1` payment cross-check against slots played, per-laptop game finder, shift revenue math table, and optional Google Antigravity SDK shift analyst).

## Quick Start (Local Host on Port `4321`)

```powershell
cd "c:\Users\mohit\OneDrive\Documents\github repos\gaming-stall-ops"
npm start
```

Or double-click `start-stall.bat`.

- App URL: `http://localhost:4321` (plus your local Wi-Fi LAN IP shown in the console & **Phone Sync** tab with a scannable QR code).
- Live SQLite database path: `%LOCALAPPDATA%\gaming-stall-ops\stall.db` (stored outside OneDrive so sync never locks the database).

## Phone Access on a Different Wi-Fi

See [HOSTING_GUIDE.md](./HOSTING_GUIDE.md) for:
- Live HTTPS tunnel (`npm run tunnel`) connected to your port `4321` SQLite database + optional `STALL_PIN`.
- Deploying `docs/` (`npm run build:pages`) to **GitHub Pages (`github.io`)** or **Firebase Hosting** with live **Firebase Realtime Database** sync or phone-local `IndexedDB` storage.

## Google Antigravity SDK Shift Analyst (`agent/`)

Requires `uv` and a `GEMINI_API_KEY` environment variable (or in `.env`):

```powershell
$env:UV_PROJECT_ENVIRONMENT="$env:LOCALAPPDATA\gaming-stall-ops\agent-venv"
uv --directory agent sync
uv --directory agent run python stall_analyst.py summary
```

## Tests

```powershell
npm test
```
