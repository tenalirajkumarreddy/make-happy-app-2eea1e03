package dev.opensms.sms

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsManager
import dev.opensms.data.model.SmsJob
import javax.inject.Inject

class SmsSender @Inject constructor() {

    fun send(
        context: Context,
        job: SmsJob,
        onSent: () -> Unit,
        onDelivered: () -> Unit,
        onFailed: (String) -> Unit,
    ) {
        val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

        if (smsManager == null) {
            onFailed("sms_manager_unavailable")
            return
        }

        val sentIntent     = Intent(SMS_SENT_ACTION).putExtra("job_id", job.id)
        val deliveryIntent = Intent(SMS_DELIVERED_ACTION).putExtra("job_id", job.id)

        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val sentPI = PendingIntent.getBroadcast(
            context, job.id.hashCode(), sentIntent, piFlags,
        )
        val deliveryPI = PendingIntent.getBroadcast(
            context, job.id.hashCode() + 1, deliveryIntent, piFlags,
        )

        DeliveryReceiver.register(job.id, onSent, onDelivered, onFailed)

        try {
            if (job.body.length <= 160) {
                smsManager.sendTextMessage(job.toPhone, null, job.body, sentPI, deliveryPI)
            } else {
                val parts = smsManager.divideMessage(job.body)
                smsManager.sendMultipartTextMessage(
                    job.toPhone, null, parts,
                    ArrayList(parts.map { sentPI }),
                    ArrayList(parts.map { deliveryPI }),
                )
            }
        } catch (e: Exception) {
            DeliveryReceiver.unregister(job.id)
            onFailed(e.message ?: "send_error")
        }
    }

    companion object {
        const val SMS_SENT_ACTION      = "dev.opensms.SMS_SENT"
        const val SMS_DELIVERED_ACTION = "dev.opensms.SMS_DELIVERED"
    }
}
