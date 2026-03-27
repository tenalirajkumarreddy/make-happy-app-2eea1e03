package dev.opensms.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import dev.opensms.state.MessageRecord
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

object CsvExporter {

    private val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    fun buildCsvString(records: List<MessageRecord>): String {
        val sb = StringBuilder()
        sb.appendLine("message_id,to,to_masked,template,status,body,enqueued_at,sent_at,delivered_at,error")
        records.forEach { r ->
            sb.appendLine(
                listOf(
                    r.messageId,
                    r.to,
                    r.toMasked,
                    r.templateName ?: "",
                    r.status.name.lowercase(),
                    r.body.replace(",", ";").replace("\n", " "),
                    sdf.format(Date(r.enqueuedAt)),
                    r.sentAt?.let { sdf.format(Date(it)) } ?: "",
                    r.deliveredAt?.let { sdf.format(Date(it)) } ?: "",
                    r.errorReason ?: "",
                ).joinToString(",") { "\"$it\"" }
            )
        }
        return sb.toString()
    }

    fun shareAsCsv(context: Context, records: List<MessageRecord>) {
        val csv = buildCsvString(records)
        val filename = "opensms_logs_${System.currentTimeMillis()}.csv"
        val file = File(context.cacheDir, filename)
        file.writeText(csv)

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "OpenSMS Logs Export")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Export logs as CSV"))
    }
}
