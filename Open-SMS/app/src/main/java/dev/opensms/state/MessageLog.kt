package dev.opensms.state

import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MessageLog @Inject constructor() {

    private val lock = ReentrantReadWriteLock()
    private val buffer = ArrayDeque<MessageRecord>(MAX_SIZE)

    fun add(record: MessageRecord) = lock.write {
        if (buffer.size >= MAX_SIZE) buffer.removeFirst()
        buffer.addLast(record)
    }

    fun update(messageId: String, status: MessageStatus, errorReason: String? = null) = lock.write {
        buffer.find { it.messageId == messageId }?.let { record ->
            record.status = status
            record.errorReason = errorReason
            when (status) {
                MessageStatus.SENT -> record.sentAt = System.currentTimeMillis()
                MessageStatus.DELIVERED -> record.deliveredAt = System.currentTimeMillis()
                else -> {}
            }
        }
    }

    fun getAll(): List<MessageRecord> = lock.read { buffer.toList().reversed() }

    fun getRecent(n: Int = 10): List<MessageRecord> = lock.read {
        buffer.takeLast(n).reversed()
    }

    fun find(messageId: String): MessageRecord? = lock.read {
        buffer.find { it.messageId == messageId }
    }

    fun clear() = lock.write { buffer.clear() }

    companion object {
        const val MAX_SIZE = 500
    }
}
