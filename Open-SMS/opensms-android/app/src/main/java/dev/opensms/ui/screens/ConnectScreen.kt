package dev.opensms.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import dev.opensms.qr.QRScannerView
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.viewmodel.MainViewModel
import org.json.JSONObject

@Composable
fun ConnectScreen(
    onConnected: () -> Unit,
    vm: MainViewModel = hiltViewModel(),
) {
    val context = LocalContext.current

<<<<<<< Updated upstream
    var supabaseUrl  by remember { mutableStateOf("") }
    var anonKey      by remember { mutableStateOf("") }
    var showKey      by remember { mutableStateOf(false) }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMsg     by remember { mutableStateOf<String?>(null) }
    var showCamera   by remember { mutableStateOf(false) }

=======
    var state         by remember { mutableStateOf(ConnectState.IDLE) }
    var errorMsg      by remember { mutableStateOf("") }
    var showManual    by remember { mutableStateOf(false) }
    var decodedPayload by remember { mutableStateOf<QRPayload?>(null) }
    var manualUrl     by remember { mutableStateOf("https://") }
    var manualKey     by remember { mutableStateOf("") }
>>>>>>> Stashed changes
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED
        )
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (granted) showCamera = true
        else errorMsg = "Camera permission needed for QR scan"
    }

    fun handleQRDecoded(raw: String) {
        showCamera = false
        try {
            val json = JSONObject(raw)
            supabaseUrl = json.optString("supabaseUrl").ifBlank { json.optString("supabase_url") }
            anonKey     = json.optString("anonKey").ifBlank { json.optString("anon_key") }
            if (supabaseUrl.isBlank() || anonKey.isBlank()) {
                errorMsg = "QR code missing supabaseUrl or anonKey"
            }
        } catch (e: Exception) {
            errorMsg = "Invalid QR code format"
        }
    }

<<<<<<< Updated upstream
    fun doConnect() {
        errorMsg = null
        if (!supabaseUrl.startsWith("https://")) {
            errorMsg = "URL must start with https://"
            return
        }
        if (anonKey.isBlank()) {
            errorMsg = "Anon key cannot be empty"
            return
        }
        isConnecting = true
        requestBatteryOptimizationExclusion(context)
        vm.connect(supabaseUrl, anonKey)
        isConnecting = false
=======
    fun doConnect(supabaseUrl: String, supabaseKey: String) {
        state = ConnectState.CONNECTING
        vm.connectFromQR(supabaseUrl, supabaseKey)
>>>>>>> Stashed changes
        onConnected()
    }

    if (showCamera && hasCameraPermission) {
        Box(modifier = Modifier.fillMaxSize().background(OpenSMSColors.bg)) {
            QRScannerView(
                modifier = Modifier.fillMaxSize(),
                onQRDetected = ::handleQRDecoded,
            )
            IconButton(
                onClick = { showCamera = false },
                modifier = Modifier.align(Alignment.TopStart).padding(16.dp),
            ) {
                Icon(Icons.Default.Close, contentDescription = "Close", tint = OpenSMSColors.text)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomCenter)
                    .background(OpenSMSColors.bg.copy(alpha = 0.88f))
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Point camera at the QR code\nfrom your Supabase project",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.muted,
                    textAlign = TextAlign.Center,
                )
            }
        }
        return
    }

<<<<<<< Updated upstream
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .systemBarsPadding()
            .imePadding()
            .padding(horizontal = 24.dp, vertical = 32.dp),
