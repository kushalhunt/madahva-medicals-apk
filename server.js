const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');

const app = express();
const PORT = 3791;

app.use(cors());
app.use(express.json());

// Store MongoDB data in user's home directory
const DB_PATH = path.join(os.homedir(), 'MadhavaClinicDB');
const MONGO_URI = `mongodb://127.0.0.1:27017/madhava_clinic`;

// Store patient photos on disk, organized per patient so uploads never mix
const PHOTOS_DIR = path.join(DB_PATH, 'photos');
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// Paste the Google Apps Script "Web app" URL here to pull in website booking
// requests automatically (see WEBSITE-BOOKING-SETUP.md for how to create it).
// Leave as-is to disable syncing.
const BOOKING_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx7acDpxTK_NB8nVwMwyPOel-lEt3mlYr6XsnXKdnHPY-J9-CAhvBSGZY2JIlPlko-X/exec';

const visitSchema = new mongoose.Schema({
  id: String,
  date: String,
  diagnosis: String,
  symptoms: String,
  vitals: String,
  medicines: String,
  notes: String,
  createdAt: String,
});

const patientSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  patientCode: String,
  name: String,
  age: String,
  phone: String,
  gender: String,
  address: String,
  allergies: String,
  currentMedicines: String,
  diagnosis: String,
  symptoms: String,
  notes: String,
  visits: [visitSchema],
  createdAt: String,
  updatedAt: String,
});

const billSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  patientId: String,
  patientName: String,
  consultation: Number,
  medicines: Number,
  tests: Number,
  discount: Number,
  paid: Number,
  total: Number,
  balance: Number,
  status: String,
  paymentMode: String,
  notes: String,
  createdAt: String,
  updatedAt: String,
});

const appointmentSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  patientId: String,
  patientName: String,
  phone: String,
  days: Number,
  date: String,
  reason: String,
  done: Boolean,
  createdAt: String,
  updatedAt: String,
});

const metaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: String,
});

const photoSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  patientId: { type: String, index: true },
  patientCode: String,
  patientName: String,
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
  note: String,
  createdAt: String,
});

const bookingRequestSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  sourceId: { type: String, unique: true, sparse: true }, // id from the Google Sheet row, used to de-dupe
  name: String,
  phone: String,
  age: String,
  reason: String,
  requestedDateTime: String,
  message: String,
  submittedAt: String,
  status: { type: String, default: 'pending' }, // pending | accepted | dismissed
  linkedPatientId: String,
  linkedAppointmentId: String,
  createdAt: String,
});

const Patient = mongoose.model('Patient', patientSchema);
const Bill = mongoose.model('Bill', billSchema);
const Appointment = mongoose.model('Appointment', appointmentSchema);
const Meta = mongoose.model('Meta', metaSchema);
const Photo = mongoose.model('Photo', photoSchema);
const BookingRequest = mongoose.model('BookingRequest', bookingRequestSchema);

// ── Patient Routes ────────────────────────────────────────

