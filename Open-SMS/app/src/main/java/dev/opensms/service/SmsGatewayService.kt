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
import dev.opensms.http.OpenSMSHttpServer
import dev.opensms.prefs.AppPreferences
import dev.opensms.queue.SmsJob
import dev.opensms.queue.TokenBucketRateLimiter
import dev.opensms.sms.SmsSender
import dev.opensms.sms.WebhookDispatcher
import dev.opensms.state.MessageLog
import dev.opensms.state.MessageRecord
import dev.opensms.state.MessageStatus
import dev.opensms.state.StatsCounter
import dev.opensms.state.maskPhone
import dev.opensms.templates.TemplateRepository
import dev.opensms.util.NetworkUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject

@AndroidEntryPoint
class SmsGatewayService : Service() {

    @Inject lateinit var prefs: AppPreferences
    @Inject lateinit var templateRepo: TemplateRepository
    @Inject lateinit var messageLog: MessageLog
    @Inject lateinit var stats: StatsCounter
    @Inject lateinit var smsSender: SmsSender
    @Inject lateinit var webhookDispatcher: WebhookDispatcher

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var httpServer: OpenSMSHttpServer

    private val messageChannel = Channel<SmsJob>(
        capacity = 1000,
        onBufferOverflow = BufferOverflow.SUSPEND,
    )

    private val startTime = System.currentTimeMillis()

    companion object {
        const val NOTIF_ID = 1001
        const val CHANNEL_ID = "opensms_gateway"

        var isRunning = false
            private set
        var isPaused = false
        val queueDepth = AtomicInteger(0)

        fun start(context: Context) {
            context.startForegroundService(Intent(context, SmsGatewayService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SmsGatewayService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        isPaused = false
        queueDepth.set(0)
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())

        startHttpServer()
        launchQueueConsumer()
    }

    private fun startHttpServer() {
        httpServer = OpenSMSHttpServer(
            port = prefs.port,
            messageChannel = messageChannel,
            apiKey = prefs.apiKey,
            templateRepo = templateRepo,
            messageLog = messageLog,
            stats = stats,
            serviceStartTime = startTime,
            ipAllowlistProvider = { prefs.ipAllowlist },
        )
        try {
            httpServer.start()
        } catch (e: Exception) {
            // Port conflict — try port+1
            prefs.port = prefs.port + 1
            httpServer = OpenSMSHttpServer(
                port = prefs.port,
                messageChannel = messageChannel,
                apiKey = prefs.apiKey,
                templateRepo = templateRepo,
                messageLog = messageLog,
                stats = stats,
                serviceStartTime = startTime,
                ipAllowlistProvider = { prefs.ipAllowlist },
            )
            httpServer.start()
        }
    }

    private fun launchQueueConsumer() = scope.launch(Dispatchers.IO) {
        val rateLimiter = TokenBucketRateLimiter(prefs.smsPerMinute)

        for (job in messageChannel) {
            // Wait while paused — keep job in hand
            while (isPaused) {
                kotlinx.coroutines.delay(500)
            }

            queueDepth.decrementAndGet()
            updateNotification()

            val record = MessageRecord(
                messageId = job.messageId,
                to = job.to,
                toMasked = maskPhone(job.to),
                templateName = job.templateName,
                body = job.body,
                status = MessageStatus.PROCESSING,
            )
            messageLog.add(record)

            rateLimiter.acquire()

            smsSender.send(
                job = job,
                onSent = {
                    messageLog.update(job.messageId, MessageStatus.SENT)
                    stats.incrementSent()
                    updateNotification()
                    job.webhookUrl?.let { url ->
                        messageLog.find(job.messageId)?.let { r ->
                            webhookDispatcher.dispatch(r, url, "sent")
                        }
                    }
                },
                onDelivered = {
                    messageLog.update(job.messageId, MessageStatus.DELIVERED)
                    updateNotification()
                    job.webhookUrl?.let { url ->
                        messageLog.find(job.messageId)?.let { r ->
                            webhookDispatcher.dispatch(r, url, "delivered")
                        }
                    }
                },
                onFailed = { reason ->
                    messageLog.update(job.messageId, MessageStatus.FAILED, reason)
                    stats.incrementFailed()
                    updateNotification()
                    if (prefs.notifyOnFailure) notifyFailure(job.to, reason)
                    job.webhookUrl?.let { url ->
                        messageLog.find(job.messageId)?.let { r ->
                            webhookDispatcher.dispatch(r, url, "failed")
                        }
                    }
                },
            )
        }
    }

    override fun onDestroy() {
        isRunning = false
        isPaused = false
        queueDepth.set(0)
        httpServer.stop()
        messageChannel.close()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val ip = NetworkUtils.getWifiIp(this)
        val url = "http://$ip:${prefs.port}"
        val pausedSuffix = if (isPaused) " • PAUSED" else ""

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("● OpenSMS Running  •  ${stats.sentToday()} sent today$pausedSuffix")
            .setContentText(url)
            .setSmallIcon(R.drawable.ic_sms_notification)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
    }

    private fun notifyFailure(to: String, reason: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SMS Failed")
            .setContentText("Failed to ${maskPhone(to)}: $reason")
            .setSmallIcon(R.drawable.ic_sms_notification)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java)
            .notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "SMS Gateway", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "OpenSMS gateway service"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
