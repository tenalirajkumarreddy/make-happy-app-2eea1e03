package dev.opensms.sms

import android.app.PendingIntent
import android.content.Context
import android.telephony.SmsManager
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.opensms.queue.SmsJob
import javax.inject.Inject

class SmsSender @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun send(
        job: SmsJob,
        onSent: () -> Unit,
        onDelivered: () -> Unit,
        onFailed: (String) -> Unit,
    ) {
        val smsManager = context.getSystemService(SmsManager::class.java)

        val sentIntent = SmsResultReceiver.buildSentIntent(context, job.messageId, onSent, onFailed)
        val deliveredIntent = SmsResultReceiver.buildDeliveredIntent(context, job.messageId, onDelivered)

        try {
            if (job.body.length <= 160) {
                smsManager.sendTextMessage(
                    job.to, null, job.body, sentIntent, deliveredIntent
                )
            } else {
                val parts = smsManager.divideMessage(job.body)
                val sentIntents = ArrayList(parts.map { sentIntent })
                val deliveredIntents = ArrayList(parts.map { deliveredIntent })
                smsManager.sendMultipartTextMessage(
                    job.to, null, parts, sentIntents, deliveredIntents
                )
            }
        } catch (e: Exception) {
            onFailed("send_exception: ${e.message}")
        }
    }
}
