package dev.opensms.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import dev.opensms.data.model.SmsJobRecord
import dev.opensms.relay.ConnectionStatus
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.theme.statusColor
import dev.opensms.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DashboardScreen(navController: NavController, vm: MainViewModel = hiltViewModel()) {

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(OpenSMSColors.bg)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NavChip("Templates", Icons.Default.Message) { navController.navigate("templates") }
                NavChip("Logs", Icons.Default.List) { navController.navigate("logs") }
                NavChip("Settings", Icons.Default.Settings) { navController.navigate("settings") }
            }
        }

        item { ConnectionCard(vm = vm) }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatCard("Sent Today", vm.stats.sentToday.toString(), OpenSMSColors.accent, Modifier.weight(1f))
                StatCard("This Week", vm.stats.sentWeek.toString(), OpenSMSColors.indigo, Modifier.weight(1f))
                StatCard("Failed", vm.stats.failed.toString(), OpenSMSColors.red, Modifier.weight(1f))
            }
        }

        item {
            Text(
                "Recent Jobs",
                style = MaterialTheme.typography.titleMedium,
                color = OpenSMSColors.text,
            )
        }

        if (vm.recentMessages.isEmpty()) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().height(72.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "No jobs yet — insert a row into sms_jobs to send an SMS",
                        style = MaterialTheme.typography.bodyMedium,
                        color = OpenSMSColors.muted,
                    )
                }
            }
        } else {
            items(vm.recentMessages) { record -> JobRow(record) }
        }
    }
}

@Composable
private fun ConnectionCard(vm: MainViewModel) {
    val status  = vm.connectionStatus
    val paused  = vm.isPaused
    val running = vm.isServiceRunning

    val dotColor = when {
        !running -> OpenSMSColors.muted
        paused   -> OpenSMSColors.orange
        status == ConnectionStatus.CONNECTED    -> OpenSMSColors.accent
        status == ConnectionStatus.RECONNECTING -> OpenSMSColors.orange
        else     -> OpenSMSColors.red
    }

    val pulse = rememberInfiniteTransition(label = "pulse")
    val dotScale by pulse.animateFloat(
        initialValue = 1f,
        targetValue  = if (status == ConnectionStatus.CONNECTED && running && !paused) 1.4f else 1f,
        animationSpec = infiniteRepeatable(
            animation  = tween(800, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dotScale",
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = OpenSMSColors.surface,
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .scale(dotScale)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        when {
                            !running -> "Gateway Stopped"
                            paused   -> "Gateway Paused"
                            status == ConnectionStatus.CONNECTED    -> "Connected"
                            status == ConnectionStatus.RECONNECTING -> "Reconnecting…"
                            status == ConnectionStatus.CONNECTING   -> "Connecting…"
                            else     -> "Disconnected"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = OpenSMSColors.text,
                    )
                    val domain = vm.supabaseDomain
                    if (domain.isNotBlank()) {
                        Text(domain, style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
                    }
                }
                Switch(
                    checked = running,
                    onCheckedChange = { if (it) vm.startGateway() else vm.stopGateway() },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = OpenSMSColors.bg,
                        checkedTrackColor = OpenSMSColors.accent,
                    ),
                )
            }

            if (running) {
                OutlinedButton(
                    onClick = { vm.togglePause() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = if (paused) OpenSMSColors.accent else OpenSMSColors.orange,
                    ),
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Icon(
                        if (paused) Icons.Default.PlayArrow else Icons.Default.Pause,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(if (paused) "Resume" else "Pause")
                }
            }
        }
    }
}

@Composable
private fun StatCard(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color,
    modifier: Modifier,
) {
    Surface(modifier = modifier, shape = RoundedCornerShape(10.dp), color = OpenSMSColors.surface) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, color = color)
            Text(label, style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
        }
    }
}

@Composable
private fun JobRow(record: SmsJobRecord) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = OpenSMSColors.surface,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(statusColor(record.status)))
            Column(modifier = Modifier.weight(1f)) {
                Text(maskPhone(record.job.toPhone), style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.text)
                Text(
                    record.job.body.take(60) + if (record.job.body.length > 60) "…" else "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.muted2,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(formatTime(record.timestamp), style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.muted)
                Text(record.status, style = MaterialTheme.typography.labelSmall, color = statusColor(record.status))
            }
        }
    }
}

@Composable
private fun NavChip(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.height(38.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = OpenSMSColors.text),
        shape = RoundedCornerShape(8.dp),
    ) {
        Icon(icon, contentDescription = null, tint = OpenSMSColors.muted, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun maskPhone(phone: String): String {
    if (phone.length <= 4) return phone
    return phone.dropLast(4).replace(Regex("\\d"), "*") + phone.takeLast(4)
}

private fun formatTime(millis: Long): String =
    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(millis))
