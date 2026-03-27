package dev.opensms.state

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StatsCounter @Inject constructor() {

    private val sentTotal = AtomicInteger(0)
    private val failedTotal = AtomicInteger(0)
    private val sentTodayCount = AtomicInteger(0)
    private val sentWeekCount = AtomicInteger(0)
    private val lastResetDay = AtomicLong(currentDay())
    private val lastResetWeek = AtomicLong(currentWeek())

    fun incrementSent() {
        checkReset()
        sentTotal.incrementAndGet()
        sentTodayCount.incrementAndGet()
        sentWeekCount.incrementAndGet()
    }

    fun incrementFailed() {
        checkReset()
        failedTotal.incrementAndGet()
    }

    fun sentToday(): Int { checkReset(); return sentTodayCount.get() }
    fun sentThisWeek(): Int { checkReset(); return sentWeekCount.get() }
    fun failedTotal(): Int = failedTotal.get()
    fun sentTotal(): Int = sentTotal.get()

    private fun checkReset() {
        val today = currentDay()
        if (lastResetDay.get() != today) {
            lastResetDay.set(today)
            sentTodayCount.set(0)
        }
        val week = currentWeek()
        if (lastResetWeek.get() != week) {
            lastResetWeek.set(week)
            sentWeekCount.set(0)
        }
    }

    private fun currentDay(): Long {
        val cal = java.util.Calendar.getInstance()
        return cal.get(java.util.Calendar.DAY_OF_YEAR).toLong() + cal.get(java.util.Calendar.YEAR) * 1000L
    }

    private fun currentWeek(): Long {
        val cal = java.util.Calendar.getInstance()
        return cal.get(java.util.Calendar.WEEK_OF_YEAR).toLong() + cal.get(java.util.Calendar.YEAR) * 100L
    }
}
