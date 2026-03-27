package dev.opensms.state

data class MessageRecord(
    val messageId: String,
    val to: String,
    val toMasked: String,
    val templateName: String?,
    val body: String,
    var status: MessageStatus = MessageStatus.QUEUED,
    var errorReason: String? = null,
    val enqueuedAt: Long = System.currentTimeMillis(),
    var sentAt: Long? = null,
    var deliveredAt: Long? = null,
)

enum class MessageStatus {
    QUEUED, PROCESSING, SENT, DELIVERED, FAILED
}

fun maskPhone(phone: String): String {
    if (phone.length <= 4) return phone
    val visible = phone.takeLast(4)
    val masked = phone.dropLast(4).replace(Regex("\\d"), "*")
    return masked + visible
}
