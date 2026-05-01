#!/bin/bash
#
# Test OTP Flow Script
#
# Usage:
#   ./scripts/test-otp.sh <phone_number>
#
# Example:
#   ./scripts/test-otp.sh +919999999999
#

SUPABASE_URL="${VITE_SUPABASE_URL:-https://vrhptrtgrpftycvojaqo.supabase.co}"
SUPABASE_ANON_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyaHB0cnRncnBmdHljdm9qYXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTg5ODMsImV4cCI6MjA4ODY5NDk4M30.ek7gNnoghGYYNrdZr-BttzRn6xY0aVqGU31pVcQ67mU}"
PHONE="${1:-+919999999999}"
TEST_OTP="000000"

echo "🚀 OTP Flow Test"
echo "================"
echo "🔗 Supabase URL: $SUPABASE_URL"
echo "📱 Testing Phone: $PHONE"
echo "🔑 Universal Test OTP: $TEST_OTP"
echo ""

# Step 1: Send OTP
echo "🧪 Step 1: Sending OTP..."
echo "------------------------"

SEND_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/send-otp-opensms" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d "{\"phone\": \"${PHONE}\"}")

echo "📤 Response: $SEND_RESPONSE"
echo ""

# Extract session token
SESSION_TOKEN=$(echo "$SEND_RESPONSE" | grep -o '"session_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_TOKEN" ]; then
    echo "❌ Failed to get session token"
    echo "💥 Check if the function is deployed: supabase functions deploy send-otp-opensms"
    exit 1
fi

echo "✅ Session Token: $SESSION_TOKEN"
echo ""

# Step 2: Verify OTP with 000000
echo "🧪 Step 2: Verifying OTP with: $TEST_OTP"
echo "----------------------------------------"

VERIFY_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/verify-otp-opensms" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d "{\"session_token\": \"${SESSION_TOKEN}\", \"otp_code\": \"${TEST_OTP}\"}")

echo "📤 Response: $VERIFY_RESPONSE"
echo ""

if echo "$VERIFY_RESPONSE" | grep -q '"success":true'; then
    echo "✅ OTP Verification Successful!"
    USER_ID=$(echo "$VERIFY_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    ROLE=$(echo "$VERIFY_RESPONSE" | grep -o '"type":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "👤 User ID: $USER_ID"
    echo "🔐 Role: $ROLE"
else
    echo "❌ OTP Verification Failed"
    echo "💥 Error: $(echo "$VERIFY_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)"
    exit 1
fi

echo ""
echo "✅ Test Complete!"
echo ""
echo "📝 Notes:"
echo "   - The universal test OTP '000000' works for ANY phone number"
echo "   - Set USE_REAL_OTP=true env variable in production"
echo "   - To deploy updated functions: supabase functions deploy"
