package dev.opensms.queue

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SmsJob(
    @SerialName("id")
    val messageId: String,

    @SerialName("phone")
    val to: String,

    @SerialName("body")
    val body: String,

    @SerialName("template_name")
    val templateName: String? = null,

    @SerialName("webhook_url")
    val webhookUrl: String? = null,

    val status: String = "pending",

    @SerialName("error_message")
    val errorMessage: String? = null,

    // Local-only fields (not in DB or computed)
    val enqueuedAt: Long = System.currentTimeMillis(),
)
