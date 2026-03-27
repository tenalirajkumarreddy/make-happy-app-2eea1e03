package dev.opensms.queue

data class SmsJob(
    val messageId: String,
    val to: String,
    val body: String,
    val templateName: String? = null,
    val webhookUrl: String? = null,
    val enqueuedAt: Long = System.currentTimeMillis(),
)
