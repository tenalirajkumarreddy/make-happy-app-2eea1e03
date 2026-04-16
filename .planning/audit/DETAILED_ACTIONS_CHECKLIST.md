# Detailed Actions Checklist
## Page-by-Page Element Audit with Test Cases

**Purpose:** Verify every button, link, form, and action works as expected
**Format:** Page → Section → Element → Expected Behavior → Test Steps

---

## 🔐 Auth Pages

### `/auth` - Authentication Page

#### Section: Login Form
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Phone Input | Text | Accepts 10-digit numbers | 1. Enter valid phone 2. Submit | ☐ |
| Phone Input | Text | Rejects invalid format | 1. Enter "123" 2. Submit | ☐ |
| Send OTP Button | Button | Enabled only for valid phone | Check disabled state | ☐ |
| Send OTP Button | Button | Triggers SMS | Click, check network tab | ☐ |
| Send OTP Button | Button | Rate limited (60s) | Click twice rapidly | ☐ |
| OTP Input | Text | Accepts 6 digits | Enter "123456" | ☐ |
| OTP Input | Text | Auto-advances fields | Type 6 digits | ☐ |
| Verify Button | Button | Validates OTP | Enter wrong OTP | ☐ |
| Verify Button | Button | Redirects on success | Enter correct OTP | ☐ |
| Resend Timer | Text | Counts down from 60s | Wait 60 seconds | ☐ |
| Resend Timer | Text | Button enabled at 0s | Wait for timeout | ☐ |
| Role Selector | Dropdown | Shows for new user | Login with new account | ☐ |
| Role Selector | Dropdown | Required before proceed | Try to skip | ☐ |

#### Section: Password Reset (Tab)
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Email Input | Text | Accepts valid email | Enter email | ☐ |
| Reset Button | Button | Sends reset email | Click, check inbox | ☐ |
| Success Message | Alert | Shows after send | Verify message | ☐ |

---

## 👤 Super Admin Pages

### `/access-control` - Access Control Management

#### Section: Permission Matrix
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Role Tabs | Tabs | Switches role view | Click each tab | ☐ |
| Permission Grid | Table | Shows all permissions | Verify grid loads | ☐ |
| Toggle Switch | Switch | Toggles permission | Click, verify API call | ☐ |
| Toggle Switch | Switch | Saves on change | Toggle, refresh, verify | ☐ |
| Save Button | Button | Saves all changes | Make changes, click save | ☐ |
| Reset Button | Button | Reverts to defaults | Make changes, click reset | ☐ |
| Permission Count | Badge | Shows active count | Verify count accuracy | ☐ |

#### Data Flow Verification
- [ ] Permission change triggers `role_permissions` update
- [ ] Real-time sync updates other admins' views
- [ ] Audit log records who changed what
- [ ] Cache invalidation refreshes permissions on next auth

---

### `/admin/staff` - Staff Directory

#### Section: Staff Table
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Table Header | Sort | Sorts by column | Click each header | ☐ |
| Search Input | Text | Filters by name | Type "John" | ☐ |
| Role Filter | Dropdown | Filters by role | Select "Manager" | ☐ |
| Status Filter | Dropdown | Filters by active | Select "Inactive" | ☐ |
| Pagination | Control | Shows 10 per page | Navigate pages | ☐ |
| Row Checkbox | Checkbox | Enables bulk actions | Select multiple rows | ☐ |

#### Section: Invite Staff
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Invite Button | Button | Opens modal | Click invite | ☐ |
| Email Input | Text | Validates email | Enter invalid email | ☐ |
| Phone Input | Text | Validates phone | Enter invalid phone | ☐ |
| Role Dropdown | Select | Lists all roles | Open dropdown | ☐ |
| Warehouse Dropdown | Select | Lists warehouses | Open dropdown | ☐ |
| Submit Button | Button | Sends invitation | Fill form, submit | ☐ |
| Success Toast | Alert | Shows on success | Verify notification | ☐ |
| Error Message | Alert | Shows validation errors | Submit empty form | ☐ |

