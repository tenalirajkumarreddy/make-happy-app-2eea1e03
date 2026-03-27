package dev.opensms.data.model

data class SmsJobRecord(
    val job: SmsJob,
    val status: String,
    val timestamp: Long = System.currentTimeMillis(),
    val error: String? = null,
)
