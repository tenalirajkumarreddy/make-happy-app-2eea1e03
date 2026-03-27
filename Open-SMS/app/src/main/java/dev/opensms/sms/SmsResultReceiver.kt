package dev.opensms.sms

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager

class SmsResultReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        // Callbacks registered via PendingIntent; this receiver is the fallback
    }

    companion object {
        private const val ACTION_SMS_SENT = "dev.opensms.SMS_SENT"
        private const val ACTION_SMS_DELIVERED = "dev.opensms.SMS_DELIVERED"
        private const val EXTRA_MESSAGE_ID = "message_id"

        private val sentCallbacks = mutableMapOf<String, Pair<() -> Unit, (String) -> Unit>>()
        private val deliveredCallbacks = mutableMapOf<String, () -> Unit>()

        fun buildSentIntent(
            context: Context,
            messageId: String,
            onSent: () -> Unit,
            onFailed: (String) -> Unit,
        ): PendingIntent {
            sentCallbacks[messageId] = onSent to onFailed
            val intent = Intent(ACTION_SMS_SENT).putExtra(EXTRA_MESSAGE_ID, messageId)
            return PendingIntent.getBroadcast(
                context,
                messageId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        fun buildDeliveredIntent(
            context: Context,
            messageId: String,
            onDelivered: () -> Unit,
        ): PendingIntent {
            deliveredCallbacks[messageId] = onDelivered
            val intent = Intent(ACTION_SMS_DELIVERED).putExtra(EXTRA_MESSAGE_ID, messageId)
            return PendingIntent.getBroadcast(
                context,
                messageId.hashCode() + 1,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        fun handleSentResult(messageId: String, resultCode: Int) {
            val (onSent, onFailed) = sentCallbacks.remove(messageId) ?: return
            when (resultCode) {
                Activity.RESULT_OK -> onSent()
                SmsManager.RESULT_ERROR_NO_SERVICE -> onFailed("no_service")
                SmsManager.RESULT_ERROR_RADIO_OFF -> onFailed("airplane_mode")
                SmsManager.RESULT_ERROR_NULL_PDU -> onFailed("invalid_number")
                SmsManager.RESULT_ERROR_GENERIC_FAILURE -> onFailed("carrier_error")
                else -> onFailed("unknown_error_$resultCode")
            }
        }

        fun handleDeliveredResult(messageId: String) {
            deliveredCallbacks.remove(messageId)?.invoke()
        }
    }
}
