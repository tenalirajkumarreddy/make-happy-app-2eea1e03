package dev.opensms.util

import android.content.Context
import android.net.wifi.WifiManager
import java.net.NetworkInterface

object NetworkUtils {

    fun getAllLocalIps(): List<String> {
        val ips = mutableListOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addrs = iface.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (addr.isLoopbackAddress) continue
                    val ip = addr.hostAddress ?: continue
                    if (!ip.contains(':')) { // skip IPv6
                        ips.add("${iface.displayName}: $ip")
                    }
                }
            }
        } catch (_: Exception) {}
        return ips
    }

    fun getWifiIp(context: Context): String {
        return try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val ip = wifiManager.connectionInfo.ipAddress
            String.format("%d.%d.%d.%d", ip and 0xff, ip shr 8 and 0xff, ip shr 16 and 0xff, ip shr 24 and 0xff)
        } catch (_: Exception) {
            getAllLocalIps().firstOrNull()?.substringAfter(": ") ?: "Unknown"
        }
    }
}
