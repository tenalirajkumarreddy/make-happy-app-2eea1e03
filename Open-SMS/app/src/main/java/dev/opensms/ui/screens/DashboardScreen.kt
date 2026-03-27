package dev.opensms.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import dev.opensms.state.MessageRecord
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.theme.statusColor
import dev.opensms.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DashboardScreen(navController: NavController, vm: MainViewModel = hiltViewModel()) {
    val clipboard = LocalClipboardManager.current
    val url = "http://${vm.localIpAddress}:${vm.prefs.port}"

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(OpenSMSColors.bg)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Nav bar
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

        // Status card
        item {
            StatusCard(vm = vm, url = url, clipboard = clipboard)
        }

        // Stats row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatCard("Sent Today", vm.sentToday.toString(), OpenSMSColors.accent, Modifier.weight(1f))
                StatCard("This Week", vm.sentThisWeek.toString(), OpenSMSColors.indigo, Modifier.weight(1f))
                StatCard("Failed", vm.failedTotal.toString(), OpenSMSColors.red, Modifier.weight(1f))
            }
        }

        // Queue status card
        item {
            QueueStatusCard(vm = vm)
        }

        // Recent messages header
        item {
            Text("Recent Messages", style = MaterialTheme.typography.titleMedium, color = OpenSMSColors.text)
        }

        if (vm.recentMessages.isEmpty()) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().height(72.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("No messages yet", style = MaterialTheme.typography.bodyMedium)
                }
            }
        } else {
            items(vm.recentMessages) { record -> MessageRow(record) }
        }
    }
}

@Composable
private fun StatusCard(
    vm: MainViewModel,
    url: String,
    clipboard: LocalClipboardManager,
) {
    val running = vm.isServiceRunning
    val paused = vm.isPaused

    // Pulsing dot animation
    val pulse = rememberInfiniteTransition(label = "pulse")
    val dotScale by pulse.animateFloat(
        initialValue = 1f,
        targetValue = if (running && !paused) 1.4f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = EaseInOut),
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
            // Running / stopped row
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .scale(if (running) dotScale else 1f)
                        .clip(CircleShape)
                        .background(
                            when {
                                !running -> OpenSMSColors.red
                                paused -> OpenSMSColors.orange
                                else -> OpenSMSColors.accent
                            }
                        )
                )
                Text(
                    when {
                        !running -> "Gateway Stopped"
                        paused -> "Gateway Paused"
                        else -> "Gateway Running"
                    },
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.weight(1f))
                Switch(
                    checked = running,
                    onCheckedChange = { if (it) vm.startGateway() else vm.stopGateway() },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = OpenSMSColors.bg,
                        checkedTrackColor = OpenSMSColors.accent,
                    ),
                )
            }

            // URL row
            if (running) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(OpenSMSColors.surface2, RoundedCornerShape(6.dp))
                        .border(1.dp, OpenSMSColors.border, RoundedCornerShape(6.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(url, style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.accent)
                    IconButton(onClick = { clipboard.setText(AnnotatedString(url)) }, modifier = Modifier.size(24.dp)) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = OpenSMSColors.muted, modifier = Modifier.size(16.dp))
                    }
                }

                // Pause / Resume row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = { vm.togglePause() },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = if (paused) OpenSMSColors.accent else OpenSMSColors.orange,
                        ),
                        border = ButtonDefaults.outlinedButtonBorder(enabled = true),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Icon(
                            if (paused) Icons.Default.PlayArrow else Icons.Default.Pause,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(if (paused) "Resume Queue" else "Pause Queue")
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueStatusCard(vm: MainViewModel) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = OpenSMSColors.surface,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Icon(Icons.Default.List, contentDescription = null, tint = OpenSMSColors.muted, modifier = Modifier.size(18.dp))
            Text("Queue", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
            Spacer(Modifier.weight(1f))
            QueueBadge(label = "Pending", count = vm.queueDepth, color = OpenSMSColors.orange)
        }
    }
}

@Composable
private fun QueueBadge(label: String, count: Int, color: androidx.compose.ui.graphics.Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(count.toString(), style = MaterialTheme.typography.titleMedium, color = color)
        Text(label, style = MaterialTheme.typography.bodyMedium)
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
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun MessageRow(record: MessageRecord) {
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
            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(statusColor(record.status.name)))
            Column(modifier = Modifier.weight(1f)) {
                Text(record.toMasked, style = MaterialTheme.typography.bodyMedium)
                Text(
                    record.body.take(60) + if (record.body.length > 60) "…" else "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.muted2,
                )
            }
            Text(formatTime(record.enqueuedAt), style = MaterialTheme.typography.labelSmall)
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

private fun formatTime(millis: Long): String =
    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(millis))
