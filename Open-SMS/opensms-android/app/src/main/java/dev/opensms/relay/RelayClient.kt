package dev.opensms.relay

import dev.opensms.data.model.SmsJobDto
import io.github.jan.tennert.supabase.SupabaseClient
import io.github.jan.tennert.supabase.createSupabaseClient
import io.github.jan.tennert.supabase.postgrest.Postgrest
import io.github.jan.tennert.supabase.realtime.PostgresAction
import io.github.jan.tennert.supabase.realtime.Realtime
import io.github.jan.tennert.supabase.realtime.RealtimeChannel
import io.github.jan.tennert.supabase.realtime.channel
import io.github.jan.tennert.supabase.realtime.decodeRecord
import io.github.jan.tennert.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

class RelayClient(
    private var supabaseUrl: String,
    private var anonKey: String,
    private val onJob: (SmsJobDto) -> Unit,
    private val onStatus: (ConnectionStatus) -> Unit,
) {
    private var supabaseClient: SupabaseClient = createClient()
    private var channel: RealtimeChannel? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var reconnectDelay = 2000L

    val client: SupabaseClient get() = supabaseClient

    private fun createClient(): SupabaseClient = createSupabaseClient(
        supabaseUrl = supabaseUrl,
        supabaseKey = anonKey,
    ) {
        install(Realtime)
        install(Postgrest)
    }

    suspend fun connect() {
        try {
            onStatus(ConnectionStatus.CONNECTING)

            supabaseClient.realtime.connect()

            val ch = supabaseClient.channel("sms-gateway-${UUID.randomUUID()}")
            channel = ch

            val insertFlow = ch.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
                table = "sms_jobs"
            }

            ch.subscribe()

            onStatus(ConnectionStatus.CONNECTED)
            reconnectDelay = 2000L

            scope.launch {
                ch.status.collect { status ->
                    when (status) {
                        RealtimeChannel.Status.SUBSCRIBED -> onStatus(ConnectionStatus.CONNECTED)
                        RealtimeChannel.Status.UNSUBSCRIBED,
                        RealtimeChannel.Status.CHANNEL_ERROR -> scheduleReconnect()
                        else -> {}
                    }
                }
            }

            scope.launch {
                insertFlow.collect { action ->
                    try {
                        onJob(action.decodeRecord<SmsJobDto>())
                    } catch (e: Exception) {
                        // Malformed payload — log and continue
                    }
                }
            }

        } catch (e: Exception) {
            onStatus(ConnectionStatus.DISCONNECTED)
            scheduleReconnect()
        }
    }

    fun disconnect() {
        scope.launch {
            try {
                channel?.unsubscribe()
                supabaseClient.realtime.disconnect()
            } catch (_: Exception) {}
        }
    }

    suspend fun reconnectWithNewCredentials(newUrl: String, newKey: String) {
        disconnect()
        supabaseUrl = newUrl
        anonKey = newKey
        supabaseClient = createClient()
        channel = null
        delay(500)
        connect()
    }

    fun reconnect() {
        scope.launch { connect() }
    }

    private fun scheduleReconnect() {
        onStatus(ConnectionStatus.RECONNECTING)
        scope.launch {
            delay(reconnectDelay)
            reconnectDelay = minOf(reconnectDelay * 2, 60_000L)
            connect()
        }
    }
}
