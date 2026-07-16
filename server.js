// Clearapy Call Gate
// Handles: caller dials your Twilio number -> hears intro -> pays via keypad (Twilio <Pay> + Stripe)
// -> on success, call bridges to your real phone -> on failure/decline, polite message + hangup.

const express = require('express');
const { twiml: { VoiceResponse } } = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---- Config (set these as environment variables, never hardcode) ----
const REAL_PHONE_NUMBER = process.env.REAL_PHONE_NUMBER; // e.g. +17065551234 — where the call bridges to after payment
const PAY_CONNECTOR_NAME = process.env.PAY_CONNECTOR_NAME || 'Default'; // name you gave the Stripe connector in Twilio console
const CHARGE_AMOUNT = process.env.CHARGE_AMOUNT || '5.00';
const RING_TIMEOUT_SECONDS = parseInt(process.env.RING_TIMEOUT_SECONDS || '25', 10);

// ---- Step 1: Incoming call hits this first ----
app.post('/voice', (req, res) => {
  const response = new VoiceResponse();

  response.say(
    { voice: 'Polly.Joanna' },
    "Thanks for calling. This is a five dollar paid check in call. " +
    "Please enter your card number on your keypad now, followed by the pound sign."
  );

  response.pay({
    paymentConnector: PAY_CONNECTOR_NAME,
    chargeAmount: CHARGE_AMOUNT,
    action: '/pay-action',
    statusCallback: '/pay-status',
    timeout: 10,
    maxAttempts: 3
  });

  // If <Pay> never completes (e.g. caller hangs up mid-entry), this runs as a fallback
  response.say({ voice: 'Polly.Joanna' }, "We didn't receive a payment. Goodbye.");
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// ---- Step 2: Twilio posts here after the <Pay> attempt finishes ----
app.post('/pay-action', (req, res) => {
  const response = new VoiceResponse();
  const result = req.body.Result; // e.g. "success", "payment-connector-error", "validation-error", "call-completed"

  if (result === 'success') {
    response.say({ voice: 'Polly.Joanna' }, "Payment received. Connecting you now.");
    const dial = response.dial({
      timeout: RING_TIMEOUT_SECONDS,
      action: '/dial-status' // handles no-answer / busy
    });
    dial.number(REAL_PHONE_NUMBER);
  } else {
    response.say(
      { voice: 'Polly.Joanna' },
      "Sorry, that payment didn't go through. Please check your card details and call back. Goodbye."
    );
    response.hangup();
  }

  res.type('text/xml');
  res.send(response.toString());
});

// ---- Step 3: if the bridged call isn't answered (voicemail-style fallback) ----
app.post('/dial-status', (req, res) => {
  const response = new VoiceResponse();
  const dialCallStatus = req.body.DialCallStatus; // "completed", "no-answer", "busy", "failed"

  if (dialCallStatus !== 'completed') {
    response.say(
      { voice: 'Polly.Joanna' },
      "Sorry, no one is available to take your call right now. " +
      "Your payment will be refunded. Please try again later."
    );
    // NOTE: refunds via Twilio's Stripe connector are NOT automatic.
    // You'll need to manually refund in your Stripe dashboard when this happens.
    // See README for how to catch this case in your own records.
  }
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// ---- Optional: logging endpoint for payment status events (doesn't control call flow) ----
app.post('/pay-status', (req, res) => {
  console.log('Payment status update:', JSON.stringify(req.body));
  res.sendStatus(200);
});

// ---- Health check ----
app.get('/', (req, res) => res.send('Clearapy call gate is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
