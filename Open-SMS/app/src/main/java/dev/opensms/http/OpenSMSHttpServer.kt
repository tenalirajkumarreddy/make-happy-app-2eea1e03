package dev.opensms.http

import dev.opensms.queue.SmsJob
import dev.opensms.service.SmsGatewayService
import dev.opensms.state.MessageLog
import dev.opensms.state.StatsCounter
import dev.opensms.templates.MissingVariableException
import dev.opensms.templates.TemplateEngine
import dev.opensms.templates.TemplateRepository
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.trySendBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class OpenSMSHttpServer(
    port: Int,
    private val messageChannel: Channel<SmsJob>,
    private val apiKey: String,
    private val templateRepo: TemplateRepository,
    private val messageLog: MessageLog,
    private val stats: StatsCounter,
    private val serviceStartTime: Long,
    private val ipAllowlistProvider: () -> String = { "" },
) : NanoHTTPD(port) {

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri.trimEnd('/')
        val method = session.method

        return try {
            // Health endpoint — no auth required
            if (uri == "/health" && method == Method.GET) {
                return handleHealth()
            }

            // IP allowlist check (applied before auth)
            val allowlist = ipAllowlistProvider()
            if (allowlist.isNotBlank()) {
                val remoteIp = session.headers["http-client-ip"]
                    ?: session.headers["x-forwarded-for"]
                    ?: session.headers["remote-addr"]
                    ?: ""
                val allowed = allowlist.split(",").map { it.trim() }.filter { it.isNotBlank() }
                if (allowed.isNotEmpty() && !allowed.contains(remoteIp)) {
                    return errorResponse(403, "ip_not_allowed", "Your IP $remoteIp is not in the allowlist")
                }
            }

            // Bearer auth check
            val authHeader = session.headers["authorization"] ?: ""
            if (!authHeader.equals("Bearer $apiKey", ignoreCase = false)) {
                return errorResponse(401, "invalid_api_key", "Invalid or missing API key")
            }

            when {
                uri == "/send" && method == Method.POST -> handleSend(session)
                uri.startsWith("/status/") && method == Method.GET -> {
                    handleStatus(uri.removePrefix("/status/"))
                }
                uri == "/templates" && method == Method.GET -> handleTemplates()
                uri == "/pause" && method == Method.POST -> handlePause(session)
                else -> errorResponse(404, "not_found", "Endpoint not found")
            }
        } catch (e: Exception) {
            errorResponse(500, "internal_error", e.message ?: "Internal error")
        }
    }

    private fun handleHealth(): Response {
        val uptimeSeconds = (System.currentTimeMillis() - serviceStartTime) / 1000
        val json = JSONObject().apply {
            put("status", "ok")
            put("uptime_seconds", uptimeSeconds)
            put("queue_depth", SmsGatewayService.queueDepth.get())
            put("sms_sent_today", stats.sentToday())
            put("paused", SmsGatewayService.isPaused)
            put("version", "1.0.0")
        }
        return newFixedLengthResponse(Response.Status.OK, MIME_JSON, json.toString())
    }

    private fun handleSend(session: IHTTPSession): Response {
        val body = parseBody(session)

        val to = body.optString("to").takeIf { it.isNotBlank() }
            ?: return errorResponse(400, "invalid_number", "Missing 'to' field")

        if (!to.matches(Regex("^\\+[1-9]\\d{6,14}$"))) {
            return errorResponse(400, "invalid_number", "Number must be in E.164 format (+countrycode...)")
        }

        val templateName = body.optString("template").takeIf { it.isNotBlank() }
        val rawBody = body.optString("body").takeIf { it.isNotBlank() }
        val callbackUrl = body.optString("callback_url").takeIf { it.isNotBlank() }

        val renderedBody: String = when {
            templateName != null -> {
                val tmpl = templateRepo.get(templateName)
                    ?: return errorResponse(400, "template_not_found", "Unknown template: $templateName")
                val vars = body.optJSONObject("vars")?.let { jsonObj ->
                    jsonObj.keys().asSequence().associateWith { key -> jsonObj.optString(key) }
                } ?: emptyMap()
                try {
                    TemplateEngine.render(tmpl.body, vars)
                } catch (e: MissingVariableException) {
                    return errorResponse(400, "missing_variable", "Missing vars: ${e.variables.joinToString()}")
                }
            }
            rawBody != null -> rawBody
            else -> return errorResponse(400, "missing_body", "Provide 'template' or 'body'")
        }

        if (renderedBody.length > 640) {
            return errorResponse(400, "body_too_long", "Rendered body exceeds 640 characters")
        }

        if (SmsGatewayService.isPaused) {
            return errorResponse(503, "gateway_paused", "Gateway is paused — resume it in the app")
        }

        val messageId = "msg_" + generateId()
        val job = SmsJob(
            messageId = messageId,
            to = to,
            body = renderedBody,
            templateName = templateName,
            webhookUrl = callbackUrl,
        )

        val sendResult = messageChannel.trySendBlocking(job)
        if (sendResult.isFailure) {
            return errorResponse(503, "queue_full", "Message queue is full (1000 cap) — retry later")
        }

        SmsGatewayService.queueDepth.incrementAndGet()

        val responseJson = JSONObject().apply {
            put("message_id", messageId)
            put("status", "queued")
            put("queued_at", isoNow())
        }
        return newFixedLengthResponse(Response.Status.ACCEPTED, MIME_JSON, responseJson.toString())
    }

    private fun handleStatus(messageId: String): Response {
        val record = messageLog.find(messageId)
            ?: return errorResponse(404, "not_found", "Message $messageId not found")
        val json = JSONObject().apply {
            put("message_id", record.messageId)
            put("to", record.toMasked)
            put("template", record.templateName)
            put("status", record.status.name.lowercase())
            put("sent_at", record.sentAt?.let { isoTimestamp(it) })
            put("delivered_at", record.deliveredAt?.let { isoTimestamp(it) })
            put("error", record.errorReason)
        }
        return newFixedLengthResponse(Response.Status.OK, MIME_JSON, json.toString())
    }

    private fun handleTemplates(): Response {
        val templates = templateRepo.getAll()
        val arr = JSONArray()
        templates.forEach { tmpl ->
            arr.put(JSONObject().apply {
                put("name", tmpl.name)
                put("body", tmpl.body)
                put("vars", JSONArray(tmpl.vars))
            })
        }
        return newFixedLengthResponse(Response.Status.OK, MIME_JSON, JSONObject().put("templates", arr).toString())
    }

    private fun handlePause(session: IHTTPSession): Response {
        val body = parseBody(session)
        SmsGatewayService.isPaused = body.optBoolean("paused", SmsGatewayService.isPaused)
        val json = JSONObject().put("paused", SmsGatewayService.isPaused)
        return newFixedLengthResponse(Response.Status.OK, MIME_JSON, json.toString())
    }

    private fun parseBody(session: IHTTPSession): JSONObject {
        return try {
            val files = HashMap<String, String>()
            session.parseBody(files)
            val postData = files["postData"] ?: ""
            if (postData.isBlank()) JSONObject() else JSONObject(postData)
        } catch (_: Exception) { JSONObject() }
    }

    private fun errorResponse(code: Int, errorKey: String, message: String): Response {
        val status = when (code) {
            400 -> Response.Status.BAD_REQUEST
            401 -> Response.Status.UNAUTHORIZED
            403 -> Response.Status.FORBIDDEN
            404 -> Response.Status.NOT_FOUND
            503 -> Response.Status.SERVICE_UNAVAILABLE
            else -> Response.Status.INTERNAL_ERROR
        }
        val json = JSONObject().apply { put("error", errorKey); put("message", message) }
        return newFixedLengthResponse(status, MIME_JSON, json.toString())
    }

    private fun generateId(): String =
        java.util.UUID.randomUUID().toString().replace("-", "").take(8)

    private fun isoNow(): String = isoTimestamp(System.currentTimeMillis())

    private fun isoTimestamp(millis: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(millis))
    }

    companion object {
        private const val MIME_JSON = "application/json"
    }
}
