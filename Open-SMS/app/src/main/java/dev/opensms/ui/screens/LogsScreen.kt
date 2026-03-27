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
import dev.opensms.state.MessageRecord
import dev.opensms.state.MessageStatus
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.theme.statusColor
import dev.opensms.ui.viewmodel.MainViewModel
import java.text.SimpleDateFormat
import java.util.*

private val FILTER_TABS = listOf("All", "Delivered", "Sent", "Failed", "Pending")

@Composable
fun LogsScreen(navController: NavController, vm: MainViewModel = hiltViewModel()) {
    var selectedFilter by remember { mutableStateOf("All") }
    var selectedRecord by remember { mutableStateOf<MessageRecord?>(null) }
    var showClearConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val filtered = vm.allMessages.filter { record ->
        when (selectedFilter) {
            "Delivered" -> record.status == MessageStatus.DELIVERED
            "Sent" -> record.status == MessageStatus.SENT
            "Failed" -> record.status == MessageStatus.FAILED
            "Pending" -> record.status == MessageStatus.QUEUED || record.status == MessageStatus.PROCESSING
            else -> true
        }
    }

    if (selectedRecord != null) {
        MessageDetailDialog(record = selectedRecord!!, onDismiss = { selectedRecord = null })
    }

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            title = { Text("Clear All Logs") },
            text = { Text("This will delete all ${vm.allMessages.size} log entries from memory.") },
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
        // Top bar
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { navController.popBackStack() }) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = OpenSMSColors.muted)
            }
            Text("Logs", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            Text(
                "${vm.allMessages.size} entries",
                style = MaterialTheme.typography.bodyMedium,
                color = OpenSMSColors.muted,
            )
            IconButton(onClick = { vm.exportLogs(context) }) {
                Icon(Icons.Default.Share, contentDescription = "Export CSV", tint = OpenSMSColors.indigo)
            }
            IconButton(onClick = { showClearConfirm = true }) {
                Icon(Icons.Default.Delete, contentDescription = "Clear logs", tint = OpenSMSColors.muted)
            }
        }

        // Filter pills
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            FILTER_TABS.forEach { tab ->
                FilterChip(
                    selected = tab == selectedFilter,
                    onClick = { selectedFilter = tab },
                    label = { Text(tab, style = MaterialTheme.typography.bodyMedium) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = OpenSMSColors.accentDim,
                        selectedLabelColor = OpenSMSColors.accent,
                    ),
                )
            }
        }

        if (filtered.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("No messages", style = MaterialTheme.typography.bodyMedium)
                    if (selectedFilter != "All") {
                        TextButton(onClick = { selectedFilter = "All" }) {
                            Text("Show all", color = OpenSMSColors.accent)
                        }
                    }
                }
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(filtered, key = { it.messageId }) { record ->
                    LogRow(record = record, onClick = { selectedRecord = record })
                }
            }
        }
    }
}

@Composable
private fun LogRow(record: MessageRecord, onClick: () -> Unit) {
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
            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(statusColor(record.status.name)))
            Column(modifier = Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(record.toMasked, style = MaterialTheme.typography.bodyMedium)
                    record.templateName?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = OpenSMSColors.indigo,
                        )
                    }
                }
                Text(
                    record.body.take(55) + if (record.body.length > 55) "…" else "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = OpenSMSColors.muted2,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(formatTimestamp(record.enqueuedAt), style = MaterialTheme.typography.labelSmall)
                Text(
                    record.status.name.lowercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor(record.status.name),
                )
            }
        }
    }
}

@Composable
private fun MessageDetailDialog(record: MessageRecord, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Message Detail") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                DetailRow("To (full)", record.to)
                DetailRow("Status", record.status.name.lowercase())
                record.templateName?.let { DetailRow("Template", it) }
                DetailRow("Body", record.body)
                DetailRow("Queued", formatTimestamp(record.enqueuedAt))
                record.sentAt?.let { DetailRow("Sent", formatTimestamp(it)) }
                record.deliveredAt?.let { DetailRow("Delivered", formatTimestamp(it)) }
                record.errorReason?.let { DetailRow("Error", it) }
                DetailRow("Message ID", record.messageId)
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
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

private fun formatTimestamp(millis: Long): String =
    SimpleDateFormat("MMM d, HH:mm:ss", Locale.getDefault()).format(Date(millis))
