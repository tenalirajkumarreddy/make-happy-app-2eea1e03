package dev.opensms.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SmsJobDto(
    val id: String,
    @SerialName("to_phone")
    val toPhone: String,
    val body: String? = null,
    val status: String,
    @SerialName("template_name")
    val templateName: String? = null,
    @SerialName("template_vars")
    val templateVars: Map<String, String>? = null,
    val error: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
)
