# Phone Sync & Hosting Guide (Nov 28 Stall)

Your stall app works in three modes depending on where you open it and whether you are on the same Wi-Fi or cellular/different Wi-Fi.

## Important Truth About Static GitHub Pages (`github.io`)

GitHub Pages only serves static HTML/CSS/JS files. By itself, a `github.io` page stores data inside **that single phone's browser (`IndexedDB`)**, which does **not** sync automatically to a second phone or laptop.

To get **different-Wi-Fi phone access + live multi-device updates + persistent storage**, pick either Option 1 or Option 2 below.

---

## Option 1: Host on Your Laptop + Live Tunnel for Your Phone (Zero Cloud Account Needed)

This uses your local SQLite database stored safely outside OneDrive (`%LOCALAPPDATA%\gaming-stall-ops\stall.db`) and pushes live updates (`SSE`) to any phone on 4G/5G or another Wi-Fi.

1. Double-click `start-stall.bat` (or run `npm start`) on the stall laptop.
2. In a second terminal, start a temporary HTTPS tunnel:
   ```powershell
   npm run tunnel
   ```
   (Tip: Install Cloudflare's fast zero-interstitial client once via `winget install --id Cloudflare.cloudflared -e`.)
3. Copy the HTTPS tunnel URL printed in the terminal (for example `https://something.trycloudflare.com`).
4. Open that URL on your phone (or open your `github.io` link and paste that tunnel URL into **Phone Sync -> Remote Server / Tunnel URL**).
5. **Security tip**: Set `STALL_PIN=your4digits` in `.env` before running `npm start` so nobody guessing the tunnel URL can modify your payments or timers.

---

## Option 2: Host Static UI on GitHub Pages (`github.io`) + Free Firebase Realtime DB Sync

Use this if **all 7 laptops** (including yours) are busy running games and you do **not** want to depend on a laptop server at all.

1. Push `gaming-stall-ops` to a **public** GitHub repository (`GitHub Free` requires public repos for GitHub Pages) and enable **Settings -> Pages -> GitHub Actions** (`.github/workflows/deploy-pages.yml` is already included).
   - Or deploy to Firebase Hosting (`firebase.json` is already included, works with private repos).
2. Create a free Firebase project and enable **Realtime Database** (Spark free tier).
3. On your phone, open the `github.io` URL, go to **Phone Sync**, select **Firebase Realtime DB URL**, paste your `https://<project>-default-rtdb.firebaseio.com` URL, and tap **Save & Reconnect**.
4. Now any phone or laptop with that DB URL shares live `+1 Cash`, `+1 UPI`, and 30-minute countdown updates over any Wi-Fi or 5G.

---

## Option 3: Phone-Only Offline Mode (`github.io` without backend)

If internet drops at the venue, open the `github.io` (or cached PWA) page on your phone. Every `+1` payment, session timer, and game list saves inside your phone's `IndexedDB`. Export a backup JSON/CSV from **Records & Math** or **Phone Sync** at the end of the day.
