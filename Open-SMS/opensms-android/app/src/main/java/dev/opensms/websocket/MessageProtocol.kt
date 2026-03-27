package dev.opensms.websocket

<<<<<<< Updated upstream
// Legacy file — superseded by Supabase Realtime payload types in dev.opensms.data.model
// Kept as a stub to satisfy any remaining references during build.
=======
import com.google.gson.Gson
import com.google.gson.JsonParser

/**
 * QR Payload for easy setup of the Android app with Supabase credentials.
 */
data class QRPayload(
    val supabaseUrl: String,
    val supabaseKey: String,
    val deviceName: String = "OpenSMS Gateway",
)

object MessageParser {
    private val gson = Gson()

    fun encode(obj: Any): String = gson.toJson(obj)

    fun parseQRPayload(text: String): QRPayload? =
        // v5 format: base64-encoded JSON with Supabase credentials
        runCatching {
            val decoded = String(android.util.Base64.decode(text.trim(), android.util.Base64.DEFAULT))
            val payload = gson.fromJson(decoded, QRPayload::class.java)
            if (payload.supabaseUrl.isNotBlank() && payload.supabaseKey.isNotBlank()) payload else null
        }.getOrNull()
        // Fallback: raw JSON
        ?: runCatching {
            val payload = gson.fromJson(text, QRPayload::class.java)
            if (payload.supabaseUrl.isNotBlank() && payload.supabaseKey.isNotBlank()) payload else null
        }.getOrNull()
}
>>>>>>> Stashed changes