#### Section: Staff Actions (Per Row)
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Edit Button | Icon | Opens edit modal | Click edit | ☐ |
| Deactivate Button | Icon | Shows confirmation | Click deactivate | ☐ |
| Deactivate Button | Icon | Disables account | Confirm, verify status | ☐ |
| View Profile | Link | Navigates to profile | Click profile | ☐ |
| Resend Invite | Button | Resends invitation | Click for pending staff | ☐ |

#### Data Flow Verification
- [ ] Invitation creates `staff_invitations` record
- [ ] Email/SMS sent via edge function
- [ ] New user auto-assigned to warehouse
- [ ] Deactivation revokes active sessions
- [ ] Changes logged to audit_log

---

### `/analytics` - Analytics Dashboard

#### Section: Date Range
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Preset Buttons | Button | Quick select (7d, 30d, etc) | Click "Last 30 Days" | ☐ |
| Custom Range | DatePicker | Opens calendar | Click custom | ☐ |
| Apply Button | Button | Updates all charts | Select range, apply | ☐ |
| Reset Button | Button | Clears to default | Click reset | ☐ |

#### Section: KPI Cards
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Sales Card | Card | Shows total sales | Verify number | ☐ |
| Revenue Card | Card | Shows revenue | Verify number | ☐ |
| Customers Card | Card | Shows new customers | Verify number | ☐ |
| Card Click | Action | Opens detail view | Click card | ☐ |
| Trend Indicator | Badge | Shows % change | Verify up/down arrow | ☐ |

#### Section: Charts
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Sales Chart | LineChart | Renders data points | Hover over points | ☐ |
| Revenue Chart | BarChart | Shows category breakdown | Hover bars | ☐ |
| Map Chart | Map | Shows store markers | Pan/zoom map | ☐ |
| Chart Legend | Legend | Toggles series | Click legend item | ☐ |
| Download Button | Icon | Downloads chart image | Click download | ☐ |
| Refresh Button | Icon | Refreshes data | Click refresh | ☐ |

#### Section: Data Table
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Export Button | Button | Downloads CSV | Click export | ☐ |
| Filter Input | Text | Filters rows | Type filter | ☐ |
| Sort Headers | Header | Sorts data | Click headers | ☐ |

#### Data Flow Verification
- [ ] Date change triggers new API calls
- [ ] Charts use cached data for same date range
- [ ] KPIs calculate from aggregated data
- [ ] Map markers cluster at zoom out
- [ ] Export generates valid CSV

---

## 📦 Manager Pages

### `/products` - Product Management

#### Section: Product Grid
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Product Card | Card | Shows product info | Verify display | ☐ |
| Image | Image | Lazy loads | Scroll down | ☐ |
| Price | Text | Formatted currency | Check format | ☐ |
| Stock Badge | Badge | Shows quantity | Verify accurate | ☐ |
| Category Tag | Tag | Shows category | Verify display | ☐ |

#### Section: Filters
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Category Chips | Chip | Toggles filter | Click category | ☐ |
| Search Input | Text | Searches name/SKU | Type "PROD001" | ☐ |
| Sort Dropdown | Select | Changes sort order | Select "Price: High" | ☐ |
| Low Stock Toggle | Switch | Shows only low stock | Toggle on | ☐ |
| Clear Filters | Button | Resets all | Click clear | ☐ |

#### Section: Add Product Modal
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Name Input | Text | Required field | Submit empty | ☐ |
| SKU Input | Text | Unique validation | Enter duplicate SKU | ☐ |
| Price Input | Number | Validates positive | Enter "-10" | ☐ |
| Category Select | Dropdown | Lists categories | Open dropdown | ☐ |
| Stock Input | Number | Validates integer | Enter "10.5" | ☐ |
| Image Upload | Dropzone | Accepts images | Drop image file | ☐ |
| Image Preview | Image | Shows preview | Upload image | ☐ |
| Submit Button | Button | Creates product | Fill, submit | ☐ |
| Cancel Button | Button | Closes modal | Click cancel | ☐ |

