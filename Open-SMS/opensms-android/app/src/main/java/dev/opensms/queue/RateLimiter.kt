package dev.opensms.queue

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TokenBucketRateLimiter(private val tokensPerMinute: Int) {

    private var tokens = tokensPerMinute.toDouble()
    private var lastRefill = System.currentTimeMillis()
    private val mutex = Mutex()

    suspend fun acquire() {
        mutex.withLock {
            refill()
            while (tokens < 1.0) {
                delay(100)
                refill()
            }
            tokens -= 1.0
        }
    }

    private fun refill() {
        val now = System.currentTimeMillis()
        val elapsed = (now - lastRefill) / 60_000.0
        tokens = minOf(tokensPerMinute.toDouble(), tokens + elapsed * tokensPerMinute)
        lastRefill = now
    }
}
