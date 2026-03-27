package dev.opensms.queue

import kotlinx.coroutines.delay

class TokenBucketRateLimiter(private val tokensPerMinute: Int) {

    private var tokens = tokensPerMinute.toDouble()
    private var lastRefill = System.currentTimeMillis()

    @Synchronized
    suspend fun acquire() {
        refill()
        while (tokens < 1.0) {
            delay(100)
            refill()
        }
        tokens -= 1.0
    }

    @Synchronized
    private fun refill() {
        val now = System.currentTimeMillis()
        val elapsed = (now - lastRefill) / 60_000.0
        tokens = minOf(tokensPerMinute.toDouble(), tokens + elapsed * tokensPerMinute)
        lastRefill = now
    }
}
