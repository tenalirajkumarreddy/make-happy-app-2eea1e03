# OpenSMS Android

Zero-infrastructure SMS gateway that runs entirely on your Android phone.

Install the APK → get a URL → call it from any backend → SMS sent.

## Quick Start

### Build with Android Studio
1. Open this folder in Android Studio
2. Download fonts (see below)
3. Build → Run on your Android device

### Auto-build via GitHub Actions
1. Push this folder to a GitHub repository
2. The CI workflow auto-builds a debug APK on every push
3. For signed release APKs, add these secrets:
   - `KEYSTORE_BASE64` — base64-encoded `.jks` keystore
   - `KEYSTORE_PASSWORD` — keystore password
   - `KEY_ALIAS` — key alias
   - `KEY_PASSWORD` — key password
4. Tag a release: `git tag v1.0.0 && git push --tags`
5. Download the APK from the GitHub Release

## Fonts Required

Download and place in `app/src/main/res/font/`:

- `syne_bold.ttf` — [Syne Bold from Google Fonts](https://fonts.google.com/specimen/Syne)
- `syne_extrabold.ttf` — Syne ExtraBold
- `jetbrainsmono_regular.ttf` — [JetBrains Mono Regular](https://www.jetbrains.com/lp/mono/)
- `jetbrainsmono_medium.ttf` — JetBrains Mono Medium

The GitHub Actions workflow downloads them automatically.

## API Usage

Once the APK is running on your phone:

```bash
# Health check (no auth needed)
curl http://192.168.1.42:8080/health

# Send SMS with template
curl -X POST http://192.168.1.42:8080/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"+919876543210","template":"otp","vars":{"otp":"482910","minutes":"10"}}'

# Send raw SMS
curl -X POST http://192.168.1.42:8080/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"+919876543210","body":"Server is down!"}'
```

## Internet Access

The phone has no public IP (carrier NAT). Use one of these to expose port 8080:

### Cloudflare Tunnel (Free, permanent URL)
```bash
# Install Termux on the phone, then:
pkg install cloudflared
cloudflared tunnel --url http://localhost:8080
```

### Tailscale (Private mesh VPN)
Install the Tailscale app → sign in → your phone gets a stable IP like `100.x.x.x`

### Ngrok
```bash
pkg install ngrok  # via Termux
ngrok http 8080
```

## Architecture

```
Android Phone
├── NanoHTTPD HTTP server (port 8080)
├── Kotlin Channel (in-memory queue, 1000 capacity)
├── ForegroundService (survives screen-off)
├── SmsManager (native SMS sending)
└── Token bucket rate limiter
```

## Requirements
- Android 8.0+ (API 26+)
- SIM card with SMS capability
- SEND_SMS permission (granted at first launch)
