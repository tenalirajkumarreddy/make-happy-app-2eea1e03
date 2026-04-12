# BizManager Application Flowcharts

Visual representation of key application flows.

---

## 1. Authentication Flow

```mermaid
flowchart TD
    A[User Opens App] --> B{Is Native App?}
    B -->|Yes| C[MobileAppV2]
    B -->|No| D[Web App]
    
    C --> E{Authenticated?}
    D --> E
    
    E -->|No| F[Auth Page]
    E -->|Yes| G[Dashboard Router]
    
    F --> H{Auth Method?}
    H -->|Staff| I[Email/Password or Google]
    H -->|Customer| J[Phone OTP]
    
    I --> K[Supabase Auth]
    J --> L[send-otp-opensms]
    L --> M[User Enters OTP]
    M --> N[verify-otp-opensms]
    
    K --> O[resolve-user-identity]
    N --> O
    
    O --> P{User Type?}
    P -->|Staff| Q[Check staff_directory]
    P -->|Customer| R[Check customers table]
    
    Q --> S[Update user_roles]
    R --> T[Link to customer record]
    
    S --> U[AuthContext]
    T --> U
    
    U --> V{Role?}
    V -->|super_admin| W[Dashboard]
    V -->|manager| W
    V -->|agent| X[AgentDashboard]
    V -->|marketer| Y[MarketerDashboard]
    V -->|pos| Z[PosDashboard]
    V -->|customer| AA[CustomerPortal]
```

---

## 2. Sales Recording Flow

```mermaid
flowchart TD
    A[User Clicks Record Sale] --> B{Select Store}
    B --> C[Store Picker]
    C --> D[Fetch Store Details]
    
    D --> E[Product Selection]
    E --> F{Pricing Hierarchy}
    F -->|store_pricing| G[Custom Store Price]
    F -->|store_type_pricing| H[Store Type Default]
    F -->|fallback| I[Base Price]
    
    G --> J[Calculate Total]
    H --> J
    I --> J
    
    J --> K[Enter Payment]
    K --> L[Cash Amount]
    K --> M[UPI Amount]
    
    L --> N{Check Credit Limit}
    M --> N
    
    N -->|Exceeds| O[Block Sale]
    N -->|OK| P{Agent Role?}
    
    P -->|Yes| Q[Proximity Check]
    P -->|No| R[Skip Proximity]
    
    Q -->|In Range| R
    Q -->|Out of Range| S[Show Warning]
    S --> T{Continue?}
    T -->|Yes| R
    T -->|No| U[Cancel]
    
    R --> V{Navigator Online?}
    V -->|No| W[Queue to IndexedDB]
    V -->|Yes| X[Generate Display ID]
    
    W --> Y[Show Offline Warning]
    X --> Z[Call record_sale RPC]
    
    Z --> AA{RPC Validates}
    AA -->|Credit Exceeded| AB[Error]
    AA -->|Lock Store Row| AC[Insert Sale]
    
    AC --> AD[Insert Sale Items]
    AD --> AE[Update Outstanding]
    AE --> AF[Check Pending Orders]
    AF -->|Found| AG[Mark Order Delivered]
    AF -->|None| AH[Complete]
    
    AG --> AH
    AH --> AI[Return Success]
    
    AI --> AJ[Invalidate Queries]
    AJ --> AK[Show Receipt]
    
    style O fill:#ffcccc
    style AB fill:#ffcccc
    style AH fill:#ccffcc
```

---

## 3. Transaction/Payment Flow

```mermaid
flowchart TD
    A[User Opens Transactions] --> B[Load Transaction List]
    B --> C[Filters: Date, Store, Payment Type]
    
    D[Click Record Transaction] --> E{Select Store}
    E --> F[Show Current Outstanding]
    
    F --> G[Enter Payment Amount]
    G --> H[Cash + UPI]
    
    H --> I[Calculate New Balance]
    I --> J{Exceeds Outstanding?}
    
    J -->|Yes| K[Show Error]
    J -->|No| L{Navigator Online?}
    
    L -->|No| M[Queue Offline]
    L -->|Yes| N[Call record_transaction RPC]
    
    M --> O[Store in IndexedDB]
    O --> P[Show Queued Message]
    
    N --> Q{RPC Validates}
    Q -->|Auth Check| R[Check Auth]
    Q -->|Amount Check| S[Validate Amount > 0]
    Q -->|Lock Row| T[SELECT FOR UPDATE]
    
    T --> U[Calculate Outstanding]
    U --> V[Insert Transaction]
    V --> W[Update Store Outstanding]
    
    W --> X{Backdated?}
    X -->|Yes| Y[Recalc Running Balances]
    X -->|No| Z[Return Success]
    Y --> Z
    
    Z --> AA[Invalidate Queries]
    AA --> AB[Show Success Toast]
    
    style K fill:#ffcccc
    style Z fill:#ccffcc
```

---

## 4. Order Management Flow

