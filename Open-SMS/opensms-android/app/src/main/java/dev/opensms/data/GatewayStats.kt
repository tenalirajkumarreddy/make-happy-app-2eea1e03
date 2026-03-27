package dev.opensms.data

data class GatewayStats(
    val sentToday: Int = 0,
    val sentWeek: Int = 0,
    val failed: Int = 0,
)
