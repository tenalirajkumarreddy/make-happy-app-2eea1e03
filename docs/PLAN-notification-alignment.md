# PLAN-notification-alignment.md

## Problem Diagnosis
The bottom sheets (such as `NotificationsSheet`, `StorePickerSheet`, and `StockTransferSheet`) are styled with a left alignment gap on the right on mobile screens. 

### Root Cause
In `src/mobile/styles/mobile-overrides.css`, the rule targeting dialogs on lines 191–196 applies to any open element with `role="dialog"`:
```css
.mobile-page-wrapper ~ [role="dialog"],
[data-state="open"][role="dialog"] {
  width: calc(100% - 2rem) !important;
  max-width: 100% !important;
  border-radius: 1rem !important;
}
```
Because both Dialogs and Sheets are rendered by Radix UI using the HTML attribute `role="dialog"`, this CSS rule is globally applied to both components.
- Standard dialogs are centered on the screen using absolute translation (`left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]`), so a width of `calc(100% - 2rem)` renders them correctly centered with equal margins on the left and right.
- Bottom sheets, however, position themselves via `left: 0; right: 0; bottom: 0;` (using the Tailwind class `inset-x-0 bottom-0`).
- When `width: calc(100% - 2rem) !important` is applied to a bottom sheet, its width becomes smaller than the viewport. Because it remains pinned to the left via `left: 0`, the sheet is pushed to the left, leaving a `2rem` empty gap on the right.

---

## Proposed Solution
To fix this layout issue, the mobile override CSS should differentiate between standard Dialog components and bottom Sheet components. 

We can restrict the custom sizing to Dialog components only (or exclude sheet contents/bottom-oriented containers):

```diff
- .mobile-page-wrapper ~ [role="dialog"],
- [data-state="open"][role="dialog"] {
+ .mobile-page-wrapper ~ [role="dialog"]:not([class*="SheetContent"]),
+ [data-state="open"][role="dialog"]:not([class*="SheetContent"]) {
    width: calc(100% - 2rem) !important;
    max-width: 100% !important;
    border-radius: 1rem !important;
  }
```

This prevents the bottom sheets (which have the `SheetContent` class) from receiving the `width: calc(100% - 2rem)` constraint, restoring their correct full-width layout.

---

## Verification Plan
1. Open the application in mobile mode/simulation.
2. Trigger the Notifications panel or any other sheet.
3. Confirm that sheets now span the full width of the screen on mobile devices without any gap on the right.
4. Verify that standard Dialog modals are still styled correctly (centered with margins).
