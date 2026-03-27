# SMS Templates Guide

OpenSMS supports message templates with dynamic variables for consistent, reusable messages.

---

## How Templates Work

Instead of sending raw message text, you can use predefined templates:

```sql
-- Without template
INSERT INTO sms_jobs (to_phone, body, status)
VALUES ('+919876543210', 'Your OTP is 1234. Valid for 10 minutes.', 'pending');

-- With template (cleaner!)
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'otp', '{"otp": "1234", "minutes": "10"}', 'pending');
```

The Android app renders the template before sending.

---

## Built-in Templates

| Template Name | Variables | Output |
|--------------|-----------|--------|
| `otp` | `otp`, `minutes` | Your OTP is {{otp}}. Valid for {{minutes}} minutes. Do not share. |
| `welcome` | `app_name` | Welcome to {{app_name}}! Your account is ready. |
| `order_placed` | `order_id`, `date` | Order #{{order_id}} placed. Delivery by {{date}}. |
| `payment` | `amount`, `order_id` | Payment of ₹{{amount}} received for order #{{order_id}}. |
| `alert` | `severity`, `message`, `timestamp` | [{{severity}}] {{message}} — {{timestamp}} |

---

## Usage Examples

### OTP / Verification

```sql
-- JavaScript
await supabase.from('sms_jobs').insert({
  to_phone: '+919876543210',
  template_name: 'otp',
  template_vars: { otp: '482913', minutes: '5' },
  status: 'pending'
})

-- SQL
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'otp', '{"otp": "482913", "minutes": "5"}', 'pending');
```
**Output:** `Your OTP is 482913. Valid for 5 minutes. Do not share.`

### Welcome Message

```sql
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'welcome', '{"app_name": "MyStore"}', 'pending');
```
**Output:** `Welcome to MyStore! Your account is ready.`

### Order Confirmation

```sql
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'order_placed', '{"order_id": "ORD-2024-001", "date": "March 28"}', 'pending');
```
**Output:** `Order #ORD-2024-001 placed. Delivery by March 28.`

### Payment Receipt

```sql
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'payment', '{"amount": "1,299", "order_id": "ORD-2024-001"}', 'pending');
```
**Output:** `Payment of ₹1,299 received for order #ORD-2024-001.`

### Alert / Notification

```sql
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'alert', '{"severity": "HIGH", "message": "Server CPU at 95%", "timestamp": "14:32"}', 'pending');
```
**Output:** `[HIGH] Server CPU at 95% — 14:32`

---

## Custom Templates

You can add custom templates in the app:

1. Open OpenSMS app
2. Go to **Templates** tab
3. Tap **+ Add Template**
4. Enter name (e.g., `appointment`)
5. Enter body with `{{variables}}`
6. Save

Example custom template:
```
Name: appointment
Body: Hi {{name}}, your appointment is confirmed for {{date}} at {{time}}. Reply CANCEL to reschedule.
```

Usage:
```sql
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES (
  '+919876543210', 
  'appointment', 
  '{"name": "Raj", "date": "March 27", "time": "3:00 PM"}', 
  'pending'
);
```
**Output:** `Hi Raj, your appointment is confirmed for March 27 at 3:00 PM. Reply CANCEL to reschedule.`

---

## Batch Sending with Templates

Send to multiple recipients efficiently:

```sql
-- Bulk OTPs
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES 
  ('+919876543210', 'otp', '{"otp": "123456", "minutes": "10"}', 'pending'),
  ('+919876543211', 'otp', '{"otp": "234567", "minutes": "10"}', 'pending'),
  ('+919876543212', 'otp', '{"otp": "345678", "minutes": "10"}', 'pending');
```

```javascript
// JavaScript batch insert
const users = [
  { phone: '+919876543210', otp: '123456' },
  { phone: '+919876543211', otp: '234567' },
  { phone: '+919876543212', otp: '345678' },
]

await supabase.from('sms_jobs').insert(
  users.map(u => ({
    to_phone: u.phone,
    template_name: 'otp',
    template_vars: { otp: u.otp, minutes: '10' },
    status: 'pending'
  }))
)
```

---

## Template + Direct Body

You can mix approaches - use `body` for custom messages, `template_name` for standard ones:

```javascript
// Custom one-off message
await supabase.from('sms_jobs').insert({
  to_phone: '+919876543210',
  body: 'Your package has been delivered to the front desk.',
  status: 'pending'
})

// Standard template
await supabase.from('sms_jobs').insert({
  to_phone: '+919876543210',
  template_name: 'payment',
  template_vars: { amount: '599', order_id: 'ORD-123' },
  status: 'pending'
})
```

---

## Error Handling

If a template variable is missing, the job fails:

```sql
-- This will fail (missing 'minutes' variable)
INSERT INTO sms_jobs (to_phone, template_name, template_vars, status)
VALUES ('+919876543210', 'otp', '{"otp": "1234"}', 'pending');

-- Check the error
SELECT id, status, error FROM sms_jobs WHERE status = 'failed';
-- error: "Missing variable: minutes"
```

Always include all required variables for a template.

---

## Best Practices

1. **Use templates for repetitive messages** - OTPs, confirmations, alerts
2. **Use direct body for one-off messages** - Custom notifications
3. **Keep templates under 160 chars** - Avoids multipart SMS charges
4. **Test templates before production** - Send to your own number first
5. **Include unsubscribe option** - For marketing messages
