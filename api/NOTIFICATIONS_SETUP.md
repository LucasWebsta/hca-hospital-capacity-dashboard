# SMS & Email Notifications Setup

Alert notifications (SMS and/or email) are sent when there are active alerts and the user has them enabled in Profile → Notification Preferences.

## SMS (Twilio)

To send real SMS messages:

1. **Sign up for Twilio**  
   - Go to [twilio.com](https://www.twilio.com) and create an account.  
   - You get a trial account with a small balance; you can upgrade for production.

2. **Get credentials**  
   - **Account SID** and **Auth Token**: [Console → Account Info](https://console.twilio.com).  
   - **Phone number**: [Phone Numbers → Manage → Buy a number](https://console.twilio.com/us1/develop/phone-numbers/manage/search) (or use a trial number).  
   - The number must be able to send SMS (check the product when buying).

3. **Configure the API**  
   In `api/local.settings.json`, add under `Values`:

   ```json
   "TWILIO_ACCOUNT_SID": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
   "TWILIO_AUTH_TOKEN": "your_auth_token",
   "TWILIO_PHONE_NUMBER": "+15551234567"
   ```

   - `TWILIO_PHONE_NUMBER` must be in E.164 (e.g. `+15551234567`).  
   - User phone numbers in the app are normalized to E.164 (US: 10 digits → +1XXXXXXXXXX).

4. **Restart the API**  
   Restart the dev server (e.g. `npm run local` from the api folder or your usual command) so it picks up the new env vars.

5. **Verify**  
   - Ensure the user has **SMS alerts** on in Profile and a valid **phone number** saved.  
   - Trigger or wait for active alerts; when the app fetches alerts, the server will send SMS (subject to the 15‑minute cooldown per user).  
   - Check the API console for any `[alerts/notify] Twilio error:` logs if SMS doesn’t arrive.

**Trial accounts:** Twilio trial numbers can only send to verified phone numbers. In the Twilio console, add and verify the recipient number under Phone Numbers → Manage → Verified Caller IDs.

### US SMS registration (required — ~24+ hours)

Sending SMS to US numbers requires one of these, and both involve a **review period** (often 24–48 hours or more):

- **Toll-free number (e.g. 800, 888):** [Toll-Free Verification](https://console.twilio.com/us1/develop/sms/settings/toll-free-verification) — submit use case and sample messages; wait for approval.
- **Regular 10-digit number (10DLC):** **A2P 10DLC registration** — register your Brand and Campaign under [Messaging → Regulatory Compliance → A2P 10DLC](https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc). Carriers review; approval can take 1–2+ business days.

There is no way to skip this for production US SMS; it’s a carrier/Twilio requirement. After your registration is approved, SMS from the app will work with your configured `TWILIO_PHONE_NUMBER`. Until then, the notify endpoint will log or return errors when Twilio rejects the send.

---

## Email (Resend)

Real email is sent via [Resend](https://resend.com). Without `RESEND_API_KEY`, the server skips sending and logs that email was skipped.

1. **Get an API key**  
   - Sign up at [resend.com](https://resend.com).  
   - In the dashboard, create an API key (e.g. for “HCA Alerts”).

2. **Configure the API**  
   In `api/local.settings.json`, add under `Values`:

   ```json
   "RESEND_API_KEY": "re_xxxxxxxxxxxxxxxxxxxxxxxx",
   "RESEND_FROM": "HCA Alerts <alerts@yourdomain.com>"
   ```

   - **RESEND_API_KEY** (required for sending): your Resend API key.  
   - **RESEND_FROM** (optional): sender address. If omitted, the code uses `HCA Alerts <onboarding@resend.dev>` (Resend’s test sender; you can only send to the account’s verified email until you add and verify your own domain).

3. **Verify**  
   - Ensure the user has **Email alerts** on in Profile and a valid **email** saved.  
   - When there are active alerts and the app fetches them, the server will send email (subject to the 15‑minute cooldown).  
   - Check the API console for `[alerts/notify] Resend error:` if mail doesn’t arrive.

---

## When notifications are sent

- **New alerts only:** Email/SMS is sent only when there is at least one **new** active alert (one that wasn’t in the last batch we notified for). If the same alerts are still active and the app fetches again, no second email is sent.
- **Cooldown:** Each user is limited to one notification batch per **15 minutes**. So even if new alerts appear, you won’t get more than one email/SMS per 15 minutes.
