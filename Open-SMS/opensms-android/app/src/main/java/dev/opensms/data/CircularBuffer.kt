package dev.opensms.data

import dev.opensms.data.model.SmsJobRecord

class CircularBuffer<T>(private val maxSize: Int) {
    private val buffer = ArrayDeque<T>(maxSize)

    @Synchronized
    fun add(item: T) {
        if (buffer.size >= maxSize) buffer.removeFirst()
        buffer.addLast(item)
    }

    @Synchronized
    fun toList(): List<T> = buffer.toList().reversed()

    @Synchronized
    fun updateStatus(id: String, newStatus: String, error: String? = null) {
        @Suppress("UNCHECKED_CAST")
        val buf = buffer as? ArrayDeque<SmsJobRecord> ?: return
        val idx = buf.indexOfFirst { it.job.id == id }
        if (idx < 0) return
        buf[idx] = buf[idx].copy(status = newStatus, error = error)
    }

    @Synchronized
    fun size(): Int = buffer.size
}
