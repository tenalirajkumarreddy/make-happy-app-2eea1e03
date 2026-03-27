package dev.opensms.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import dev.opensms.templates.Template
import dev.opensms.ui.theme.OpenSMSColors
import dev.opensms.ui.viewmodel.MainViewModel

@Composable
fun TemplatesScreen(navController: NavController, vm: MainViewModel = hiltViewModel()) {
    var showCreate by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Template?>(null) }

    if (showCreate || editing != null) {
        TemplateEditDialog(
            template = editing,
            onSave = { name, body ->
                vm.saveTemplate(Template(name, body))
                showCreate = false
                editing = null
            },
            onDismiss = { showCreate = false; editing = null },
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
            Text("Templates", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = { showCreate = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add template", tint = OpenSMSColors.accent)
            }
        }

        Spacer(Modifier.height(8.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(vm.templates) { template ->
                TemplateCard(
                    template = template,
                    onEdit = { editing = template },
                    onDelete = { vm.deleteTemplate(template.name) },
                )
            }
        }
    }
}

@Composable
private fun TemplateCard(template: Template, onEdit: () -> Unit, onDelete: () -> Unit) {
    var confirmDelete by remember { mutableStateOf(false) }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete Template") },
            text = { Text("Delete '${template.name}'? This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = { onDelete(); confirmDelete = false }) {
                    Text("Delete", color = OpenSMSColors.red)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
            containerColor = OpenSMSColors.surface,
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth().clickable { onEdit() },
        shape = RoundedCornerShape(10.dp),
        color = OpenSMSColors.surface,
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(template.name, style = MaterialTheme.typography.titleMedium, color = OpenSMSColors.accent, modifier = Modifier.weight(1f))
                IconButton(onClick = { confirmDelete = true }, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = OpenSMSColors.muted, modifier = Modifier.size(16.dp))
                }
            }
            Text(
                template.body.take(100) + if (template.body.length > 100) "…" else "",
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                template.vars.forEach { v ->
                    Text(
                        "{{$v}}",
                        style = MaterialTheme.typography.labelSmall,
                        color = OpenSMSColors.indigo,
                        modifier = Modifier
                            .background(OpenSMSColors.indigoDim, RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun TemplateEditDialog(template: Template?, onSave: (String, String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(template?.name ?: "") }
    var body by remember { mutableStateOf(template?.body ?: "") }
    val isEdit = template != null

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isEdit) "Edit Template" else "New Template") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { if (!isEdit) name = it },
                    label = { Text("Name (e.g. otp)") },
                    enabled = !isEdit,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("Body (use {{var}} for variables)") },
                    modifier = Modifier.fillMaxWidth().height(120.dp),
                    maxLines = 6,
                )
                if (body.isNotBlank()) {
                    val vars = Regex("""\{\{(\w+)\}\}""").findAll(body).map { it.groupValues[1] }.distinct().toList()
                    if (vars.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            vars.forEach { v ->
                                Text(
                                    "{{$v}}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = OpenSMSColors.indigo,
                                    modifier = Modifier
                                        .background(OpenSMSColors.indigoDim, RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { if (name.isNotBlank() && body.isNotBlank()) onSave(name.trim(), body.trim()) },
                colors = ButtonDefaults.buttonColors(containerColor = OpenSMSColors.accent),
            ) { Text("Save", color = OpenSMSColors.bg) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        containerColor = OpenSMSColors.surface,
    )
}