#### Section: Bulk Actions (Phase 4)
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Select Checkbox | Checkbox | Selects product | Click checkbox | ☐ |
| Select All | Checkbox | Toggles all | Click select all | ☐ |
| Bulk Toolbar | Toolbar | Shows when selected | Select products | ☐ |
| Update Price | Button | Opens price dialog | Click update price | ☐ |
| Change Category | Button | Opens category dialog | Click change cat | ☐ |
| Delete Selected | Button | Shows confirmation | Click delete | ☐ |
| Progress Dialog | Modal | Shows batch progress | Start bulk op | ☐ |

#### Data Flow Verification
- [ ] Image upload to `product-images` bucket
- [ ] SKU uniqueness checked server-side
- [ ] Product create triggers audit log
- [ ] Bulk operations use `bulk_operations` table
- [ ] Stock changes reflect in Inventory

---

### `/inventory` - Inventory Management

#### Section: Stock Table
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Product Column | Text | Shows product name | Verify display | ☐ |
| Quantity Column | Number | Editable inline | Double-click edit | ☐ |
| Warehouse Column | Text | Shows location | Verify filter | ☐ |
| Last Updated | Date | Shows timestamp | Verify format | ☐ |
| Low Stock Badge | Badge | Highlights low items | Verify < min_stock | ☐ |
| Row Actions | Icons | Edit/Transfer/History | Click each | ☐ |

#### Section: Stock Transfer
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Transfer Button | Button | Opens transfer modal | Click transfer | ☐ |
| From Warehouse | Select | Lists warehouses | Open dropdown | ☐ |
| To Warehouse | Select | Lists warehouses | Open dropdown | ☐ |
| Product Select | Search | Finds products | Type product name | ☐ |
| Quantity Input | Number | Validates availability | Enter > available | ☐ |
| Notes Input | Text | Optional notes | Enter text | ☐ |
| Submit Button | Button | Creates transfer | Fill, submit | ☐ |
| Transfer List | Table | Shows pending transfers | View list | ☐ |

#### Section: Stock History
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| History Tab | Tab | Shows movement log | Click history | ☐ |
| Movement Type | Badge | Shows type color | Verify colors | ☐ |
| Filter by Type | Dropdown | Filters movements | Select "Sale" | ☐ |
| Date Range | Picker | Filters by date | Select range | ☐ |
| Export History | Button | Downloads CSV | Click export | ☐ |

#### Data Flow Verification
- [ ] Transfer deducts from source immediately
- [ ] Receiver confirms to add to destination
- [ ] History tracks all movements
- [ ] Real-time updates via subscriptions
- [ ] Low stock triggers notifications

---

### `/sales` - Sales Recording

#### Section: Sale Form
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Store Selector | AsyncSelect | Searches stores | Type store name | ☐ |
| Store Selector | AsyncSelect | Shows outstanding | Select store | ☐ |
| Product Search | Search | Finds products | Type "Milk" | ☐ |
| Product Search | Search | Shows stock level | View results | ☐ |
| Add Button | Button | Adds to cart | Click add | ☐ |
| Quantity Stepper | Stepper | Adjusts quantity | Click +/- | ☐ |
| Cart Items | Table | Lists items | Add items | ☐ |
| Remove Item | Icon | Removes from cart | Click remove | ☐ |
| Subtotal | Text | Calculates correctly | Verify math | ☐ |

#### Section: Payment
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Cash Input | Number | Accepts amount | Enter cash | ☐ |
| UPI Input | Number | Accepts amount | Enter UPI | ☐ |
| Payment Validation | Alert | Shows if mismatched | Enter wrong total | ☐ |
| Outstanding Preview | Text | Shows new balance | Verify calculation | ☐ |
| Credit Limit Warning | Alert | Warns if over limit | Near limit sale | ☐ |

#### Section: Actions
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Record Sale Button | Button | Validates form | Click with errors | ☐ |
| Record Sale Button | Button | Submits on valid | Fill valid, submit | ☐ |
| Save Draft | Button | Saves for later | Click save draft | ☐ |
| Clear Button | Button | Resets form | Click clear | ☐ |
| Print Receipt | Button | Opens receipt | After sale | ☐ |

