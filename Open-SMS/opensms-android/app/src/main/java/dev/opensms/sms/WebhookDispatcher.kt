package dev.opensms.sms

import dev.opensms.state.MessageRecord
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebhookDispatcher @Inject constructor() {

    private val scope = CoroutineScope(Dispatchers.IO)

    fun dispatch(record: MessageRecord, webhookUrl: String, status: String) {
        if (webhookUrl.isBlank()) return
        scope.launch {
            try {
                val payload = JSONObject().apply {
                    put("message_id", record.messageId)
                    put("to", record.to)
                    put("status", status)
                    put("sent_at", record.sentAt?.let { java.util.Date(it).toString() })
                    put("delivered_at", record.deliveredAt?.let { java.util.Date(it).toString() })
                    put("error", record.errorReason)
                }.toString()

                val url = URL(webhookUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.outputStream.use { it.write(payload.toByteArray()) }
                conn.responseCode // trigger the request
                conn.disconnect()
            } catch (_: Exception) {
                // Fire-and-forget — webhook failure is non-fatal
            }
        }
    }
}
