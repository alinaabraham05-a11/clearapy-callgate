# Clearapy Call Gate — Setup Guide

This is the full walkthrough for the "pay $5 by phone, then get connected to you" system.
Three pieces: Twilio (the phone number + call logic), Stripe (charges the card),
Railway (hosts this code so Twilio can reach it).

Rough time: 45–75 minutes the first time.

---

## Part 1 — Deploy the code (do this first, you'll need the URL for Twilio)

1. Create a free account at https://railway.app (sign in with GitHub is easiest).
2. Push this folder to a new GitHub repo (or use Railway's "Deploy from local folder" via their CLI — see their docs if you'd rather skip GitHub).
3. In Railway: **New Project → Deploy from GitHub repo** → select this repo.
4. Once deployed, go to the service's **Settings → Networking** and click **Generate Domain**.
   You'll get a URL like `https://clearapy-callgate-production.up.railway.app` — copy it, you need it below.
5. Go to **Variables** and add each value from `.env.example`:
   - `REAL_PHONE_NUMBER` — your real cell number, in the format `+1XXXXXXXXXX`
   - `PAY_CONNECTOR_NAME` — leave as `Default` for now (you'll confirm this in Part 3)
   - `CHARGE_AMOUNT` — `5.00`
   - `RING_TIMEOUT_SECONDS` — `25`
6. Redeploy if prompted. Visit your Railway URL in a browser — you should see
   "Clearapy call gate is running." If you see that, the server is live.

---

## Part 2 — Buy a Twilio number

1. Create a Twilio account at https://twilio.com (there's a small free trial credit).
2. In the Twilio Console, go to **Phone Numbers → Buy a number**. Pick a local (706/770/404, etc.) or toll-free number — either works.
3. Once purchased, click into the number's configuration page.

---

## Part 3 — Turn on PCI Mode and connect Stripe

Twilio requires "PCI Mode" before you can take payments over a call — this is what keeps you out of PCI compliance scope (Twilio handles the sensitive card data, never your server).

1. In Twilio Console, search for **PCI Mode** (under Voice settings) and enable it.
   ⚠️ This cannot be undone on that account — that's fine for a fresh account, just know it redacts card data from all logs on this account going forward (which is the point).
2. Go to **Payments → Pay Connectors** in the Twilio Console.
3. Create a new connector, choose **Stripe**, and follow the prompt to connect your existing Stripe account (you'll log into Stripe directly — Twilio never sees your Stripe password).
4. Name the connector — if you name it anything other than "Default," update the `PAY_CONNECTOR_NAME` variable in Railway to match.

---

## Part 4 — Point the phone number at your code

1. Back on your Twilio number's configuration page, scroll to **Voice Configuration**.
2. Under "A call comes in," set it to **Webhook**, and paste:
   `https://YOUR-RAILWAY-URL/voice`
   (HTTP method: POST)
3. Save.

That's it — the number is now live end-to-end.

---

## Part 5 — Test it before it goes on an ad

Use Stripe's test mode first so you don't charge a real card:
1. In Stripe Dashboard, make sure you're in **test mode** (toggle top-right) while connecting the Pay Connector for this first test.
2. Call your Twilio number from your own phone.
3. When prompted, enter Stripe's test card: `4242 4242 4242 4242`, any future expiry, any 3-digit CVC, any 5-digit zip.
4. You should hear "Payment received. Connecting you now." and your real phone should ring.
5. Try a decline test too — Stripe's test card `4000 0000 0000 0002` always declines, so you can hear the failure message.
6. Once both work, switch the Pay Connector back to your **live** Stripe keys before advertising the number.

---

## Known limitations / things to watch

- **No-answer isn't auto-refunded.** If you don't pick up, the caller hears their payment will be refunded — but Twilio's Stripe connector doesn't refund automatically. You'll need to manually refund in Stripe when you see a missed call, or build a small script later that watches for `dial-status != completed` and calls Stripe's refund API. Ask me when you're ready for that — it's a quick add.
- **This charges the full $5 even for a 30-second call.** There's no per-minute billing here — it's a flat gate. If you want per-minute pricing later, that's a bigger rework (would need to track call duration and charge after the fact).
- **One phone number = one person answering.** This routes every paid call to your one real number. If you ever want multiple people picking up (e.g., hiring help later), this needs a queue/round-robin layer — not something to build yet.

---

## What to change once you have this working

For the 6-demographic landing page + ad rollout, this same number and backend can stay one system — you don't need 6 separate phone numbers unless you want to track which demographic is calling. If you *do* want that data, the cheap option is 6 different Twilio numbers all pointed at the same `/voice` webhook, with the number itself telling you which ad it came from in your call logs. Happy to wire that up once you're ready to build the landing pages.