=======
    fun handleManualConnect() {
        if (!manualUrl.startsWith("https://")) {
            errorMsg = "Supabase URL must start with https://"
            state = ConnectState.ERROR
            return
        }
        if (manualKey.isBlank()) {
            errorMsg = "API key cannot be empty."
            state = ConnectState.ERROR
            return
        }
        doConnect(manualUrl.trim(), manualKey.trim())
    }

    Box(
        modifier = Modifier.fillMaxSize().background(OpenSMSColors.bg),
    ) {
        when (state) {

            ConnectState.SCANNING -> {
                if (hasCameraPermission) {
                    QRScannerView(
                        modifier = Modifier.fillMaxSize(),
                        onQRDetected = ::handleQRResult,
                    )
                    IconButton(
                        onClick = { state = ConnectState.IDLE },
                        modifier = Modifier.align(Alignment.TopStart).padding(16.dp),
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel", tint = OpenSMSColors.text)
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .background(OpenSMSColors.bg.copy(alpha = 0.85f))
                            .padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                "Point camera at the QR code in your dashboard",
                                style = MaterialTheme.typography.bodyMedium,
                                color = OpenSMSColors.text,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                "Go to Settings > SMS Gateway and scan the QR",
                                style = MaterialTheme.typography.labelSmall,
                                color = OpenSMSColors.muted,
                                textAlign = TextAlign.Center,
                                fontFamily = FontFamily.Monospace,
                            )
                        }
                    }
                }
            }

            ConnectState.DECODED -> {
                val payload = decodedPayload!!
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                        modifier = Modifier.padding(32.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(72.dp)
                                .clip(CircleShape)
                                .background(OpenSMSColors.accentDim),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Default.QrCodeScanner,
                                contentDescription = null,
                                tint = OpenSMSColors.accent,
                                modifier = Modifier.size(36.dp),
                            )
                        }

                        Text("QR Scanned", style = MaterialTheme.typography.headlineSmall, color = OpenSMSColors.text)
                        Text(
                            "Ready to connect to your backend",
                            style = MaterialTheme.typography.bodyMedium,
                            color = OpenSMSColors.muted,
                            textAlign = TextAlign.Center,
                        )

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = OpenSMSColors.surface,
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Supabase URL", style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.muted)
                                    Text(
                                        payload.supabaseUrl,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = OpenSMSColors.accent,
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 13.sp,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Key", style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.muted)
                                    Text(
                                        "${payload.supabaseKey.take(8)}…" +
                                                payload.supabaseKey.takeLast(4),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = OpenSMSColors.muted,
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 13.sp,
                                    )
                                }
                            }
                        }

                        Button(
                            onClick = { doConnect(payload.supabaseUrl, payload.supabaseKey) },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.accent),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Icon(Icons.Default.Wifi, contentDescription = null, tint = OpenSMSColors.bg, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Connect Now", color = OpenSMSColors.bg, style = MaterialTheme.typography.titleMedium)
                        }

                        TextButton(onClick = { state = ConnectState.IDLE }) {
                            Text("Scan Different QR", color = OpenSMSColors.muted)
                        }
                    }
                }
            }

            ConnectState.CONNECTING -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        CircularProgressIndicator(color = OpenSMSColors.accent, strokeWidth = 3.dp)
                        Text("Connecting…", style = MaterialTheme.typography.titleMedium, color = OpenSMSColors.text)
                        Text("Authenticating with your backend", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
                    }
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 28.dp)
                        .systemBarsPadding()
                        .imePadding()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(Modifier.height(48.dp))

                    Box(
                        modifier = Modifier
                            .size(88.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(OpenSMSColors.accentDim),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Default.Sms,
                            contentDescription = null,
                            tint = OpenSMSColors.accent,
                            modifier = Modifier.size(48.dp),
                        )
                    }

                    Spacer(Modifier.height(28.dp))

                    Text("OpenSMS", style = MaterialTheme.typography.headlineLarge, color = OpenSMSColors.text)
                    Text(
                        "Zero-infrastructure SMS gateway",
                        style = MaterialTheme.typography.bodyMedium,
                        color = OpenSMSColors.muted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 6.dp),
                    )

                    Spacer(Modifier.height(36.dp))

                    if (state == ConnectState.ERROR) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = OpenSMSColors.redDim,
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = OpenSMSColors.red, modifier = Modifier.size(18.dp))
                                Text(errorMsg, style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.red)
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                    }

                    // ── How it works ──────────────────────────────────────────
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = OpenSMSColors.surface,
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text("How to connect", style = MaterialTheme.typography.titleSmall, color = OpenSMSColors.accent)
                            StepRow("1", "Go to Supabase Dashboard > Settings > API")
                            StepRow("2", "Copy Project URL and Anon Key")
                            StepRow("3", "Enter them manually below or scan a QR")
                            StepRow("4", "Start the gateway service")
                        }
                    }

                    Spacer(Modifier.height(24.dp))

                    Button(
                        onClick = {
                            if (hasCameraPermission) state = ConnectState.SCANNING
                            else permissionLauncher.launch(Manifest.permission.CAMERA)
                        },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.accent),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = OpenSMSColors.bg, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(10.dp))
                        Text("Scan QR Code", color = OpenSMSColors.bg, style = MaterialTheme.typography.titleMedium)
                    }

                    Spacer(Modifier.height(16.dp))

                    TextButton(onClick = { showManual = !showManual }) {
                        Icon(
                            if (showManual) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null,
                            tint = OpenSMSColors.muted,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (showManual) "Hide manual entry" else "Enter manually",
                            color = OpenSMSColors.muted,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }

                    AnimatedVisibility(visible = showManual) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(OpenSMSColors.surface, RoundedCornerShape(12.dp))
                                .border(1.dp, OpenSMSColors.border, RoundedCornerShape(12.dp))
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text("Manual Connection", style = MaterialTheme.typography.titleSmall, color = OpenSMSColors.accent)

                            OutlinedTextField(
                                value = manualUrl,
                                onValueChange = { manualUrl = it },
                                label = { Text("Supabase Project URL") },
                                placeholder = { Text("https://your-project.supabase.co") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                colors = connectTextFieldColors(),
                            )

                            OutlinedTextField(
                                value = manualKey,
                                onValueChange = { manualKey = it },
                                label = { Text("API Key") },
                                placeholder = { Text("Printed in your terminal") },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                                colors = connectTextFieldColors(),
                            )

                            Button(
                                onClick = ::handleManualConnect,
                                enabled = manualUrl.isNotBlank() && manualKey.isNotBlank(),
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.indigo),
                                shape = RoundedCornerShape(10.dp),
                            ) {
                                Text("Connect", style = MaterialTheme.typography.titleSmall)
                            }
                        }
                    }

                    Spacer(Modifier.height(48.dp))
                }
            }
        }
    }
}

