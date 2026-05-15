# Handovers Page - Test Cases & Mock Data Guide

## 📊 Mock Data Summary

### Handovers Created (10 total)
| # | From | To | Amount | Status | Purpose |
|---|------|-----|---------|--------|---------|
| 1 | Agent | Manager | ₹8,000 | Pending | Daily collection |
| 2 | Agent | Manager | ₹20,000 | Confirmed | Yesterday collection |
| 3 | Marketer | Manager | ₹5,000 | Rejected | Incorrect amount |
| 4 | POS | Manager | ₹2,000 | Cancelled | Customer returned |
| 5 | Agent | Agent | ₹4,000 | Pending | Peer handover |
| 6 | Agent | Manager | ₹20,000 | Confirmed | Wednesday collection |
| 7 | Marketer | Manager | ₹10,000 | Confirmed | Weekend sales |
| 8 | Manager | Super Admin | ₹125,000 | Pending | Weekly consolidation |
| 9 | Agent | Manager | ₹60,000 | Pending | Large collection |
| 10 | Agent | Manager | ₹1,000 | Confirmed | Quick morning |

### Expense Claims Created (7 total)
| # | User | Category | Amount | Status | Notes |
|---|------|----------|--------|--------|-------|
| 1 | Agent | Fuel | ₹850 | Pending | Route coverage |
| 2 | Marketer | Travel | ₹1,250 | Pending | Train ticket |
| 3 | POS | Supplies | ₹450 | Approved | Printer paper |
| 4 | Agent | Food | ₹2,500 | Rejected | Personal expense |
| 5 | Agent | Phone | ₹1,200 | Approved | Modified to ₹800 |
| 6 | Marketer | Hotel | ₹3,500 | Pending | 2 nights stay |
| 7 | POS | Misc | ₹150 | Pending | Small expense |

---

## 🔐 Test Cases by Role

### 1️⃣ SUPER ADMIN Tests

#### TC-ADMIN-001: View All Handovers
**Steps:**
1. Login as Super Admin
2. Navigate to Handovers page
3. Click "All" tab

**Expected:**
- ✅ See ALL 10 handovers (not just own)
- ✅ See handovers between any staff members
- ✅ "Admin View" badge visible on cards
- ✅ Can filter by any user

#### TC-ADMIN-002: Admin Transfer Between Staff
**Steps:**
1. Click "Admin Transfer" button
2. Select "From Staff" (e.g., Agent with high balance)
3. Select "To Staff" (e.g., Manager)
4. Enter amount: ₹10,000
5. Enter reason: "Rebalancing"
6. Submit

**Expected:**
- ✅ Transfer created immediately (no confirmation needed)
- ✅ Both parties notified
- ✅ Balance updated instantly
- ✅ Transaction logged

