// Server initialized
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mankatha';

// ── MIDDLEWARE ──
app.use(cors({ origin: '*' })); // restrict in production to your domain
app.use(express.json({ limit: '5mb' })); // signatures are base64 ~100-200kb

// ── MONGODB CONNECTION ──
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected:', MONGO_URI))
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ── SCHEMA ──
const signatureSchema = new mongoose.Schema({
  reg:           { type: String, required: true, unique: true, index: true },
  name:          { type: String, required: true },
  signatureData: { type: String, required: true }, // base64 PNG
  signedAt:      { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now },
  ip:            { type: String },                 // who signed (optional audit)
}, { timestamps: true });

const Signature = mongoose.model('Signature', signatureSchema);

// ── ROUTES ──

// Health check (used by HTML to detect if API is live)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Get ALL signatures (so HTML can render all on page load)
app.get('/api/signatures', async (req, res) => {
  try {
    const sigs = await Signature.find({}, 'reg name signatureData signedAt -_id').lean();
    res.json(sigs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ONE signature by reg number
app.get('/api/signatures/:reg', async (req, res) => {
  try {
    const sig = await Signature.findOne(
      { reg: req.params.reg },
      'reg name signatureData signedAt -_id'
    ).lean();
    if (!sig) return res.status(404).json({ error: 'Signature not found' });
    res.json(sig);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/update a signature (upsert — same person can re-sign)
app.post('/api/signatures', async (req, res) => {
  const { reg, name, signatureData } = req.body;

  if (!reg || !name || !signatureData) {
    return res.status(400).json({ error: 'reg, name, and signatureData are required' });
  }
  // Basic validation — must be a base64 PNG
  if (!signatureData.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'signatureData must be a base64 PNG data URL' });
  }

  try {
    const sig = await Signature.findOneAndUpdate(
      { reg },
      {
        reg, name, signatureData,
        signedAt: new Date(),
        ip: req.ip
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, reg: sig.reg, signedAt: sig.signedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a signature (admin use)
app.delete('/api/signatures/:reg', async (req, res) => {
  try {
    const result = await Signature.deleteOne({ reg: req.params.reg });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, deleted: req.params.reg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the HTML report itself (optional)
app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`🚀 Mankatha API running at http://localhost:${PORT}`);
  console.log(`   GET  /api/signatures          — all signatures`);
  console.log(`   GET  /api/signatures/:reg      — one by reg no`);
  console.log(`   POST /api/signatures           — save/update`);
  console.log(`   DEL  /api/signatures/:reg      — delete`);
});
