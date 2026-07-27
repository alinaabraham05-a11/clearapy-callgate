const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const REAL_PHONE_NUMBER = process.env.REAL_PHONE_NUMBER;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+18633342447';
const CHARGE_AMOUNT = parseInt(process.env.CHARGE_AMOUNT || '500'); // $5 in cents
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://clearapy-callgate-production.up.railway.app';

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Clearapy callgate online' });
});

// ─── CREATE STRIPE CHECKOUT SESSION ──────────────────────────────────────────
// Landing page calls this to open Stripe checkout
// On success, Stripe redirects to /call-success?session_id=xxx
// which then triggers the outbound call
app.post('/create-checkout', async (req, res) => {
  try {
    const { demographic } = req.body; // e.g. "truck-drivers", "night-shift", etc.

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Clearapy Check-In Call — $5/hr',
              description: 'By completing this purchase you confirm that you have read and agree to Clearapy\'s terms of conduct: all callers must remain respectful. Sexual conversation, solicitation, or requests for operator personal information are strictly prohibited and will result in immediate call termination with no refund.',
            },
            unit_amount: CHARGE_AMOUNT,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // After payment, redirect back to your site with session_id
      success_url: `${BASE_URL}/call-ready?session_id={CHECKOUT_SESSION_ID}&demo=${demographic || 'general'}`,
      cancel_url: `https://joinclearapy.com`,
      // Enable Apple Pay / Google Pay automatically
      payment_method_options: {
        card: {
          setup_future_usage: 'on_session', // Saves card for future autofill
        },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CALL-READY PAGE ─────────────────────────────────────────────────────────
// Served after successful Stripe payment
// Verifies payment and shows a "Connect My Call" button
app.get('/call-ready', async (req, res) => {
  const { session_id, demo } = req.query;

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).send('Payment not confirmed. Please try again.');
    }

    // Serve confirmation page with number shown prominently
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clearapy — Your Number Is Ready</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #1a1a1a;
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 56px 48px;
      max-width: 520px;
      width: 100%;
      text-align: center;
    }
    .checkmark { font-size: 3rem; margin-bottom: 16px; }
    h1 {
      font-family: 'Playfair Display', serif;
      font-size: 2rem;
      margin-bottom: 10px;
      line-height: 1.2;
    }
    .sub {
      font-size: 1rem;
      color: rgba(255,255,255,0.6);
      line-height: 1.65;
      margin-bottom: 36px;
      font-weight: 300;
    }
    .number-box {
      background: rgba(122,158,126,0.15);
      border: 2px solid #7A9E7E;
      border-radius: 14px;
      padding: 28px 24px;
      margin-bottom: 28px;
    }
    .number-label {
      font-size: 0.8rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #B5CCB7;
      margin-bottom: 10px;
    }
    .phone-number {
      font-family: 'Playfair Display', serif;
      font-size: 2.8rem;
      color: white;
      letter-spacing: 0.06em;
      line-height: 1;
      margin-bottom: 8px;
    }
    .number-note {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.5);
    }
    .call-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 18px 40px;
      background: #7A9E7E;
      color: white;
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.25s;
      font-family: 'DM Sans', sans-serif;
      width: 100%;
      margin-bottom: 16px;
    }
    .call-btn:hover { background: #6a8e6e; }
    .desktop-note {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.4);
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .crisis {
      font-size: 0.8rem;
      color: rgba(255,255,255,0.3);
      padding-top: 24px;
      border-top: 1px solid rgba(255,255,255,0.08);
      line-height: 1.6;
    }
    .conduct-warn {
      background: rgba(196,112,58,0.12);
      border: 1px solid rgba(196,112,58,0.5);
      border-radius: 10px;
      padding: 20px 22px;
      margin: 20px 0;
      text-align: left;
    }
    .conduct-warn-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #C4703A;
      margin-bottom: 8px;
    }
    .conduct-warn p {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.6);
      line-height: 1.65;
    }
    .conduct-warn strong { color: white; }
  </style>
</head>
<body>
  <div class="card">
    <div class="checkmark">✅</div>
    <h1>Payment confirmed.</h1>
    <p class="sub">Here's your number. A real person is ready to pick up right now — no appointment, no waiting room.</p>

    <div class="number-box">
      <div class="number-label">Your access number</div>
      <div class="phone-number">(863) 334-2447</div>
      <div class="number-note">Save this number. It's yours for the duration of your call.</div>
    </div>

    <a href="tel:+18633342447" class="call-btn">
      📞 Tap to Call Now
    </a>
    <p class="desktop-note">On mobile, tapping the button dials automatically. On desktop, dial <strong>(863) 334-2447</strong> from your phone.</p>

    <div class="conduct-warn">
      <div class="conduct-warn-title">⚠️ Terms of Conduct Reminder</div>
      <p>All callers must remain respectful throughout the call. <strong>Sexual conversation, solicitation, explicit content, or requests for personal information about our operators are strictly prohibited.</strong> Violation of these terms will result in immediate termination of the call with no refund.</p>
    </div>

    <p class="crisis">This is not a crisis line. If you are in immediate danger, call or text <strong>988</strong>.</p>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Call ready error:', err);
    res.status(500).send('Something went wrong. Please try again or contact support.');
  }
});

// ─── TWILIO VOICE WEBHOOK ─────────────────────────────────────────────────────
// Twilio calls this when someone dials your Twilio number
// It forwards the call to your real number
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.dial(REAL_PHONE_NUMBER);
  res.type('text/xml');
  res.send(twiml.toString());
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
