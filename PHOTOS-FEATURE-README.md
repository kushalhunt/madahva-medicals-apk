# New: Patient Photos via QR Upload

## What's new
Every patient card in **Patients** now has a **Photos** button. Clicking it opens a window with:

- A **QR code** unique to that patient
- A **live gallery** of everything uploaded for them

Scan the QR code with any phone on the same Wi-Fi. It opens a simple upload page pre-linked to that one patient — no app install needed. Photos taken/chosen there upload straight into that patient's folder and appear in the desktop gallery within a few seconds (it polls automatically while the window is open).

**Photos never mix between patients** — every upload is tagged with that patient's ID both in the database and in the file path on disk (`MadhavaClinicDB/photos/<patientId>/...`), and the QR code itself encodes the patient ID, so scanning patient A's code can only ever upload into patient A's folder.

Each patient card also shows a small "X photos" pill so you can see who has images on file while searching, without opening anything.

## Setup (one-time, on the clinic PC)
1. Unzip this folder, replacing your old project folder (or copy `server.js`, `main.js`, `package.json`, and the `app/` folder over your existing install).
2. Open a terminal in the folder and run:
   ```
   npm install
   ```
   This pulls in two new small libraries (`multer` for handling uploads, `qrcode` for generating the QR images) plus everything already used.
3. Start it as usual:
   ```
   npm start
   ```
   or rebuild the installer with `npm run dist` if you distribute the packaged `.exe`.

## Important: Wi-Fi requirement
For phones to reach the QR upload page, the clinic PC and the phone must be **on the same Wi-Fi network**. The app now also listens on your PC's local network address (not just 127.0.0.1) so this works — you'll see a line like:
```
On your Wi-Fi network: http://192.168.1.42:3791
```
printed when the app starts.

If the phone can't load the page after scanning:
- Confirm both devices are on the same Wi-Fi (not the phone's mobile data).
- Windows may prompt to allow **Node.js** through the firewall the first time — click **Allow**.

## What got changed under the hood
- `server.js` — new `/api/photos` routes (list/upload/delete), `/api/patients/:id/qr` (generates the QR), `/api/patients/:id/basic` (safe minimal lookup for the phone page), and static serving of the photo files and the mobile upload page. Server now binds to `0.0.0.0` instead of only `127.0.0.1`.
- `app/mobile/upload.html` — new, the page a phone lands on after scanning.
- `app/app.js`, `app/index.html`, `app/styles.css` — new Photos modal, gallery grid, and QR display in the desktop app.
- `package.json` — added `multer` and `qrcode` dependencies.

Nothing about your existing patients, bills, or appointments data changes — this is purely additive.