#### TC-ADMIN-003: Edit Any Handover
**Steps:**
1. Find a pending handover (e.g., #1 Agent→Manager ₹8,000)
2. Click "Edit" button
3. Change amount to ₹10,000
4. Save

**Expected:**
- ✅ Handover amount updated
- ✅ Recipient notified of change
- ✅ Balance recalculated
- ✅ Audit trail shows modification

#### TC-ADMIN-004: Cancel Any Handover
**Steps:**
1. Find any pending handover
2. Click "Cancel" button
3. Confirm cancellation

**Expected:**
- ✅ Handover status changed to "cancelled"
- ✅ Sender balance restored
- ✅ Recipient notified
- ✅ Cancel reason logged

#### TC-ADMIN-005: Modify Handover Status
**Steps:**
1. Find a pending handover
2. Edit and change status to "confirmed"
3. Save

**Expected:**
- ✅ Status forcibly changed
- ✅ Balances updated
- ✅ Both parties notified
- ⚠️ Use with caution (bypasses normal flow)

#### TC-ADMIN-006: View All Balances
**Steps:**
1. Click "Balances" tab

**Expected:**
- ✅ See ALL staff with balances
- ✅ Sales, Received, Sent breakdown
- ✅ Pending amounts visible
- ✅ Cards are clickable to staff profiles

#### TC-ADMIN-007: Approve Any Expense
**Steps:**
1. Go to "Expenses" tab
2. Find any pending claim
3. Click "Review"
4. Can modify amount/category
5. Approve with notes

**Expected:**
- ✅ Can approve any staff expense
- ✅ Can adjust amount down (policy limit)
- ✅ Can change category
- ✅ Claimant notified

#### TC-ADMIN-008: Access Control Verification
**Steps:**
1. Check all tabs visible: Mine, Expenses, All, Balances
2. Check "Admin Transfer" button visible
3. Check "Export" buttons visible
4. Check all filters available

**Expected:**
- ✅ All 4 tabs visible
- ✅ Admin Transfer button present
- ✅ User filter shows all staff
- ✅ Can export all data

---

### 2️⃣ MANAGER Tests

#### TC-MANAGER-001: View All Handovers
**Steps:**
1. Login as Manager
2. Navigate to Handovers
3. Click "All" tab

**Expected:**
- ✅ See ALL staff handovers
- ✅ Can filter by user
- ✅ Can see full history

#### TC-MANAGER-002: Confirm/Reject Incoming
**Steps:**
1. Check "Incoming" section
2. Should see handovers sent TO manager
3. Click "Accept" on a pending handover
4. Verify balance updated

**Expected:**
- ✅ Incoming handovers visible
- ✅ Can accept/reject
- ✅ Balance increases on accept
- ✅ Notification sent to sender

#### TC-MANAGER-003: Create Handover
**Steps:**
1. Click "Create Handover"
2. Select recipient (e.g., Super Admin)
3. Enter amount (within available balance)
4. Submit

**Expected:**
- ✅ Can create handover if not finalizer
- ✅ Must stay within balance limit
- ✅ Goes to awaiting confirmation

#### TC-MANAGER-004: Cannot Admin Transfer
**Steps:**
1. Look for "Admin Transfer" button

**Expected:**
- ❌ Button NOT visible
- ✅ Regular "Create Handover" only

#### TC-MANAGER-005: Approve Expenses
**Steps:**
1. Go to Expenses tab
2. Review pending claims
3. Approve/reject with notes

**Expected:**
- ✅ Can approve team expenses
- ✅ Can modify amounts
- ✅ Cannot approve own (conflict of interest)

#### TC-MANAGER-006: View All Balances
**Steps:**
1. Click "Balances" tab

**Expected:**
- ✅ See all staff balances
- ✅ Can monitor team holdings

---

### 3️⃣ AGENT Tests

#### TC-AGENT-001: View Own Handovers Only
**Steps:**
1. Login as Agent
2. Navigate to Handovers

**Expected:**
- ✅ See ONLY own handovers (sent/received)
- ✅ Cannot see other agents' handovers
- ✅ "All" tab NOT visible

#### TC-AGENT-002: Create Handover
**Steps:**
1. Check available balance
2. Click "Create Handover"
3. Select recipient (Manager or Agent)
4. Enter amount ≤ available balance
5. Submit

**Expected:**
- ✅ Can create if balance > 0
- ✅ Partial collections setting respected
- ✅ Amount locked until confirmed/rejected

#### TC-AGENT-003: Cannot Exceed Balance
**Steps:**
1. Try to create handover > available balance
2. Enter amount: ₹999,999

**Expected:**
- ❌ Error: "Amount exceeds available balance"
- ✅ Submit blocked

#### TC-AGENT-004: Confirm Incoming from Peer
**Steps:**
1. Wait for another agent to send handover
2. See in "Incoming" section
3. Click "Accept"

**Expected:**
- ✅ Can accept from other agents
- ✅ Balance increases
- ✅ Cannot confirm own (error shown)

#### TC-AGENT-005: Cancel Own Pending
**Steps:**
1. Create a handover
2. Before recipient confirms, click "Cancel"
3. Confirm cancellation

**Expected:**
- ✅ Only if status is "awaiting_confirmation"
- ✅ Balance restored immediately
- ✅ Recipient notified

#### TC-AGENT-006: Submit Expense Claim
**Steps:**
1. Click "Submit Expense Claim"
2. Select category
3. Enter amount, date, description
4. Upload receipt (optional)
5. Submit

**Expected:**
- ✅ Claim created with status "pending"
- ✅ Manager notified
- ✅ Shows in "My Expenses"

#### TC-AGENT-007: Cannot See Others' Data
**Steps:**
1. Check all tabs
2. Try to access other agents' data

**Expected:**
- ✅ Only "Mine" and "Expenses" tabs visible
- ✅ Balances tab NOT visible
- ✅ No access to All tab

---

### 4️⃣ FILTER & SEARCH Tests

#### TC-FILTER-001: Date Range Filter
**Steps:**
1. Set "From" date to yesterday
2. Set "To" date to today
3. Check results

**Expected:**
- ✅ Only handovers in date range shown
- ✅ Count updates

#### TC-FILTER-002: Status Filter
**Steps:**
1. Select "Pending" from status dropdown
2. Check results
3. Try "Confirmed", "Rejected", "Cancelled"

**Expected:**
- ✅ Only handovers with selected status shown
- ✅ Clear button resets filter

#### TC-FILTER-003: User Filter (Admin/Manager)
**Steps:**
1. Select specific user from dropdown
2. Check results

**Expected:**
- ✅ Only handovers involving that user shown
- ✅ Works for both sender and recipient

#### TC-FILTER-004: Search Functionality
**Steps:**
1. Enter "5000" in search box
2. Check results
3. Clear search
4. Enter user name

**Expected:**
- ✅ Searches across amounts, names, IDs, notes
- ✅ Results update in real-time

#### TC-FILTER-005: Combined Filters
**Steps:**
1. Set date range: Last 7 days
2. Set status: Pending
3. Set user: Specific agent
4. Search: "collection"

**Expected:**
- ✅ All filters applied together
- ✅ Active filter count shows correct number
- ✅ Clear button clears all

---

### 5️⃣ EDGE CASE Tests

#### TC-EDGE-001: Zero Balance Handover
**Steps:**
1. Try to handover when balance is ₹0

**Expected:**
- ❌ "Insufficient balance" error
- ✅ Create button disabled or warning shown

#### TC-EDGE-002: Duplicate Handover Same Day
**Steps:**
1. Create handover to Manager
2. Try to create another to same Manager same day

**Expected:**
- ❌ Error: "Duplicate handover exists"
- ✅ Must wait for confirmation/cancellation

#### TC-EDGE-003: Handover to Self
**Steps:**
1. Try to select self as recipient

**Expected:**
- ❌ Self not in recipient list
- ✅ Cannot handover to self

#### TC-EDGE-004: Offline Mode
**Steps:**
1. Disconnect network
2. Create handover
3. Reconnect

**Expected:**
- ✅ Handover queued
- ✅ Syncs when online
- ✅ Offline indicator shown

#### TC-EDGE-005: Large Amount Split
**Steps:**
1. Create handover with large amount (₹100,000+)
2. Check Cash/UPI split

**Expected:**
- ✅ Server calculates optimal split
- ✅ Cash + UPI = Total

#### TC-EDGE-006: Rapid Actions
**Steps:**
1. Click "Accept" multiple times rapidly
2. Click "Cancel" multiple times

**Expected:**
- ✅ Loading state prevents double-submit
- ✅ Only first action processed

---

### 6️⃣ EXPORT Tests

#### TC-EXPORT-001: Export Handovers CSV
**Steps:**
1. Apply some filters
2. Click "Export" button
3. Check downloaded file

**Expected:**
- ✅ CSV downloaded with correct filename
- ✅ All filtered data included
- ✅ Headers: Handover ID, From, To, Cash, UPI, Total, Status, Notes, Date

#### TC-EXPORT-002: Export Expenses CSV
**Steps:**
1. Go to Expenses tab
2. Apply filters
3. Click "Export"

**Expected:**
- ✅ CSV with expense data
- ✅ Headers: Claim ID, Submitted By, Category, Amount, Approved Amount, Status, Description, Dates

---

### 7️⃣ UI/UX Tests

#### TC-UI-001: Responsive Design
**Steps:**
1. Test on mobile (320px width)
2. Test on tablet (768px)
3. Test on desktop (1920px)

**Expected:**
- ✅ Mobile: Cards stack vertically, filters wrap
- ✅ Tablet: 2-column layout
- ✅ Desktop: Full table view available

#### TC-UI-002: Hover Cards
**Steps:**
1. Hover over user avatar in handover card
2. Hover over user name

**Expected:**
- ✅ Popup shows user details
- ✅ Photo, name, role visible
- ✅ "View Profile" button clickable

#### TC-UI-003: Loading States
**Steps:**
1. Navigate to page
2. Watch loading indicators
3. Submit a handover

**Expected:**
- ✅ Skeleton shown while loading
- ✅ Spinner on action buttons
- ✅ Disabled state during processing

#### TC-UI-004: Empty States
**Steps:**
1. Apply filters that return no results
2. Check empty message

**Expected:**
- ✅ "No handovers match your filters" shown
- ✅ Clear filters button prominent

---

## 🚀 How to Run Tests

### Prerequisites
1. Run the SQL migration to create mock data:
   ```bash
   cd supabase/migrations
   psql -f 20260420000001_mock_handover_test_data.sql
   ```

2. Ensure you have test users with these roles:
   - `super_admin`
   - `manager`
   - `agent` (at least 2)
   - `marketer`
   - `pos`

3. Ensure expense categories exist:
   - Fuel
   - Travel
   - Supplies
   - Food
   - Phone
   - Hotel

### Test Execution Order
1. Start with **Super Admin** tests (TC-ADMIN-*)
2. Then **Manager** tests (TC-MANAGER-*)
3. Then **Agent** tests (TC-AGENT-*)
4. Finally **Filter**, **Edge**, **Export**, **UI** tests

### Success Criteria
- All critical paths (create, confirm, cancel) work
- Role-based restrictions enforced
- Data integrity maintained
- Audit trail complete
- Notifications sent correctly

---

## 🔧 Troubleshooting

### Issue: Mock data not appearing
**Solution:**
- Check that users exist with specified roles
- Check that expense_categories table has data
- Run migration in correct order

### Issue: Permission denied errors
**Solution:**
- Verify user has correct role in user_roles table
- Check RLS policies are up to date
- Ensure JWT token is fresh (re-login)

### Issue: Balance calculations wrong
**Solution:**
- Check sales data exists for agent
- Verify handover_snapshots table is populated
- Run daily-handover-snapshot edge function

---

## 📝 Notes

- Mock data uses random IDs and amounts
- Test with real amounts to verify split calculation
- Always test on a development/staging environment first
- Keep audit trail clean by noting test transactions