```mermaid
flowchart TD
    A[User Opens Orders] --> B[Load Order List]
    B --> C[Filter: Status, Date Range]
    
    D[Create New Order] --> E{Select Customer}
    E --> F{Select Store}
    F --> G{Order Type?}
    
    G -->|Simple| H[Enter Requirement Note]
    G -->|Detailed| I[Select Products + Qty]
    
    H --> J[Credit Limit Check]
    I --> J
    
    J --> K{RPC check_store_credit_limit}
    K -->|Exceeds Limit| L[Block Order]
    K -->|Warning (>80%)| M[Show Warning]
    K -->|OK| N[Proceed]
    
    M --> O{Continue?}
    O -->|No| P[Cancel]
    O -->|Yes| N
    
    N --> Q[Generate ORD-XXXXXX]
    Q --> R[Insert Order Record]
    R --> S{Detailed?}
    
    S -->|Yes| T[Insert Order Items]
    S -->|No| U[Notify Admins]
    T --> U
    
    U --> V[Invalidate Queries]
    
    W[View Pending Order] --> X{Actions}
    X -->|Fulfill| Y[OrderFulfillmentDialog]
    X -->|Cancel| Z[Show Reason Dialog]
    
    Y --> AA[Create Sale from Order]
    AA --> AB[record_sale RPC]
    AB --> AC[Link sale to order]
    AC --> AD[Update Order Status]
    
    Z --> AE[Select Reason]
    AE --> AF[Update Status to Cancelled]
    AF --> AG[Notify Customer]
    
    style L fill:#ffcccc
    style AD fill:#ccffcc
    style AG fill:#ccffcc
```

---

## 5. Route/Agent Session Flow

```mermaid
flowchart TD
    A[Agent Opens Routes] --> B[Load Agent Routes]
    B --> C[Filter by agent_routes Matrix]
    
    D[Start Route Session] --> E[Create route_sessions Record]
    E --> F[Start GPS Tracking]
    
    G[View Route] --> H[Show Stores List]
    H --> I[Sort by Distance]
    
    J[Select Store] --> K{Actions}
    K -->|Record Sale| L[Go to Sales Page]
    K -->|Record Payment| M[Go to Transactions]
    K -->|Mark Visited| N[Check Proximity]
    
    N --> O[Get Current GPS]
    O --> P{Within 100m?}
    
    P -->|Yes| Q[Log store_visits]
    P -->|No| R[Show Distance Warning]
    R --> S{Force Mark?}
    S -->|Yes| Q
    S -->|No| T[Cancel]
    
    Q --> U[Update Route Progress]
    U --> V[Notify Customer]
    
    W[End Session] --> X[Update route_sessions]
    X --> Y[Calculate Route Stats]
    Y --> Z[Show Summary]
    
    style Q fill:#ccffcc
    style T fill:#ffcccc
```

---

## 6. Handover (Cash/UPI Collection) Flow

```mermaid
flowchart TD
    A[User Opens Handovers] --> B[Calculate Pending Amount]
    B --> C[Sum: Sales - Received - Sent - Expenses]
    
    D[Create Handover] --> E[Select Recipient]
    E --> F[Enter Amount]
    F --> G{Partial Collection?}
    
    G -->|Yes| H[Allow Partial Amount]
    G -->|No| I[Must Match Total]
    
    H --> J[Insert handover Record]
    I --> J
    
    J --> K[Status: awaiting_confirmation]
    K --> L[Notify Recipient]
    
    M[Recipient Views] --> N{Actions}
    N -->|Confirm| O[Update Status]
    N -->|Reject| P[Update Status]
    
    O --> Q[confirmed_by + confirmed_at]
    O --> R[Update Recipient Balance]
    O --> S[Notify Sender]
    
    P --> T[rejected_at]
    P --> U[Notify Sender of Rejection]
    
    V[Submit Expense Claim] --> W[Select Category]
    W --> X[Enter Amount + Receipt]
    X --> Y[Status: pending]
    Y --> Z[Notify Admin]
    
    AA[Admin Reviews] --> AB{Actions}
    AB -->|Approve| AC[Update Status]
    AB -->|Reject| AD[Update Status]
    
    AC --> AE[Deduct from Outstanding]
    AC --> AF[Notify Staff]
    AD --> AG[Notify Staff]
    
    style O fill:#ccffcc
    style P fill:#ffcccc
    style AC fill:#ccffcc
```

---

## 7. Offline Sync Flow

```mermaid
flowchart TD
    A[App Detects Offline] --> B[Monitor navigator.onLine]
    
    C[User Action: Sale/Txn] --> D{Online?}
    D -->|No| E[Add to Queue]
    
    E --> F[Generate Business Key]
    F --> G{Duplicate?}
    
    G -->|Yes| H[Skip Duplicate]
    G -->|No| I[Store in IndexedDB]
    
    I --> J[Show Queued Message]
    J --> K[Emit Queue Changed Event]
    
    L[App Comes Online] --> M[Connection Restored]
    M --> N[Check Pending Actions]
    
    N --> O[Get Queued Actions]
    O --> P{Process Each Action}
    
    P -->|sale| Q[Call record_sale RPC]
    P -->|transaction| R[Call record_transaction RPC]
    P -->|visit| S[Insert store_visits]
    P -->|customer| T[Insert customers]
    P -->|store| U[Insert stores]
    
    Q --> V{Success?}
    R --> V
    S --> V
    T --> V
    U --> V
    
    V -->|Yes| W[Remove from Queue]
    V -->|No| X{Retry Count < 3?}
    
    X -->|Yes| Y[Increment Retry]
    Y --> Z[Delay Exponential]
    Z --> P
    
    X -->|No| AA[Mark as Failed]
    AA --> AB[Log Error]
    
    W --> AC[Show Sync Success]
    AB --> AD[Show Sync Errors]
    
    style H fill:#ffffcc
    style W fill:#ccffcc
    style AA fill:#ffcccc
```

