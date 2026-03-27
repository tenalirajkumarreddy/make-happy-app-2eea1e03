package dev.opensms.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Fallback to system fonts to prevent crash loop on missing/corrupt font resources
val SyneFamily = FontFamily.SansSerif
val JetBrainsMonoFamily = FontFamily.Monospace

val OpenSMSTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = SyneFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        color = OpenSMSColors.text,
    ),
    headlineMedium = TextStyle(
        fontFamily = SyneFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 22.sp,
        color = OpenSMSColors.text,
    ),
    titleLarge = TextStyle(
        fontFamily = SyneFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        color = OpenSMSColors.text,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        color = OpenSMSColors.text,
    ),
    bodyLarge = TextStyle(
        fontSize = 14.sp,
        color = OpenSMSColors.text,
    ),
    bodyMedium = TextStyle(
        fontSize = 13.sp,
        color = OpenSMSColors.muted,
    ),
    labelSmall = TextStyle(
        fontFamily = JetBrainsMonoFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        color = OpenSMSColors.muted,
    ),
)
