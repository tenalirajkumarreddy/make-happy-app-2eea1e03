// opensms.js — copy this file into your project
// Docs: https://github.com/tenalirajkumarreddy/Open-SMS
//
// Setup:
//   npm install ws qrcode-terminal
//   OPENSMS_HOST=192.168.1.10 node server.js   ← set your LAN IP
//
// Usage:
//   const { send, isConnected } = require('./opensms')
//   await send({ to: '+919876543210', template: 'otp', vars: { otp: '4829', minutes: '10' } })
//   await send({ to: '+919876543210', body: 'Server alert!' })

'use strict'

const WebSocket = require('ws')
const qrcode    = require('qrcode-terminal')
const crypto    = require('crypto')

// ── Config ──────────────────────────────────────────────────────────────────
const PORT    = process.env.OPENSMS_PORT || 3001
const API_KEY = process.env.OPENSMS_KEY  || crypto.randomBytes(16).toString('hex')
const HOST    = process.env.OPENSMS_HOST || '<YOUR_LOCAL_IP>'

// ── State ────────────────────────────────────────────────────────────────────
let device      = null          // connected APK WebSocket
const pending   = new Map()     // messageId → { resolve, reject, timer }
const templates = new Map()     // name → { name, body, vars[] } — synced from APK

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ port: PORT })

wss.on('listening', () => {
  const qrPayload = Buffer.from(JSON.stringify({
    wsUrl:  `ws://${HOST}:${PORT}/`,
    apiKey: API_KEY,
  })).toString('base64')

  console.log(`
┌─────────────────────────────────────────────────┐
│              OpenSMS Gateway Ready              │
│                                                 │
│  WebSocket : ws://${HOST}:${PORT}
│  API Key   : ${API_KEY}
│                                                 │
│  Scan the QR below with the OpenSMS APK:        │
└─────────────────────────────────────────────────┘
`)
  qrcode.generate(qrPayload, { small: true })
  process.stdout.write('\nWaiting for device...')
})

wss.on('connection', (ws) => {
  let authed = false

  const authTimeout = setTimeout(() => {
    if (!authed) ws.terminate()
  }, 10_000)

  ws.on('message', (data) => {
    let msg
    try { msg = JSON.parse(data) } catch { return }

    if (msg.type === 'auth') {
      clearTimeout(authTimeout)
      if (msg.apiKey !== API_KEY) {
        ws.send(JSON.stringify({ type: 'auth_error', reason: 'invalid_api_key' }))
        ws.close(4001, 'bad key')
        return
      }
      authed = true
      device = ws
      ws.send(JSON.stringify({ type: 'auth_ok' }))
      process.stdout.write(`\r✓ Device connected · ${msg.deviceId}\n`)
    }

    if (msg.type === 'templates_sync')
      msg.templates.forEach(t => templates.set(t.name, t))

    if (msg.type === 'status') {
      const p = pending.get(msg.messageId)
      if (p) {
        clearTimeout(p.timer)
        pending.delete(msg.messageId)
        msg.status === 'failed'
          ? p.reject(Object.assign(new Error(msg.error ?? 'SMS failed'), msg))
          : p.resolve(msg)
      }
    }

    if (msg.type === 'ping')
      ws.send(JSON.stringify({ type: 'pong' }))
  })

  ws.on('close', () => {
    if (device === ws) {
      device = null
      process.stdout.write('Device disconnected. Waiting...')
    }
  })
})

// ── Template renderer ─────────────────────────────────────────────────────────
function render(name, vars = {}) {
  const t = templates.get(name)
  if (!t) throw new Error(`Template '${name}' not found. Available: ${[...templates.keys()].join(', ')}`)
  return t.body.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Missing template variable: {{${k}}}`)
    return vars[k]
  })
}

// ── send() — call this anywhere in your code ──────────────────────────────────
async function send({ to, template, vars, body }) {
  if (!device || device.readyState !== WebSocket.OPEN)
    throw new Error('No APK connected. Open the OpenSMS app and scan the QR code.')

  if (!to) throw new Error('`to` (phone number) is required. Use E.164 format: +919876543210')
  if (!body && !template) throw new Error('Provide either `body` or `template`.')

  const messageId = crypto.randomBytes(8).toString('hex')
  const text = body ?? render(template, vars ?? {})

  device.send(JSON.stringify({ type: 'job', messageId, to, body: text, template }))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(messageId)
      reject(new Error(`SMS timeout: no status received in 30s (messageId: ${messageId})`))
    }, 30_000)
    pending.set(messageId, { resolve, reject, timer })
  })
}

// ── isConnected() — check before calling send() ──────────────────────────────
function isConnected() {
  return device !== null && device.readyState === WebSocket.OPEN
}

module.exports = { send, isConnected }
