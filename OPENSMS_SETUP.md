# OpenSMS Phone Authentication Setup (Supabase Native)

This project uses **Open-SMS** - a zero-infrastructure SMS gateway that runs on an Android device - for free phone-based OTP authentication, now integrated directly with **Supabase Realtime**.

## How It Works

1. **User enters phone number** → App calls `send-otp-opensms` Edge Function.
2. **OTP generated & stored** → OTP session is created in the database.
3. **Internal Job Created** → Edge Function inserts a row into the `sms_jobs` table.
4. **Realtime Dispatch** → The Android device, subscribed to `sms_jobs` via Supabase Realtime, receives the job instantly.
5. **SMS Sent** → Android device sends the SMS and updates the job status to `sent`.
6. **User enters OTP** → App calls `verify-otp-opensms` Edge Function to complete login.

## Setting Up OpenSMS

### 1. Install APK on Android Device

- Build or download the OpenSMS APK from the `Open-SMS` folder.
- Install on an Android device with a SIM card that can send SMS.

### 2. Connect to Supabase

- Open the web application and log in as `super_admin`.
- Go to **Settings > SMS Gateway**.
- Open the OpenSMS app on your phone, tap **Connect**, and scan the QR code displayed in the dashboard.
- The app will automatically sync your `Supabase URL` and `Anon Key`.

### 3. Verification

- Once connected, the app status should show "Connected to Supabase".
- You can use the **"Send Test SMS"** button in the Android app to verify the carrier connection.
- New SMS jobs from the web app will now be processed automatically.

## Database Schema

### `sms_jobs` Table

Used for communication between the backend and Android gateway:

- `id`: UUID (Primary Key)
- `phone`: Text (Recipient)
- `body`: Text (Message content)
- `status`: Enum (`pending`, `sent`, `error`)
- `error_message`: Text (if status is `error`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

## Troubleshooting

### App Not Receiving Jobs
- Ensure the Android device has active internet.
- Verify that **Realtime** is enabled for the `sms_jobs` table in the Supabase Dashboard (Database > Replication).
- Check the app's battery optimization settings; ensure it can run in the background.

### "Failed to send SMS"
- Check if the SIM card has sufficient balance/quota.
- Ensure the app has the necessary `SEND_SMS` permissions.

## Architecture

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   Web/Mobile App │ ────> │  Edge Function   │ ────> │   Supabase DB    │
│   (User Login)   │       │ (send-otp-sms)   │       │   (sms_jobs)     │
└──────────────────┘       └──────────────────┘       └────────┬─────────┘
                                                               │
                                                               │ Realtime INSERT
                                                               v
                                                      ┌──────────────────┐
                                                      │   Android App    │
                                                      │  (OpenSMS Relay) │
                                                      └────────┬─────────┘
                                                               │
                                                               │ Native SMS
                                                               v
                                                      ┌──────────────────┐
                                                      │   User's Phone   │
                                                      └──────────────────┘
```