#### Section: Sale Returns (Phase 2)
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Return Button | Button | Opens return dialog | Click return | ☐ |
| Sale Search | Search | Finds past sales | Enter sale ID | ☐ |
| Return Items | Checkbox | Selects items | Check items | ☐ |
| Return Quantity | Number | Max = original qty | Enter > qty | ☐ |
| Return Reason | Select | Required reason | Select reason | ☐ |
| Submit Return | Button | Processes return | Fill, submit | ☐ |

#### Data Flow Verification
- [ ] `record_sale()` RPC called atomically
- [ ] Stock deducted via trigger
- [ ] Outstanding updated in transaction
- [ ] Receipt generated automatically
- [ ] Audit log entry created
- [ ] Return updates all related tables

---

### `/customers` - Customer Management

#### Section: Customer List
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Customer Card | Card | Shows summary | Verify display | ☐ |
| Outstanding Badge | Badge | Color-coded amount | Check colors | ☐ |
| KYC Status | Badge | Shows verified/pending | Verify status | ☐ |
| Quick Actions | Buttons | Call/WhatsApp/Map | Click each | ☐ |
| Search Input | Text | Filters customers | Type name | ☐ |

#### Section: Add Customer
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Name Input | Text | Required | Submit empty | ☐ |
| Phone Input | Text | Validates unique | Enter duplicate | ☐ |
| Email Input | Text | Validates format | Enter invalid | ☐ |
| GST Input | Text | Optional validation | Enter GST | ☐ |
| Address Fields | Group | Captures address | Fill address | ☐ |
| Submit Button | Button | Creates customer | Fill, submit | ☐ |
| Success Toast | Alert | Confirms creation | Verify message | ☐ |

#### Section: Import Customers
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Import Button | Button | Opens import modal | Click import | ☐ |
| CSV Upload | Dropzone | Accepts CSV | Drop file | ☐ |
| Preview Table | Table | Shows preview | Upload file | ☐ |
| Validation Errors | Alert | Shows issues | Upload bad CSV | ☐ |
| Confirm Import | Button | Imports valid rows | Click import | ☐ |
| Results Summary | Alert | Shows stats | After import | ☐ |

#### Section: Customer Detail
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Profile Tab | Tab | Shows info | Click profile | ☐ |
| Sales Tab | Tab | Shows sales history | Click sales | ☐ |
| Ledger Tab | Tab | Shows transactions | Click ledger | ☐ |
| KYC Tab | Tab | Shows documents | Click KYC | ☐ |
| Edit Button | Button | Opens edit form | Click edit | ☐ |
| Statement Button | Button | Generates statement | Click statement | ☐ |
| Reminder Button | Button | Sends reminder | Click reminder | ☐ |

#### Data Flow Verification
- [ ] Phone uniqueness checked
- [ ] GST validated format
- [ ] Import creates `customers` records
- [ ] Duplicate handling merges or skips
- [ ] KYC docs stored in `kyc-documents` bucket
- [ ] Ledger combines sales + payments

---

### `/handovers` - Cash Handover

#### Section: Create Handover
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Today's Summary | Cards | Shows calculated amounts | Verify display | ☐ |
| Cash Amount | Text | Auto-calculated | Compare with sales | ☐ |
| UPI Amount | Text | Auto-calculated | Compare with sales | ☐ |
| Total Amount | Text | Sum of above | Verify math | ☐ |
| Recipient Select | Dropdown | Lists managers | Open dropdown | ☐ |
| Notes Input | Text | Optional notes | Enter notes | ☐ |
| Create Button | Button | Creates handover | Click create | ☐ |
| Duplicate Warning | Alert | Warns if exists | Try duplicate | ☐ |

#### Section: Handover List
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Pending Badge | Badge | Shows pending count | Verify count | ☐ |
| Handover Row | Row | Shows details | Verify display | ☐ |
| Status Badge | Badge | Color-coded status | Check colors | ☐ |
| Confirm Button | Button | For recipient | Click confirm | ☐ |
| Reject Button | Button | With reason | Click reject | ☐ |
| View Details | Link | Opens detail view | Click view | ☐ |

