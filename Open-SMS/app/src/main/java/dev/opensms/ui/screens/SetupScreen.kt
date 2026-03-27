package dev.opensms.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.viewmodel.MainViewModel

@Composable
fun SetupScreen(onSetupComplete: () -> Unit, vm: MainViewModel = hiltViewModel()) {
    var port by remember { mutableStateOf("8080") }
    val apiKey = remember { vm.prefs.apiKey }
    val clipboard = LocalClipboardManager.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(OpenSMSColors.bg)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("OpenSMS Setup", style = MaterialTheme.typography.headlineLarge)

            Text(
                "Configure your SMS gateway. You only need to do this once.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth(),
            )

            // Port field
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("HTTP Port", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = port,
                    onValueChange = { port = it.filter { c -> c.isDigit() }.take(5) },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    label = { Text("Port (default: 8080)") },
                    colors = outlinedTextFieldColors(),
                )
            }

            // API Key display
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("API Key (auto-generated)", style = MaterialTheme.typography.titleMedium)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(OpenSMSColors.surface2, RoundedCornerShape(8.dp))
                        .border(1.dp, OpenSMSColors.border, RoundedCornerShape(8.dp))
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = apiKey,
                        style = MaterialTheme.typography.labelSmall,
                        color = OpenSMSColors.accent,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        onClick = { clipboard.setText(AnnotatedString(apiKey)) },
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = OpenSMSColors.muted)
                    }
                }
            }

            Button(
                onClick = {
                    val p = port.toIntOrNull() ?: 8080
                    vm.completeSetup(p)
                    onSetupComplete()
                },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.accent),
                shape = RoundedCornerShape(10.dp),
            ) {
                Text("Start Gateway", color = OpenSMSColors.bg, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun outlinedTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = OpenSMSColors.accent,
    unfocusedBorderColor = OpenSMSColors.border,
    focusedTextColor = OpenSMSColors.text,
    unfocusedTextColor = OpenSMSColors.text,
    cursorColor = OpenSMSColors.accent,
)
