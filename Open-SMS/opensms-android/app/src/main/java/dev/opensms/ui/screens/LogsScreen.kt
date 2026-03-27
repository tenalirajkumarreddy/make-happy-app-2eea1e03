package dev.opensms.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import dev.opensms.data.model.SmsJobRecord
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.theme.statusColor
import dev.opensms.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.*

private val FILTER_TABS = listOf("All", "Delivered", "Sent", "Failed", "Pending")

@Composable
fun LogsScreen(navController: NavController, vm: MainViewModel = hiltViewModel()) {
    var selectedFilter by remember { mutableStateOf("All") }
    var selectedRecord by remember { mutableStateOf<SmsJobRecord?>(null) }
    var showClearConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val filtered = vm.allMessages.filter { record ->
        when (selectedFilter) {
            "Delivered" -> record.status == "delivered"
            "Sent"      -> record.status == "sent"
            "Failed"    -> record.status == "failed"
            "Pending"   -> record.status == "pending" || record.status == "processing"
            else        -> true
        }
    }

    if (selectedRecord != null) {
        JobDetailDialog(record = selectedRecord!!, onDismiss = { selectedRecord = null })
    }

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            title = { Text("Clear All Logs") },
            text  = { Text("This will delete all ${vm.allMessages.size} log entries from memory.") },
            confirmButton = {
                TextButton(onClick = { vm.clearLogs(); showClearConfirm = false }) {
                    Text("Clear", color = OpenSMSColors.red)
                }
            },
            dismissButton = { TextButton(onClick = { showClearConfirm = false }) { Text("Cancel") } },
            containerColor = OpenSMSColors.surface,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OpenSMSColors.bg)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { navController.popBackStack() }) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = OpenSMSColors.muted)
            }
            Text("Logs", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f), color = OpenSMSColors.text)
            Text(
                "${vm.allMessages.size} entries",
                style = MaterialTheme.typography.bodyMedium,
                color = OpenSMSColors.muted,
            )
            IconButton(onClick = { vm.exportLogs(context) }) {
                Icon(Icons.Default.Share, contentDescription = "Export", tint = OpenSMSColors.indigo)
            }
            IconButton(onClick = { showClearConfirm = true }) {
                Icon(Icons.Default.Delete, contentDescription = "Clear", tint = OpenSMSColors.muted)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            FILTER_TABS.forEach { tab ->
                FilterChip(
                    selected = tab == selectedFilter,
                    onClick  = { selectedFilter = tab },
                    label    = { Text(tab, style = MaterialTheme.typography.bodyMedium) },
                    colors   = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = OpenSMSColors.accentDim,
                        selectedLabelColor     = OpenSMSColors.accent,
                    ),
                )
            }
        }

        if (filtered.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("No messages", style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.muted)
                    if (selectedFilter != "All") {
                        TextButton(onClick = { selectedFilter = "All" }) {
                            Text("Show all", color = OpenSMSColors.accent)
                        }
                    }
                }
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(filtered, key = { it.job.id }) { record ->
                    LogRow(record = record, onClick = { selectedRecord = record })
                }
            }
        }
    }
}

@Composable
private fun LogRow(record: SmsJobRecord, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
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
                Text(maskPhoneLog(record.job.toPhone), style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.text)
                Text(
                    record.job.body.take(55) + if (record.job.body.length > 55) "…" else "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.muted2,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(formatLogTimestamp(record.timestamp), style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.muted)
                Text(record.status, style = MaterialTheme.typography.labelSmall, color = statusColor(record.status))
            }
        }
    }
}

@Composable
private fun JobDetailDialog(record: SmsJobRecord, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Job Detail") },
        text  = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                DetailRow("ID", record.job.id)
                DetailRow("To", record.job.toPhone)
                DetailRow("Status", record.status)
                DetailRow("Body", record.job.body)
                DetailRow("Timestamp", formatLogTimestamp(record.timestamp))
                record.error?.let { DetailRow("Error", it) }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        containerColor = OpenSMSColors.surface,
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = OpenSMSColors.muted)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = OpenSMSColors.text)
    }
}

private fun maskPhoneLog(phone: String): String {
    if (phone.length <= 4) return phone
    return phone.dropLast(4).replace(Regex("\\d"), "*") + phone.takeLast(4)
}

private fun formatLogTimestamp(millis: Long): String =
    SimpleDateFormat("MMM d, HH:mm:ss", Locale.getDefault()).format(Date(millis))
