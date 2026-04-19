# Orders Page UX Improvements

## Current Issues

### 1. Button Clutter
- **Problem**: 4-5 buttons visible per row
- **Impact**: Cognitive overload, hard to scan
- **Solution**: Group secondary actions in dropdown

### 2. Mobile Layout Issues  
- **Problem**: Actions wrap to multiple lines
- **Impact**: Takes too much vertical space
- **Solution**: Use action sheet or "More" button

### 3. No Visual Hierarchy
- **Problem**: All buttons look equal
- **Impact**: Primary action unclear
- **Solution**: Highlight primary action, gray out secondary

### 4. Invoice Button Context
- **Problem**: Invoice button on pending orders looks odd
- **Impact**: User confusion
- **Solution**: Label should reflect purpose: "Proforma" for pending, "Invoice" for delivered

## Proposed Solution

### Desktop Layout
```
┌─────────────────────────────────────────────────────────┐
│ Order ID  │ Store  │ Status │ Actions                  │
├─────────────────────────────────────────────────────────┤
│ ORD-123   │ ABC    │ ● Pending  │ [Fulfill] [More ▼] │
│ ORD-124   │ XYZ    │ ✓ Delivered│ [Invoice] [More ▼] │
└─────────────────────────────────────────────────────────┘
```

**Primary Actions:**
- Pending: Fulfill (green)
- Delivered: Invoice (purple)
- Cancelled: View only

**Dropdown Menu (More):**
- Edit
- Transfer
- Cancel
- View Details
- Print

### Mobile Layout
```
┌─────────────────────────────────┐
│ ORD-123                    ●    │
│ ABC Store               Pending │
│ Test Customer                   │
├─────────────────────────────────┤
│ [Fulfill] [More ▼]              │
└─────────────────────────────────┘
```

## Implementation Plan

1. Create reusable `OrderActions` component
2. Use DropdownMenu for secondary actions
3. Show only 1-2 primary actions
4. Add tooltips for clarity
5. Responsive: Stack on mobile, row on desktop
