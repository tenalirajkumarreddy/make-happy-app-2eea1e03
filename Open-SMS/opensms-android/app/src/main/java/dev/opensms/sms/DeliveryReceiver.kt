package dev.opensms.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import java.util.concurrent.ConcurrentHashMap

class DeliveryReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val jobId = intent.getStringExtra("job_id") ?: return
        val cbs   = callbacks[jobId]             ?: return

        when (intent.action) {
            SmsSender.SMS_SENT_ACTION -> {
                callbacks.remove(jobId)
                when (resultCode) {
                    Activity.RESULT_OK                       -> cbs.onSent()
                    SmsManager.RESULT_ERROR_NO_SERVICE       -> cbs.onFailed("no_service")
                    SmsManager.RESULT_ERROR_RADIO_OFF        -> cbs.onFailed("airplane_mode")
                    SmsManager.RESULT_ERROR_NULL_PDU         -> cbs.onFailed("invalid_number")
                    SmsManager.RESULT_ERROR_GENERIC_FAILURE  -> cbs.onFailed("carrier_error")
                    else -> cbs.onFailed("unknown_$resultCode")
                }
            }
            SmsSender.SMS_DELIVERED_ACTION -> {
                when (resultCode) {
                    Activity.RESULT_OK -> cbs.onDelivered()
                    else -> { /* delivery reports are best-effort */ }
                }
            }
        }
    }

    companion object {
        private val callbacks = ConcurrentHashMap<String, SmsCallbacks>()

        fun register(
            jobId: String,
            onSent: () -> Unit,
            onDelivered: () -> Unit,
            onFailed: (String) -> Unit,
        ) {
            callbacks[jobId] = SmsCallbacks(onSent, onDelivered, onFailed)
        }

        fun unregister(jobId: String) {
            callbacks.remove(jobId)
        }
    }

    data class SmsCallbacks(
        val onSent: () -> Unit,
        val onDelivered: () -> Unit,
        val onFailed: (String) -> Unit,
    )
}
