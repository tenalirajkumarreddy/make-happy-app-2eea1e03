package dev.opensms.websocket

<<<<<<< Updated upstream
// Legacy file — superseded by dev.opensms.relay.RelayClient (Supabase Realtime)
// Kept as a stub to satisfy any remaining references during build.
=======
import android.util.Log
import dev.opensms.queue.SmsJob
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import java.util.concurrent.atomic.AtomicBoolean

enum class ConnectionStatus { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING }

class RelayClient(
    private val supabaseUrl: String,
    private val supabaseKey: String,
    private val deviceId: String,
    private val scope: CoroutineScope,
    val onJob: (SmsJob) -> Unit,
    val onStatusChanged: (ConnectionStatus) -> Unit,
) {
    private var client: SupabaseClient? = null
    private val isDestroyed = AtomicBoolean(false)
    private var connectionJob: Job? = null

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    fun connect() {
        if (isDestroyed.get()) return

        connectionJob?.cancel()
        connectionJob = scope.launch {
            connectInternal()
        }
    }

    private suspend fun connectInternal() {
        onStatusChanged(ConnectionStatus.CONNECTING)

        if (supabaseUrl.isBlank() || supabaseKey.isBlank()) {
            Log.w("RelayClient", "Credentials missing, not connecting.")
            onStatusChanged(ConnectionStatus.DISCONNECTED)
            return
        }

        try {
            // Close existing client if any
            client?.close()

            client = createSupabaseClient(supabaseUrl, supabaseKey) {
                install(Realtime)
                install(Postgrest)
                defaultSerializer = KotlinXSerializer(json)
            }
        } catch (e: Throwable) {
            Log.e("RelayClient", "Failed to create Supabase client", e)
            onStatusChanged(ConnectionStatus.DISCONNECTED)
            return
        }

        val supabase = client ?: return

        try {
            Log.d("RelayClient", "Connecting to Supabase Realtime...")
            supabase.realtime.connect()
            onStatusChanged(ConnectionStatus.CONNECTED)

            val channel = supabase.realtime.channel("sms-gateway")

            channel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                table = "sms_jobs"
            }.onEach { action ->
                try {
                    val job = json.decodeFromJsonElement<SmsJob>(action.record)
                    Log.i("RelayClient", "Received job: ${job.messageId}")
                    onJob(job)
                } catch (e: Exception) {
                    Log.e("RelayClient", "Failed to parse job", e)
                    val id = action.record["id"]?.toString()?.replace("\"", "")
                    if (id != null) sendStatus(id, "failed", "Parse error: ${e.message}")
                }
            }.launchIn(scope)

            channel.subscribe()
            Log.d("RelayClient", "Subscribed to sms_jobs changes")

        } catch (e: Exception) {
            Log.e("RelayClient", "Realtime connect failed", e)
            onStatusChanged(ConnectionStatus.DISCONNECTED)
            delay(5000)
            if (!isDestroyed.get()) connect()
        }
    }

    fun sendStatus(messageId: String, status: String, error: String? = null) {
        if (isDestroyed.get()) return

        scope.launch {
            try {
                client?.postgrest?.from("sms_jobs")?.update(
                    mapOf(
                        "status" to status,
                        "error_message" to error,
                        "updated_at" to java.time.Instant.now().toString()
                    )
                ) {
                    filter {
                        eq("id", messageId)
                    }
                }
            } catch (e: Exception) {
                Log.e("RelayClient", "Failed to update status for $messageId", e)
            }
        }
    }

    fun reconnectNow() {
        if (isDestroyed.get()) return
        connect()
    }

    fun destroy() {
        isDestroyed.set(true)
        connectionJob?.cancel()
        scope.launch {
            try {
                client?.realtime?.disconnect()
                client?.close()
            } catch (e: Exception) {}
        }
    }
}
>>>>>>> Stashed changes