@Composable
private fun StepRow(num: String, text: String) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
>>>>>>> Stashed changes
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(OpenSMSColors.accentDim)
                .align(Alignment.CenterHorizontally),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Default.Sms,
                contentDescription = null,
                tint = OpenSMSColors.accent,
                modifier = Modifier.size(44.dp),
            )
        }

        Spacer(Modifier.height(20.dp))

        Text(
            "OpenSMS",
            style = MaterialTheme.typography.headlineLarge,
            color = OpenSMSColors.text,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        Text(
            "Supabase-powered SMS gateway",
            style = MaterialTheme.typography.bodyMedium,
            color = OpenSMSColors.muted,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .padding(top = 4.dp, bottom = 32.dp),
            textAlign = TextAlign.Center,
        )

        Text(
            "Connect to Supabase",
            style = MaterialTheme.typography.titleMedium,
            color = OpenSMSColors.text,
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = supabaseUrl,
            onValueChange = { supabaseUrl = it; errorMsg = null },
            label = { Text("Project URL") },
            placeholder = { Text("https://xxxx.supabase.co") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.Link, contentDescription = null, tint = OpenSMSColors.muted) },
            colors = connectFieldColors(),
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = anonKey,
            onValueChange = { anonKey = it; errorMsg = null },
            label = { Text("Anon Key") },
            placeholder = { Text("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { showKey = !showKey }) {
                    Icon(
                        if (showKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (showKey) "Hide" else "Show",
                        tint = OpenSMSColors.muted,
                    )
                }
            },
            colors = connectFieldColors(),
        )

        Spacer(Modifier.height(12.dp))

        OutlinedButton(
            onClick = {
                if (hasCameraPermission) showCamera = true
                else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = OpenSMSColors.accent),
        ) {
            Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Scan QR instead")
        }

        Spacer(Modifier.weight(1f))
        Spacer(Modifier.height(16.dp))

        AnimatedVisibility(visible = errorMsg != null) {
            Surface(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                shape = RoundedCornerShape(10.dp),
                color = OpenSMSColors.redDim,
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = OpenSMSColors.red, modifier = Modifier.size(18.dp))
                    Text(errorMsg ?: "", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.red)
                }
            }
        }

        Button(
            onClick = { doConnect() },
            enabled = supabaseUrl.isNotBlank() && anonKey.isNotBlank() && !isConnecting,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.accent),
            shape = RoundedCornerShape(12.dp),
        ) {
            if (isConnecting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = OpenSMSColors.bg,
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(10.dp))
            } else {
                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = OpenSMSColors.bg, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(
                if (isConnecting) "Starting…" else "Start Gateway",
                color = OpenSMSColors.bg,
                style = MaterialTheme.typography.titleMedium,
            )
        }

        Spacer(Modifier.height(16.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            color = OpenSMSColors.surface,
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("How to connect", style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.accent)
                Text(
                    "1. Create an sms_jobs table in your Supabase project\n" +
                    "2. Enable Realtime on the table\n" +
                    "3. Paste your Project URL and Anon Key above\n" +
                    "4. Tap Start Gateway — then INSERT rows to send SMS",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.muted,
                )
            }
        }
    }
}

private fun requestBatteryOptimizationExclusion(context: Context) {
    try {
        val pm = context.getSystemService(PowerManager::class.java)
        if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            context.startActivity(intent)
        }
    } catch (_: Exception) {}
}

@Composable
private fun connectFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor   = OpenSMSColors.accent,
    unfocusedBorderColor = OpenSMSColors.border,
    focusedTextColor     = OpenSMSColors.text,
    unfocusedTextColor   = OpenSMSColors.text,
    cursorColor          = OpenSMSColors.accent,
    focusedLabelColor    = OpenSMSColors.accent,
    unfocusedLabelColor  = OpenSMSColors.muted,
)
