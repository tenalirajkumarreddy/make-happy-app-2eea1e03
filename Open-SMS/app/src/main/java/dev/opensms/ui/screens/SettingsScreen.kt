package dev.opensms.ui.screens

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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.viewmodel.MainViewModel

@Composable
fun SettingsScreen(navController: NavController, vm: MainViewModel = hiltViewModel()) {
    val prefs = vm.prefs
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current

    // Server config state
    var port by remember { mutableStateOf(prefs.port.toString()) }
    var apiKey by remember { mutableStateOf(prefs.apiKey) }
    var showApiKey by remember { mutableStateOf(false) }

    // Behaviour state
    var autoStart by remember { mutableStateOf(prefs.autoStart) }
    var notifyOnFailure by remember { mutableStateOf(prefs.notifyOnFailure) }
    var smsRateLimit by remember { mutableStateOf(prefs.smsPerMinute.toFloat()) }
    var webhookUrl by remember { mutableStateOf(prefs.webhookUrl) }
    var ipAllowlist by remember { mutableStateOf(prefs.ipAllowlist) }

    // Test SMS state
    var testPhone by remember { mutableStateOf("") }
    var testResult by remember { mutableStateOf<String?>(null) }
    var testRunning by remember { mutableStateOf(false) }

    // Dialogs
    var showResetDialog by remember { mutableStateOf(false) }
    var showRegenerateDialog by remember { mutableStateOf(false) }
    var showInternetGuide by remember { mutableStateOf(false) }
    var showLanIps by remember { mutableStateOf(false) }

    // Dialogs
    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("Reset Gateway") },
            text = { Text("This will clear all config, stop the service, and return to Setup. Are you sure?") },
            confirmButton = {
                TextButton(onClick = {
                    vm.resetAll()
                    navController.navigate("setup") { popUpTo("dashboard") { inclusive = true } }
                }) { Text("Reset", color = OpenSMSColors.red) }
            },
            dismissButton = { TextButton(onClick = { showResetDialog = false }) { Text("Cancel") } },
            containerColor = OpenSMSColors.surface,
        )
    }

    if (showRegenerateDialog) {
        AlertDialog(
            onDismissRequest = { showRegenerateDialog = false },
            title = { Text("Regenerate API Key") },
            text = { Text("Your current API key will be invalidated. All existing integrations must be updated with the new key.") },
            confirmButton = {
                TextButton(onClick = { apiKey = vm.regenerateApiKey(); showRegenerateDialog = false }) {
                    Text("Regenerate", color = OpenSMSColors.orange)
                }
            },
            dismissButton = { TextButton(onClick = { showRegenerateDialog = false }) { Text("Cancel") } },
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
        // Top bar
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { navController.popBackStack() }) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = OpenSMSColors.muted)
            }
            Text("Settings", style = MaterialTheme.typography.headlineMedium)
        }

        // ── Server Config ────────────────────────────────────────────
        SettingsSection("Server Config") {
            OutlinedTextField(
                value = port,
                onValueChange = { port = it.filter { c -> c.isDigit() }.take(5) },
                label = { Text("HTTP Port") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = textFieldColors(),
            )

            OutlinedTextField(
                value = if (showApiKey) apiKey else "•".repeat(minOf(apiKey.length, 32)),
                onValueChange = {},
                label = { Text("API Key") },
                modifier = Modifier.fillMaxWidth(),
                readOnly = true,
                singleLine = true,
                colors = textFieldColors(),
                trailingIcon = {
                    Row(modifier = Modifier.padding(end = 4.dp)) {
                        IconButton(onClick = { showApiKey = !showApiKey }) {
                            Icon(
                                if (showApiKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = "Toggle visibility",
                                tint = OpenSMSColors.muted,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        IconButton(onClick = { clipboard.setText(AnnotatedString(apiKey)) }) {
                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = OpenSMSColors.muted, modifier = Modifier.size(20.dp))
                        }
                        IconButton(onClick = { showRegenerateDialog = true }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Regenerate", tint = OpenSMSColors.orange, modifier = Modifier.size(20.dp))
                        }
                    }
                },
            )

            // Device URL read-only
            val deviceUrl = "http://${vm.localIpAddress}:${port.toIntOrNull() ?: prefs.port}"
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Device URL:", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
                Text(deviceUrl, style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.accent, modifier = Modifier.weight(1f))
                IconButton(onClick = { clipboard.setText(AnnotatedString(deviceUrl)) }, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy URL", tint = OpenSMSColors.muted, modifier = Modifier.size(16.dp))
                }
            }

            Button(
                onClick = {
                    prefs.port = port.toIntOrNull() ?: prefs.port
                    prefs.webhookUrl = webhookUrl
                    prefs.ipAllowlist = ipAllowlist
                    if (vm.isServiceRunning) { vm.stopGateway(); vm.startGateway() }
                },
                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.indigo),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
            ) { Text("Save & Restart Service") }
        }

        // ── Behaviour ────────────────────────────────────────────────
        SettingsSection("Behaviour") {
            ToggleRow("Auto-start on Boot", autoStart) { autoStart = it; prefs.autoStart = it }
            ToggleRow("Notify on Failure", notifyOnFailure) { notifyOnFailure = it; prefs.notifyOnFailure = it }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("SMS Rate Limit: ${smsRateLimit.toInt()}/min", style = MaterialTheme.typography.bodyMedium)
                Slider(
                    value = smsRateLimit,
                    onValueChange = { smsRateLimit = it },
                    onValueChangeFinished = { prefs.smsPerMinute = smsRateLimit.toInt() },
                    valueRange = 1f..60f,
                    colors = SliderDefaults.colors(thumbColor = OpenSMSColors.accent, activeTrackColor = OpenSMSColors.accent),
                )
            }

            OutlinedTextField(
                value = webhookUrl,
                onValueChange = { webhookUrl = it },
                label = { Text("Webhook URL (optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("https://yourapp.com/webhooks/sms") },
                colors = textFieldColors(),
            )
        }

        // ── Security ─────────────────────────────────────────────────
        SettingsSection("Security") {
            OutlinedTextField(
                value = ipAllowlist,
                onValueChange = { ipAllowlist = it },
                label = { Text("IP Allowlist (optional)") },
                placeholder = { Text("192.168.1.10, 10.0.0.1") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = textFieldColors(),
            )
            Text(
                "Comma-separated IPs. When set, requests from other IPs return 403. Leave blank to allow all.",
                style = MaterialTheme.typography.bodyMedium,
                color = OpenSMSColors.muted,
            )
        }

        // ── Internet Access Guide ─────────────────────────────────────
        SettingsSection("Internet Access") {
            // Detect LAN IP
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Detect LAN IPs", style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { vm.detectAllIps(); showLanIps = true }) {
                    Text("Detect", color = OpenSMSColors.accent)
                }
            }

            if (showLanIps && vm.allLocalIps.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(OpenSMSColors.surface2, RoundedCornerShape(8.dp))
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    vm.allLocalIps.forEach { ip ->
                        Text(ip, style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.accent)
                    }
                }
            }

            Divider(color = OpenSMSColors.border)

            // Internet guide toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Setup Internet Access", style = MaterialTheme.typography.bodyMedium)
                IconButton(onClick = { showInternetGuide = !showInternetGuide }) {
                    Icon(
                        if (showInternetGuide) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        tint = OpenSMSColors.muted,
                    )
                }
            }

            if (showInternetGuide) {
                InternetAccessGuide()
            }
        }

        // ── Test SMS ─────────────────────────────────────────────────
        SettingsSection("Test SMS") {
            Text(
                "Send a real SMS to verify your SIM is active and the gateway works.",
                style = MaterialTheme.typography.bodyMedium,
                color = OpenSMSColors.muted,
            )
            OutlinedTextField(
                value = testPhone,
                onValueChange = { testPhone = it },
                label = { Text("Phone number (E.164 format)") },
                placeholder = { Text("+919876543210") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                colors = textFieldColors(),
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
                    testResult = null
                    vm.sendTestSms(testPhone) { success, msg ->
                        testResult = msg
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
            if (!vm.isServiceRunning) {
                Text("Start the gateway first to send a test SMS.", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.orange)
            }
        }

        // ── Data ─────────────────────────────────────────────────────
        SettingsSection("Data") {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { vm.clearLogs() },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = OpenSMSColors.muted),
                ) { Text("Clear Logs") }

                Button(
                    onClick = { vm.exportLogs(context) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.indigoDim),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp), tint = OpenSMSColors.indigo)
                    Spacer(Modifier.width(6.dp))
                    Text("Export CSV", color = OpenSMSColors.indigo)
                }
            }
        }

        // ── Danger Zone ───────────────────────────────────────────────
        SettingsSection("Danger Zone") {
            Button(
                onClick = { showResetDialog = true },
                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.redDim),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
            ) { Text("Reset Gateway", color = OpenSMSColors.red) }
        }

        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun InternetAccessGuide() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(OpenSMSColors.surface2, RoundedCornerShape(10.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        GuideOption(
            title = "Cloudflare Tunnel",
            badge = "Free · Permanent URL",
            badgeColor = OpenSMSColors.accent,
            steps = listOf(
                "Install Termux from F-Droid on your phone",
                "Run: pkg install cloudflared",
                "Run: cloudflared tunnel --url http://localhost:8080",
                "Copy the generated https://xxxx.trycloudflare.com URL",
            ),
        )
        Divider(color = OpenSMSColors.border)
        GuideOption(
            title = "Tailscale",
            badge = "Best for Teams",
            badgeColor = OpenSMSColors.indigo,
            steps = listOf(
                "Install Tailscale app from Play Store",
                "Sign in with Google or GitHub",
                "Phone gets stable IP: 100.x.x.x",
                "Connect: http://100.x.x.x:8080",
            ),
        )
        Divider(color = OpenSMSColors.border)
        GuideOption(
            title = "Ngrok",
            badge = "Quick dev tunnel",
            badgeColor = OpenSMSColors.orange,
            steps = listOf(
                "Install Termux from F-Droid",
                "Run: pkg install ngrok",
                "Run: ngrok http 8080",
                "Copy the https://xxxx.ngrok.io URL",
            ),
        )
    }
}

@Composable
private fun GuideOption(
    title: String,
    badge: String,
    badgeColor: androidx.compose.ui.graphics.Color,
    steps: List<String>,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                badge,
                style = MaterialTheme.typography.labelSmall,
                color = badgeColor,
                modifier = Modifier
                    .background(
                        badgeColor.copy(alpha = 0.15f),
                        RoundedCornerShape(4.dp),
                    )
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        steps.forEachIndexed { i, step ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${i + 1}.", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
                Text(step, style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
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
        Text(label, style = MaterialTheme.typography.bodyMedium)
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
private fun textFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = OpenSMSColors.accent,
    unfocusedBorderColor = OpenSMSColors.border,
    focusedTextColor = OpenSMSColors.text,
    unfocusedTextColor = OpenSMSColors.text,
    cursorColor = OpenSMSColors.accent,
)
