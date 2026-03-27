package dev.opensms.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    background    = OpenSMSColors.bg,
    surface       = OpenSMSColors.surface,
    surfaceVariant = OpenSMSColors.surface2,
    primary       = OpenSMSColors.accent,
    onPrimary     = OpenSMSColors.bg,
    secondary     = OpenSMSColors.indigo,
    onSecondary   = OpenSMSColors.text,
    tertiary      = OpenSMSColors.orange,
    error         = OpenSMSColors.red,
    onBackground  = OpenSMSColors.text,
    onSurface     = OpenSMSColors.text,
    outline       = OpenSMSColors.border,
)

@Composable
fun OpenSMSTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = OpenSMSTypography,
        content = content,
    )
}
