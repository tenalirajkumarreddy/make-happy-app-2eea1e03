package dev.opensms.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import dev.opensms.R

val SyneFamily = FontFamily(
    Font(R.font.syne_bold, FontWeight.Bold),
    Font(R.font.syne_extrabold, FontWeight.ExtraBold),
)

val JetBrainsMonoFamily = FontFamily(
    Font(R.font.jetbrainsmono_regular, FontWeight.Normal),
    Font(R.font.jetbrainsmono_medium, FontWeight.Medium),
)

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
