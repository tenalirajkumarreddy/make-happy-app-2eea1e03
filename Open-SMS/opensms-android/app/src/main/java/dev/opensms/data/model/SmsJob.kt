package dev.opensms.data.model

data class SmsJob(
    val id: String,
    val toPhone: String,
    val body: String,
)
