# Website Booking → Desktop App Setup

Your website's booking form already collects the right fields and is already
written to send them to a Google Sheet — it just needs the sheet connected.
This is completely free (a personal Google account is all you need).

Takes about 10 minutes, one-time.

## 1. Create the sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet**.
2. Rename it something like "Madhava Clinic Bookings".

## 2. Add the relay script

1. In the sheet, go to **Extensions → Apps Script**.
2. Delete anything in the editor and paste in the entire contents of
   `BookingRelay.gs` (included alongside this file).
3. Click the **Save** icon (or Ctrl+S).

## 3. Deploy it as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Google will ask you to authorize the script — click through **Authorize
   access**, choose your Google account, then **Advanced → Go to (project
   name) → Allow**. (This warning appears because it's a script you just
   wrote yourself, not a published app — it's expected and safe.)
6. Copy the **Web app URL** it gives you (looks like
   `https://script.google.com/macros/s/AKfycb.../exec`).

## 4. Connect the website

1. Open your website's HTML file.
2. Find this line (around line 1902):
   ```js
   const SCRIPT_URL = 'YOUR_GOOGLE_SCRIPT_URL_HERE';
   ```
3. Replace `YOUR_GOOGLE_SCRIPT_URL_HERE` with the Web app URL you copied.
4. Re-upload/publish the website file wherever it's hosted.

## 5. Connect the clinic app

1. Open `server.js` in your project folder.
2. Find this line near the top:
   ```js
   const BOOKING_SCRIPT_URL = 'YOUR_GOOGLE_SCRIPT_URL_HERE';
   ```
3. Paste the same Web app URL in there.
4. Restart the app (`npm start`, or reinstall if you're running the packaged
   version — see the main README for that step).

## 6. Test it

1. Go to your live website, fill out the booking form, and submit.
2. Within about a minute, open the clinic app → **Schedule** tab. You should
   see it appear under **Website Booking Requests** with a red count badge
   next to "Schedule" in the sidebar.
3. Click **Review & confirm** — it'll try to match the phone number to an
   existing patient, or offer to create a new one. Pick the appointment date
   & time, then **Confirm & add to schedule**.
4. It now shows up as a normal appointment. You can also **Dismiss** a
   request if it's spam or a duplicate — nothing from the website ever
   becomes a real appointment without you tapping Confirm first.

## Notes

- Your clinic PC needs an internet connection for this to work (it checks
  the Google Sheet every 60 seconds) — no port-forwarding or router
  changes needed, and nothing about your local server is exposed to the
  internet.
- If you ever want to see the raw list, the Google Sheet itself is a handy
  backup log of every booking ever submitted, synced or not.
