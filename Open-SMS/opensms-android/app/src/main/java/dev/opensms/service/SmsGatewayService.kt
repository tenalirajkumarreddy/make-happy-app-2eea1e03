package dev.opensms.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import dev.opensms.MainActivity
import dev.opensms.R
import dev.opensms.data.CircularBuffer
import dev.opensms.data.GatewayStats
import dev.opensms.data.StatsCounter
import dev.opensms.data.model.SmsJob
import dev.opensms.data.model.SmsJobDto
import dev.opensms.data.model.SmsJobRecord
import dev.opensms.prefs.AppPreferences
import dev.opensms.relay.ConnectionStatus
import dev.opensms.relay.RelayClient
import dev.opensms.sms.SmsSender
import dev.opensms.templates.TemplateEngine
import dev.opensms.templates.TemplateRepository
import io.github.jan.tennert.supabase.postgrest.from
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import javax.inject.Inject

@AndroidEntryPoint
class SmsGatewayService : Service() {

    @Inject lateinit var prefs: AppPreferences
    @Inject lateinit var smsSender: SmsSender
    @Inject lateinit var templateRepo: TemplateRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var relayClient: RelayClient

    private val messageLog = CircularBuffer<SmsJobRecord>(500)
    private val stats      = StatsCounter()

    companion object {
<<<<<<< Updated upstream
        const val ACTION_UPDATE_CREDENTIALS = "dev.opensms.UPDATE_CREDENTIALS"
        const val ACTION_STOP               = "dev.opensms.STOP"
        const val NOTIFICATION_ID           = 1001
        const val CHANNEL_ID                = "opensms_gateway"
=======
        const val NOTIF_ID   = 1001
        const val CHANNEL_ID = "opensms_gateway"
        const val ACTION_UPDATE_CREDENTIALS = "dev.opensms.ACTION_UPDATE_CREDENTIALS"
>>>>>>> Stashed changes

        val statusFlow     = MutableStateFlow(ConnectionStatus.DISCONNECTED)
        val recentJobsFlow = MutableStateFlow<List<SmsJobRecord>>(emptyList())
        val allJobsFlow    = MutableStateFlow<List<SmsJobRecord>>(emptyList())
        val statsFlow      = MutableStateFlow(GatewayStats())
        val serviceRunning = MutableStateFlow(false)

        @Volatile var isPaused = false
        var serviceStartTime   = 0L

        fun start(context: Context) {
            context.startForegroundService(Intent(context, SmsGatewayService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SmsGatewayService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceStartTime = System.currentTimeMillis()
        serviceRunning.value = true
        isPaused = false
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        initRelayClient()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
<<<<<<< Updated upstream
        when (intent?.action) {
            ACTION_UPDATE_CREDENTIALS -> {
                val url = intent.getStringExtra("supabase_url") ?: return START_STICKY
                val key = intent.getStringExtra("anon_key")     ?: return START_STICKY
                serviceScope.launch { relayClient.reconnectWithNewCredentials(url, key) }
            }
            ACTION_STOP -> stopSelf()
=======
        if (intent?.action == ACTION_UPDATE_CREDENTIALS) {
            backendDomain = prefs.backendDomain()
            startRelayClient()
            updateNotification()
>>>>>>> Stashed changes
        }
        return START_STICKY
    }

<<<<<<< Updated upstream
    private fun initRelayClient() {
        relayClient = RelayClient(
            supabaseUrl = prefs.supabaseUrl,
            anonKey     = prefs.anonKey,
            onJob       = { dto -> serviceScope.launch { processJob(dto) } },
            onStatus    = { status ->
                statusFlow.value = status
=======
    private fun startRelayClient() {
        if (this::relayClient.isInitialized) {
            relayClient.destroy()
        }
        relayClient = RelayClient(
            supabaseUrl     = prefs.supabaseUrl,
            supabaseKey     = prefs.supabaseKey,
            deviceId        = prefs.deviceId,
            scope           = scope,
            onJob           = { job ->
                queueDepth.incrementAndGet()
                jobChannel.trySend(job)
                updateNotification()
            },
            onStatusChanged = { status ->
                connectionStatus = status
>>>>>>> Stashed changes
                updateNotification()
            },
        )
        serviceScope.launch { relayClient.connect() }
    }

    private suspend fun processJob(dto: SmsJobDto) {
        if (isPaused) return

        val claimed = claimJob(dto.id) ?: return

        val body = when {
            claimed.templateName != null -> {
                val tmpl = templateRepo.get(claimed.templateName)
                    ?: run {
                        reportStatus(claimed.id, "failed", "template_not_found:${claimed.templateName}")
                        return
                    }
                try {
                    TemplateEngine.render(tmpl.body, claimed.templateVars ?: emptyMap())
                } catch (e: Exception) {
                    reportStatus(claimed.id, "failed", "template_error:${e.message}")
                    return
                }
            }
            !claimed.body.isNullOrBlank() -> claimed.body
            else -> {
                reportStatus(claimed.id, "failed", "empty_body")
                return
            }
        }

        val smsJob = SmsJob(id = claimed.id, toPhone = claimed.toPhone, body = body)
        val record = SmsJobRecord(smsJob, "processing")
        messageLog.add(record)
        refreshFlows()

        smsSender.send(
            context     = this,
            job         = smsJob,
            onSent      = {
                reportStatus(smsJob.id, "sent")
                messageLog.updateStatus(smsJob.id, "sent")
                stats.increment("sent")
                refreshFlows()
            },
            onDelivered = {
                reportStatus(smsJob.id, "delivered")
                messageLog.updateStatus(smsJob.id, "delivered")
                stats.increment("delivered")
                refreshFlows()
            },
            onFailed    = { err ->
                reportStatus(smsJob.id, "failed", err)
                messageLog.updateStatus(smsJob.id, "failed", err)
                stats.increment("failed")
                refreshFlows()
                if (prefs.notifyOnFailure) notifyFailure(smsJob.toPhone, err)
            },
        )
    }

    private suspend fun claimJob(jobId: String): SmsJobDto? {
        return try {
            val current = relayClient.client.from("sms_jobs")
                .select { filter { eq("id", jobId) } }
                .decodeSingleOrNull<SmsJobDto>()

            if (current?.status != "pending") return null

            relayClient.client.from("sms_jobs")
                .update({ set("status", "processing") }) {
                    filter {
                        eq("id", jobId)
                        eq("status", "pending")
                    }
                }

            relayClient.client.from("sms_jobs")
                .select { filter { eq("id", jobId) } }
                .decodeSingleOrNull<SmsJobDto>()
                ?.takeIf { it.status == "processing" }
        } catch (e: Exception) {
            null
        }
    }

    private fun reportStatus(jobId: String, status: String, error: String? = null) {
        serviceScope.launch {
            try {
                val now = Clock.System.now().toString()
                relayClient.client.from("sms_jobs")
                    .update({
                        when (status) {
                            "sent"      -> { set("status", "sent"); set("sent_at", now) }
                            "delivered" -> { set("status", "delivered"); set("delivered_at", now) }
                            else        -> {
                                set("status", "failed")
                                if (error != null) set("error", error)
                            }
                        }
                    }) {
                        filter { eq("id", jobId) }
                    }
            } catch (_: Exception) {}
        }
    }

    private fun refreshFlows() {
        val all = messageLog.toList()
        allJobsFlow.value    = all
        recentJobsFlow.value = all.take(10)
        statsFlow.value      = stats.toStats()
    }

    private fun updateNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun notifyFailure(toPhone: String, reason: String) {
        val masked = maskPhone(toPhone)
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SMS Failed")
            .setContentText("Failed to $masked: $reason")
            .setSmallIcon(R.drawable.ic_sms)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java)
            .notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val statusText = when (statusFlow.value) {
            ConnectionStatus.CONNECTED    -> "Connected · ${stats.sentToday} sent today"
            ConnectionStatus.RECONNECTING -> "Reconnecting…"
            ConnectionStatus.CONNECTING   -> "Connecting…"
            ConnectionStatus.DISCONNECTED -> "Disconnected"
        }
        val domain = prefs.supabaseDomain()
        val title  = "OpenSMS Gateway${if (isPaused) " · PAUSED" else ""}"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(if (domain.isNotBlank()) "$statusText — $domain" else statusText)
            .setSmallIcon(R.drawable.ic_sms)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "SMS Gateway",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "OpenSMS background gateway"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onDestroy() {
        serviceRunning.value = false
        statusFlow.value     = ConnectionStatus.DISCONNECTED
        isPaused             = false
        relayClient.disconnect()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

private fun maskPhone(phone: String): String {
    if (phone.length <= 4) return phone
    return phone.dropLast(4).replace(Regex("\\d"), "*") + phone.takeLast(4)
}