#### Section: Handover Detail
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Amount Breakdown | Table | Lists all sales | Verify accuracy | ☐ |
| Sales List | Table | Shows contributing sales | Check sum | ☐ |
| Received From | Card | Shows transfers in | Verify display | ☐ |
| Sent To | Card | Shows transfers out | Verify display | ☐ |
| Print Button | Button | Generates print view | Click print | ☐ |

#### Data Flow Verification
- [ ] `create_handover()` RPC calculates server-side
- [ ] Prevents duplicate handovers
- [ ] Updates on sale confirmation
- [ ] Recipient gets notification
- [ ] Confirmation updates both parties

---

## 🚚 Agent Pages

### `/routes` - Route Management

#### Section: Route List
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Route Card | Card | Shows route info | Verify display | ☐ |
| Store Count | Badge | Shows # of stores | Verify count | ☐ |
| Progress Bar | Bar | Shows completion % | Visit stores | ☐ |
| Start Button | Button | Opens route | Click start | ☐ |
| Optimize Button | Button | Reorders stops | Click optimize | ☐ |

#### Section: Route Detail
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Store List | List | Ordered stops | Verify order | ☐ |
| Distance | Text | Shows from current | Verify calculation | ☐ |
| ETA | Text | Estimated arrival | Verify time | ☐ |
| Visit Checkbox | Checkbox | Marks visited | Check box | ☐ |
| GPS Button | Button | Records location | Click record GPS | ☐ |
| Note Button | Button | Adds visit note | Click note | ☐ |
| Quick Sale | Button | Opens sale form | Click record | ☐ |

#### Section: Map View
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Map Toggle | Switch | Shows map view | Toggle on | ☐ |
| Store Markers | Marker | Shows locations | View map | ☐ |
| Current Location | Marker | Shows agent position | Verify tracking | ☐ |
| Route Line | Line | Connects stops | View path | ☐ |
| Directions | Button | Opens navigation | Click directions | ☐ |

#### Data Flow Verification
- [ ] GPS captured in `location_pings`
- [ ] Visit marks update `route_stores`
- [ ] Optimization uses distance API
- [ ] Real-time sync with server
- [ ] Offline queue if no connection

---

### `/agent/record` (Mobile) - Mobile Sale Recording

#### Section: Store Selection
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Store Dropdown | Select | Lists assigned stores | Open dropdown | ☐ |
| Quick Search | Input | Filters stores | Type name | ☐ |
| Current Store | Button | Uses GPS nearest | Click current | ☐ |

#### Section: Product Selection
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Product Grid | Grid | Shows products | Scroll grid | ☐ |
| Category Tabs | Tabs | Filters by category | Click tab | ☐ |
| Search Bar | Input | Finds products | Type search | ☐ |
| Product Tile | Button | Adds to cart | Tap product | ☐ |
| Stock Badge | Badge | Shows available qty | Verify display | ☐ |
| Camera FAB | FAB | Opens scanner | Click camera | ☐ |

#### Section: Cart
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Cart Panel | Slide | Shows selected items | Swipe up | ☐ |
| Quantity Controls | Stepper | Adjusts qty | Tap +/- | ☐ |
| Remove Item | Swipe | Swipe to remove | Swipe left | ☐ |
| Cart Total | Text | Shows total | Verify math | ☐ |

#### Section: Payment
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Cash Input | Number | Keyboard numeric | Tap input | ☐ |
| UPI Input | Number | Keyboard numeric | Tap input | ☐ |
| Quick Amounts | Chips | Preset amounts | Tap chip | ☐ |
| Record Button | Button | Submits sale | Fill, submit | ☐ |
| Offline Indicator | Badge | Shows queue status | Disconnect wifi | ☐ |

#### Data Flow Verification
- [ ] Offline sales queued in IndexedDB
- [ ] Barcode scan matches product
- [ ] GPS location captured
- [ ] Sync when back online
- [ ] Conflict resolver for data changes

---

## 📱 Customer Portal Pages

### `/portal/sales` - Customer Sales History