app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ updatedAt: -1 });
    res.json(patients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/patients', async (req, res) => {
  try {
    await Patient.findOneAndUpdate(
      { id: req.body.id },
      req.body,
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    await Patient.deleteOne({ id: req.params.id });
    await Bill.deleteMany({ patientId: req.params.id });
    await Appointment.deleteMany({ patientId: req.params.id });
    await Photo.deleteMany({ patientId: req.params.id });
    const dir = path.join(PHOTOS_DIR, req.params.id);
    fs.rm(dir, { recursive: true, force: true }, () => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Minimal, safe-for-mobile lookup used by the QR upload page (no full record dump)
app.get('/api/patients/:id/basic', async (req, res) => {
  try {
    const p = await Patient.findOne({ id: req.params.id });
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    res.json({ id: p.id, name: p.name, patientCode: p.patientCode, phone: p.phone });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Full record, used by the "view on another device" QR page (mirrors the record read-only)
app.get('/api/patients/:id/full', async (req, res) => {
  try {
    const p = await Patient.findOne({ id: req.params.id }, { _id: 0, __v: 0 });
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// QR code that a phone/tablet can scan to jump straight to this patient.
// type=upload -> photo upload page (default), type=view -> read-only record mirror
app.get('/api/patients/:id/qr', async (req, res) => {
  try {
    const p = await Patient.findOne({ id: req.params.id });
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    const page = req.query.type === 'view' ? 'view.html' : 'upload.html';
    const url = `http://${getLocalIp()}:${PORT}/m/${page}?patientId=${encodeURIComponent(p.id)}`;
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#1a1a18', light: '#f7f5ef' } });
    res.json({ url, dataUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bill Routes ───────────────────────────────────────────

app.get('/api/bills', async (req, res) => {
  try {
    const bills = await Bill.find().sort({ createdAt: -1 });
    res.json(bills);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bills', async (req, res) => {
  try {
    await Bill.findOneAndUpdate(
      { id: req.body.id },
      req.body,
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bills/:id', async (req, res) => {
  try {
    await Bill.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Appointment Routes ────────────────────────────────────

app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ date: 1 });
    res.json(appointments);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/appointments', async (req, res) => {
  try {
    await Appointment.findOneAndUpdate(
      { id: req.body.id },
      req.body,
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    await Appointment.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Photo Routes ──────────────────────────────────────────
// Every photo is saved under PHOTOS_DIR/<patientId>/ and tagged with that
// patientId in Mongo, so uploads for one patient can never mix with another.

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const patientId = req.body.patientId;
    if (!patientId) return cb(new Error('patientId is required'));
    const dir = path.join(PHOTOS_DIR, patientId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage: photoStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

app.get('/api/photos', async (req, res) => {
  try {
    const filter = req.query.patientId ? { patientId: req.query.patientId } : {};
    const photos = await Photo.find(filter).sort({ createdAt: -1 });
    res.json(photos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/photos', (req, res) => {
  upload.array('images', 12)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const { patientId } = req.body;
      const patient = await Patient.findOne({ id: patientId });
      if (!patient) return res.status(404).json({ error: 'Patient not found' });
      if (!req.files || !req.files.length) return res.status(400).json({ error: 'No image files received' });

      const docs = await Promise.all(req.files.map(f => Photo.create({
        id: crypto.randomUUID(),
        patientId: patient.id,
        patientCode: patient.patientCode,
        patientName: patient.name,
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        note: req.body.note || '',
        createdAt: new Date().toISOString(),
      })));
      res.json({ ok: true, photos: docs });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

app.delete('/api/photos/:id', async (req, res) => {
  try {
    const photo = await Photo.findOne({ id: req.params.id });
    if (photo) {
      const filePath = path.join(PHOTOS_DIR, photo.patientId, photo.filename);
      fs.unlink(filePath, () => {});
      await Photo.deleteOne({ id: req.params.id });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve the saved photo files and the mobile QR-upload page
app.use('/photos', express.static(PHOTOS_DIR));
app.use('/m', express.static(path.join(__dirname, 'app', 'mobile')));

// ── Website Booking Requests ──────────────────────────────
// Bookings made on the public website land in a Google Sheet (via a free
// Apps Script Web App). We poll that sheet, drop new requests into a local
// inbox for staff to review, then acknowledge them so they aren't re-pulled.
// Nothing from the website becomes a real appointment without staff action.

app.get('/api/booking-requests', async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const requests = await BookingRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/booking-requests/:id/accept', async (req, res) => {
  try {
    const { patientId, newPatient, appointmentDate, notes } = req.body;
    const booking = await BookingRequest.findOne({ id: req.params.id });
    if (!booking) return res.status(404).json({ error: 'Booking request not found' });

    let finalPatientId = patientId;
    if (!finalPatientId && newPatient) {
      const p = await Patient.create({
        id: crypto.randomUUID(),
        patientCode: newPatient.patientCode,
        name: newPatient.name,
        phone: newPatient.phone,
        age: newPatient.age || '',
        visits: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      finalPatientId = p.id;
    }
    if (!finalPatientId) return res.status(400).json({ error: 'No patient specified' });

    const appt = await Appointment.create({
      id: crypto.randomUUID(),
      patientId: finalPatientId,
      date: appointmentDate,
      reason: notes || booking.reason || 'Website booking',
      createdAt: new Date().toISOString(),
    });

    booking.status = 'accepted';
    booking.linkedPatientId = finalPatientId;
    booking.linkedAppointmentId = appt.id;
    await booking.save();

    res.json({ ok: true, patientId: finalPatientId, appointmentId: appt.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/booking-requests/:id/dismiss', async (req, res) => {
  try {
    await BookingRequest.findOneAndUpdate({ id: req.params.id }, { status: 'dismissed' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function syncWebsiteBookings() {
  if (!BOOKING_SCRIPT_URL || BOOKING_SCRIPT_URL.includes('YOUR_GOOGLE_SCRIPT_URL_HERE')) return;
  try {
    const resp = await fetch(`${BOOKING_SCRIPT_URL}?action=list`);
    if (!resp.ok) return;
    const rows = await resp.json();
    if (!Array.isArray(rows)) return;

    for (const row of rows) {
      const sourceId = String(row.id || row.rowId || `${row.phone}-${row.datetime}-${row.submitted}`);
      const exists = await BookingRequest.findOne({ sourceId });
      if (exists) continue;

      await BookingRequest.create({
        id: crypto.randomUUID(),
        sourceId,
        name: row.name || '',
        phone: row.phone || '',
        age: row.age || '',
        reason: row.reason || '',
        requestedDateTime: row.datetime || '',
        message: row.message || '',
        submittedAt: row.submitted || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Acknowledge so the sheet doesn't resend this row on the next poll
      fetch(`${BOOKING_SCRIPT_URL}?action=ack&id=${encodeURIComponent(row.id || row.rowId || '')}`).catch(() => {});
    }
  } catch (e) {
    console.error('Website booking sync failed:', e.message);
  }
}

// ── Meta (backup timestamp) ───────────────────────────────

app.get('/api/meta', async (req, res) => {
  try {
    const m = await Meta.findOne({ key: 'lastBackupAt' });
    res.json({ lastBackupAt: m ? m.value : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/meta', async (req, res) => {
  try {
    await Meta.findOneAndUpdate(
      { key: 'lastBackupAt' },
      { key: 'lastBackupAt', value: req.body.lastBackupAt },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PIN Auth ───────────────────────────────────────────────
// Lightweight local gate for the desktop app, not a network security layer.

function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

app.get('/api/auth/status', async (req, res) => {
  try {
    const hash = await Meta.findOne({ key: 'pinHash' });
    res.json({ hasPin: Boolean(hash && hash.value) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/set-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!/^\d{4,6}$/.test(String(pin || ''))) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    const existing = await Meta.findOne({ key: 'pinHash' });
    if (existing && existing.value) return res.status(409).json({ error: 'PIN already set' });
    const salt = crypto.randomBytes(8).toString('hex');
    await Meta.findOneAndUpdate({ key: 'pinSalt' }, { key: 'pinSalt', value: salt }, { upsert: true });
    await Meta.findOneAndUpdate({ key: 'pinHash' }, { key: 'pinHash', value: hashPin(pin, salt) }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { pin } = req.body;
    const saltDoc = await Meta.findOne({ key: 'pinSalt' });
    const hashDoc = await Meta.findOne({ key: 'pinHash' });
    if (!saltDoc || !hashDoc) return res.status(400).json({ error: 'No PIN set' });
    const ok = hashPin(pin, saltDoc.value) === hashDoc.value;
    res.json({ ok });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-pin', async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!/^\d{4,6}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'New PIN must be 4-6 digits' });
    const saltDoc = await Meta.findOne({ key: 'pinSalt' });
    const hashDoc = await Meta.findOne({ key: 'pinHash' });
    if (!saltDoc || !hashDoc) return res.status(400).json({ error: 'No PIN set yet' });
    if (hashPin(currentPin, saltDoc.value) !== hashDoc.value) return res.status(401).json({ error: 'Current PIN is incorrect' });
    const newSalt = crypto.randomBytes(8).toString('hex');
    await Meta.findOneAndUpdate({ key: 'pinSalt' }, { key: 'pinSalt', value: newSalt }, { upsert: true });
    await Meta.findOneAndUpdate({ key: 'pinHash' }, { key: 'pinHash', value: hashPin(newPin, newSalt) }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bulk import ───────────────────────────────────────────

app.post('/api/import', async (req, res) => {
  try {
    const { patients, bills, appointments, meta } = req.body;
    for (const p of (patients || [])) {
      await Patient.findOneAndUpdate({ id: p.id }, p, { upsert: true });
    }
    for (const b of (bills || [])) {
      await Bill.findOneAndUpdate({ id: b.id }, b, { upsert: true });
    }
    for (const a of (appointments || [])) {
      await Appointment.findOneAndUpdate({ id: a.id }, a, { upsert: true });
    }
    if (meta && meta.lastBackupAt) {
      await Meta.findOneAndUpdate(
        { key: 'lastBackupAt' },
        { key: 'lastBackupAt', value: meta.lastBackupAt },
        { upsert: true }
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Health check ──────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Find this PC's LAN IP so the QR code points somewhere the phone can reach.
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// ── Start ─────────────────────────────────────────────────

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected');
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    console.error('Make sure MongoDB is installed and running.');
    process.exit(1);
  }

  // Bind to all interfaces (not just 127.0.0.1) so phones on the same
  // Wi-Fi/LAN can reach the QR upload page and post photos here.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Madhava API running on http://127.0.0.1:${PORT}`);
    console.log(`On your Wi-Fi network: http://${getLocalIp()}:${PORT}`);
  });

  syncWebsiteBookings();
  setInterval(syncWebsiteBookings, 60 * 1000);
}

startServer();

module.exports = app;