---

## 8. Real-time Sync Flow

```mermaid
flowchart TD
    A[App Mounts] --> B[useRealtimeSync Hook]
    B --> C{Is Staff Role?}
    
    C -->|No| D[Skip Realtime]
    C -->|Yes| E[Get Tables for Role]
    
    E --> F{Role = ?}
    F -->|super_admin| G[Subscribe All Tables]
    F -->|manager| H[Subscribe Operational]
    F -->|agent| I[Subscribe: Sales, Routes, Visits]
    F -->|marketer| J[Subscribe: Orders, Customers]
    F -->|pos| K[Subscribe: Sales, Products]
    
    G --> L[Create Shared Channel]
    H --> L
    I --> L
    J --> L
    K --> L
    
    L --> M[Subscribe to Changes]
    M --> N[On Database Change]
    
    N --> O{Event Type}
    O -->|INSERT| P[Get Affected Keys]
    O -->|UPDATE| P
    O -->|DELETE| P
    
    P --> Q{Filter by User?}
    Q -->|Admin| R[Skip Filter]
    Q -->|Non-Admin| S[Check recorded_by]
    
    S -->|Matches| R
    S -->|No Match| T[Skip Update]
    
    R --> U[Invalidate React Query Keys]
    U --> V[Refresh UI]
    
    W[Component Unmounts] --> X[Remove Subscriber]
    X --> Y{Last Subscriber?}
    Y -->|Yes| Z[Remove Channel]
    Y -->|No| AA[Keep Channel]
    
    style D fill:#ffffcc
    style V fill:#ccffcc
    style T fill:#ffffcc
```

---

## 9. Data Quality Check Flow

```mermaid
flowchart TD
    A[Scheduled Trigger] --> B[Call data-quality-check Edge Function]
    B --> C[Run Quality Checks]
    
    C --> D{Check Types}
    D -->|1| E[Negative Outstanding]
    D -->|2| F[Orphaned Sale Items]
    D -->|3| G[Orphaned Order Items]
    D -->|4| H[Store-Customer Mismatches]
    D -->|5| I[Duplicate Phones]
    D -->|6| J[Miscalculated Sales]
    D -->|7| K[Stale Pending Orders]
    D -->|8| L[Handover Mismatches]
    
    E --> M[Collect Issues]
    F --> M
    G --> M
    H --> M
    I --> M
    J --> M
    K --> M
    L --> M
    
    M --> N{Issues Found?}
    N -->|No| O[Log Clean Status]
    N -->|Yes| P[Insert to data_quality_issues]
    
    P --> Q{Critcal Issues?}
    Q -->|Yes| R[Notify Admins]
    Q -->|No| S[Skip Notification]
    
    R --> T[Send In-App Notifications]
    S --> U[Return Results]
    O --> U
    
    U --> V[Admin Views Dashboard]
    V --> W[Review Issues]
    W --> X{Actions}
    X -->|Fix| Y[Update Database]
    X -->|Mark Resolved| Z[Update Issue Status]
    X -->|Ignore| AA[Add Notes]
    
    style R fill:#ffcccc
    style Y fill:#ccffcc
```

---

## 10. KYC Verification Flow

```mermaid
flowchart TD
    A[Customer Uploads KYC] --> B[Store in Storage]
    B --> C[Update customer.kyc_status]
    C --> D[Status: pending_verification]
    
    E[Admin Opens KycReviewDialog] --> F[View Documents]
    F --> G[Review Images]
    
    G --> H{Decision}
    H -->|Approve| I[Set Status: verified]
    H -->|Reject| J[Set Status: rejected]
    
    I --> K[Lock Customer Photo]
    I --> L[Update Credit Limit]
    
    J --> M[Select Reason]
    M --> N[Notify Customer]
    
    K --> O[Log Activity]
    L --> O
    N --> P[Log Activity]
    
    O --> Q[Update UI]
    P --> Q
    
    R[Customer Views Status] --> S{Status}
    S -->|Verified| T[Show Verified Badge]
    S -->|Rejected| U[Show Rejection + Reason]
    S -->|Pending| V[Show Pending]
    
    U --> W[Re-upload Option]
    W --> A
    
    style I fill:#ccffcc
    style J fill:#ffcccc
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 | Success/Complete |
| 🔴 | Error/Blocked |
| 🟡 | Warning/Caution |
| 🔵 | Process/Action |
| ⚪ | Decision Point |

---

*Flowcharts generated: 2026-04-12*
