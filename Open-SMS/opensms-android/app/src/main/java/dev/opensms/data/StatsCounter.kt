package dev.opensms.data

import java.util.concurrent.atomic.AtomicInteger

class StatsCounter {
    private val _sentToday = AtomicInteger(0)
    private val _sentWeek = AtomicInteger(0)
    private val _failed = AtomicInteger(0)

    val sentToday: Int get() = _sentToday.get()
    val sentWeek: Int get() = _sentWeek.get()
    val failed: Int get() = _failed.get()

    fun increment(status: String) {
        when (status) {
            "sent", "delivered" -> {
                _sentToday.incrementAndGet()
                _sentWeek.incrementAndGet()
            }
            "failed" -> _failed.incrementAndGet()
        }
    }

    fun toStats() = GatewayStats(sentToday, sentWeek, failed)

    fun reset() {
        _sentToday.set(0)
        _sentWeek.set(0)
        _failed.set(0)
    }
}
