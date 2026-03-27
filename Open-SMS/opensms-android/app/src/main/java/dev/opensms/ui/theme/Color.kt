package dev.opensms.ui.theme

import androidx.compose.ui.graphics.Color

object OpenSMSColors {
    val bg        = Color(0xFF080B14)   // App background
    val surface   = Color(0xFF0F1320)   // Cards
    val surface2  = Color(0xFF161C2E)   // Inputs, secondary surfaces
    val border    = Color(0xFF1E2640)   // Borders, dividers
    val accent    = Color(0xFF00F0A0)   // Primary — connected, success, delivered
    val accentDim = Color(0x1F00F0A0)   // Accent tint background
    val indigo    = Color(0xFF6C63FF)   // Sent status, secondary actions
    val indigoDim = Color(0x1F6C63FF)
    val orange    = Color(0xFFF59E0B)   // Pending, warning
    val orangeDim = Color(0x1FF59E0B)
    val red       = Color(0xFFFF4D6D)   // Failed, error, danger
    val redDim    = Color(0x1FFF4D6D)
    val text      = Color(0xFFE8EBF5)   // Primary text
    val muted     = Color(0xFF5A6080)   // Secondary text, labels
    val muted2    = Color(0xFF3A4060)   // Tertiary text, disabled
}

fun statusColor(status: String) = when (status.lowercase()) {
    "delivered" -> OpenSMSColors.accent
    "sent"      -> OpenSMSColors.indigo
    "failed"    -> OpenSMSColors.red
    "pending",
    "queued"    -> OpenSMSColors.orange
    else        -> OpenSMSColors.muted
}