#### Section: Sales List
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Sale Card | Card | Shows sale summary | Verify display | ☐ |
| Date | Text | Shows sale date | Verify format | ☐ |
| Amount | Text | Shows total | Verify currency | ☐ |
| Outstanding | Text | Shows remaining | Verify calculation | ☐ |
| View Button | Button | Opens detail | Click view | ☐ |

#### Section: Sale Detail
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Items Table | Table | Lists products | Verify display | ☐ |
| Receipt Button | Button | Shows receipt | Click receipt | ☐ |
| Download PDF | Button | Downloads receipt | Click download | ☐ |
| Pay Button | Button | Opens payment | Click pay | ☐ |

#### Data Flow Verification
- [ ] Only shows customer's own sales
- [ ] Outstanding calculated correctly
- [ ] Receipt generation on demand
- [ ] Payment updates via realtime

---

## 🔧 Shared Components

### SaleReceipt Component

#### Section: Receipt Display
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Receipt Header | Image | Shows logo | Verify display | ☐ |
| Sale Details | Text | ID, date, customer | Verify accuracy | ☐ |
| Items Table | Table | Products & prices | Verify totals | ☐ |
| Payment Split | Text | Cash/UPI breakdown | Verify split | ☐ |
| QR Code | Image | Payment QR | Scan with phone | ☐ |

#### Section: Actions
| Element | Type | Expected Behavior | Test Steps | Pass/Fail |
|---------|------|-------------------|------------|-----------|
| Download PDF | Button | Generates PDF | Click download | ☐ |
| Email Button | Button | Sends email | Enter email, send | ☐ |
| Print Button | Button | Opens print dialog | Click print | ☐ |
| Share Button | Button | Native share sheet | Click share | ☐ |
| Resend Button | Button | For existing receipts | Click resend | ☐ |

#### Data Flow Verification
- [ ] PDF generated by edge function
- [ ] Receipt stored in `receipts` table
- [ ] Email sent via notification system
- [ ] Resend updates `resent_count`

---

## 📋 Testing Procedures

### Pre-Release Testing Checklist

#### Authentication Flows
- [ ] New user registration (phone OTP)
- [ ] Existing user login
- [ ] Password reset
- [ ] Role selection (first login)
- [ ] Session expiry handling

#### Sales Recording
- [ ] Basic sale (cash only)
- [ ] Split payment (cash + UPI)
- [ ] Sale with multiple items
- [ ] Sale exceeding credit limit
- [ ] Sale with insufficient stock
- [ ] Offline sale recording
- [ ] Sale return processing

#### Inventory Management
- [ ] Stock transfer between warehouses
- [ ] Stock adjustment (positive)
- [ ] Stock adjustment (negative)
- [ ] Low stock alert
- [ ] Bulk stock update

#### Customer Management
- [ ] Add new customer
- [ ] Edit customer details
- [ ] Import customers from CSV
- [ ] View customer ledger
- [ ] Send outstanding reminder

#### Route Management
- [ ] Create new route
- [ ] Assign stores to route
- [ ] Optimize route order
- [ ] Mark store visited (GPS)
- [ ] Record sale from route

#### Handover
- [ ] Create handover (server calc)
- [ ] Confirm received handover
- [ ] Reject handover with reason
- [ ] View handover history

#### Reporting
- [ ] Generate sales report
- [ ] Filter by date range
- [ ] Export to CSV
- [ ] View analytics dashboard

#### Mobile-Specific
- [ ] Barcode scanning
- [ ] Offline queue sync
- [ ] GPS location capture
- [ ] Mobile-responsive UI

---

## Bug Tracking Template

When issues are found, document using:

```markdown
### Issue: [Brief Description]
**Page:** [Route]
**Element:** [Button/Form/etc]
**Severity:** [Critical/High/Medium/Low]
**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Result:** [What should happen]
**Actual Result:** [What actually happens]
**Screenshots:** [Attach if applicable]
**Console Errors:** [Copy any errors]
**Network Requests:** [Relevant API calls]
**Assigned To:** [Developer name]
**Status:** [Open/In Progress/Fixed]
```

---

*This checklist should be reviewed and updated with each release*
*Last updated: 2026-04-12*
