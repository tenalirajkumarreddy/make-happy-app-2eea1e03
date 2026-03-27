package dev.opensms.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.viewmodel.MainViewModel

@Composable
fun SettingsScreen(
    navController: NavController,
    onDisconnect: () -> Unit,
    vm: MainViewModel = hiltViewModel(),
) {
    val prefs     = vm.prefs
    val clipboard = LocalClipboardManager.current
    val context   = LocalContext.current

    var autoStart       by remember { mutableStateOf(prefs.autoStartOnBoot) }
    var notifyOnFailure by remember { mutableStateOf(prefs.notifyOnFailure) }
    var smsRateLimit    by remember { mutableStateOf(prefs.smsPerMinute.toFloat()) }

    var testPhone   by remember { mutableStateOf("") }
    var testResult  by remember { mutableStateOf<String?>(null) }
    var testRunning by remember { mutableStateOf(false) }

    var showDisconnectDialog by remember { mutableStateOf(false) }

    if (showDisconnectDialog) {
        AlertDialog(
            onDismissRequest = { showDisconnectDialog = false },
            title = { Text("Disconnect Gateway") },
            text  = { Text("This will stop the gateway, clear your Supabase credentials, and return to the Connect screen.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.disconnect()
                    onDisconnect()
                }) { Text("Disconnect", color = OpenSMSColors.red) }
            },
            dismissButton = {
                TextButton(onClick = { showDisconnectDialog = false }) { Text("Cancel") }
            },
            containerColor = OpenSMSColors.surface,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OpenSMSColors.bg)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { navController.popBackStack() }) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = OpenSMSColors.muted)
            }
            Text("Settings", style = MaterialTheme.typography.headlineMedium, color = OpenSMSColors.text)
        }

        SettingsSection("Connection") {
            InfoRow(
                label = "Project URL",
                value = prefs.supabaseDomain().ifBlank { "Not configured" },
                copyable = true,
                clipboard = clipboard,
                fullValue = prefs.supabaseUrl,
            )
            InfoRow(
                label = "Status",
                value = if (vm.isServiceRunning) vm.connectionStatus.name.lowercase() else "stopped",
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = { vm.reconnectNow() },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = OpenSMSColors.accent),
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Reconnect Now")
                }

                OutlinedButton(
                    onClick = { requestBatteryExclusion(context) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = OpenSMSColors.orange),
                ) {
                    Icon(Icons.Default.BatteryAlert, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Battery")
                }
            }
        }

        SettingsSection("Behaviour") {
            ToggleRow("Auto-start on Boot", autoStart) {
                autoStart = it; prefs.autoStartOnBoot = it
            }
            ToggleRow("Notify on Failure", notifyOnFailure) {
                notifyOnFailure = it; prefs.notifyOnFailure = it
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "SMS Rate Limit: ${smsRateLimit.toInt()}/min",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.text,
                )
                Slider(
                    value = smsRateLimit,
                    onValueChange = { smsRateLimit = it },
                    onValueChangeFinished = { prefs.smsPerMinute = smsRateLimit.toInt() },
                    valueRange = 1f..60f,
                    colors = SliderDefaults.colors(
                        thumbColor = OpenSMSColors.accent,
                        activeTrackColor = OpenSMSColors.accent,
                    ),
                )
            }
        }

        SettingsSection("Test SMS") {
            Text(
                "Send a real SMS to verify the gateway is working.",
                style = MaterialTheme.typography.bodyMedium,
                color = OpenSMSColors.muted,
            )
            OutlinedTextField(
                value = testPhone,
                onValueChange = { testPhone = it },
                label = { Text("Phone number (E.164)") },
                placeholder = { Text("+919876543210") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                colors = settingsTextFieldColors(),
            )
            testResult?.let { result ->
                val isSuccess = result.startsWith("Test SMS sent")
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = if (isSuccess) OpenSMSColors.accentDim else OpenSMSColors.redDim,
                ) {
                    Text(
                        result,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSuccess) OpenSMSColors.accent else OpenSMSColors.red,
                    )
                }
            }
            Button(
                onClick = {
                    testRunning = true
                    testResult  = null
                    vm.sendTestSms(testPhone) { _, msg ->
                        testResult  = msg
                        testRunning = false
                    }
                },
                enabled = testPhone.isNotBlank() && !testRunning && vm.isServiceRunning,
                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.accent),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
            ) {
                if (testRunning) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = OpenSMSColors.bg, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (testRunning) "Sending…" else "Send Test SMS", color = OpenSMSColors.bg)
            }
        }

        SettingsSection("Danger Zone") {
            Button(
                onClick = { showDisconnectDialog = true },
                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.redDim),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
            ) {
                Icon(Icons.Default.LinkOff, contentDescription = null, modifier = Modifier.size(16.dp), tint = OpenSMSColors.red)
                Spacer(Modifier.width(8.dp))
                Text("Disconnect", color = OpenSMSColors.red)
            }
            Text(
                "Clears credentials and returns to Connect screen.",
                style = MaterialTheme.typography.bodyMedium,
                color = OpenSMSColors.muted,
            )
        }

        Spacer(Modifier.height(32.dp))
    }
}

private fun requestBatteryExclusion(context: Context) {
    try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        context.startActivity(intent)
    } catch (_: Exception) {}
}

@Composable
private fun InfoRow(
    label: String,
    value: String,
    copyable: Boolean = false,
    clipboard: ClipboardManager? = null,
    fullValue: String = value,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("$label:", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
        Text(value, style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.accent, modifier = Modifier.weight(1f))
        if (copyable && clipboard != null) {
            IconButton(onClick = { clipboard.setText(AnnotatedString(fullValue)) }, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = OpenSMSColors.muted, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = OpenSMSColors.surface,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = OpenSMSColors.accent)
            content()
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.text)
        Switch(
            checked = checked,
            onCheckedChange = onToggle,
            colors = SwitchDefaults.colors(
                checkedThumbColor = OpenSMSColors.bg,
                checkedTrackColor = OpenSMSColors.accent,
            ),
        )
    }
}

@Composable
private fun settingsTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor   = OpenSMSColors.accent,
    unfocusedBorderColor = OpenSMSColors.border,
    focusedTextColor     = OpenSMSColors.text,
    unfocusedTextColor   = OpenSMSColors.text,
    cursorColor          = OpenSMSColors.accent,
)
