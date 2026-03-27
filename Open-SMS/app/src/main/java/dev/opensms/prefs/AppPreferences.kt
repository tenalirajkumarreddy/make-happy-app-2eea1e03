package dev.opensms.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppPreferences @Inject constructor(@ApplicationContext private val context: Context) {

    private val prefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "opensms_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            context.getSharedPreferences("opensms_prefs_fallback", Context.MODE_PRIVATE)
        }
    }

    var isSetupComplete: Boolean
        get() = prefs.getBoolean(KEY_SETUP_COMPLETE, false)
        set(value) = prefs.edit().putBoolean(KEY_SETUP_COMPLETE, value).apply()

    var port: Int
        get() = prefs.getInt(KEY_PORT, 8080)
        set(value) = prefs.edit().putInt(KEY_PORT, value).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, null) ?: generateAndSaveApiKey()
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    var autoStart: Boolean
        get() = prefs.getBoolean(KEY_AUTO_START, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_START, value).apply()

    var notifyOnFailure: Boolean
        get() = prefs.getBoolean(KEY_NOTIFY_FAILURE, true)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFY_FAILURE, value).apply()

    var smsPerMinute: Int
        get() = prefs.getInt(KEY_SMS_PER_MINUTE, 10)
        set(value) = prefs.edit().putInt(KEY_SMS_PER_MINUTE, value).apply()

    var webhookUrl: String
        get() = prefs.getString(KEY_WEBHOOK_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_WEBHOOK_URL, value).apply()

    var ipAllowlist: String
        get() = prefs.getString(KEY_IP_ALLOWLIST, "") ?: ""
        set(value) = prefs.edit().putString(KEY_IP_ALLOWLIST, value).apply()

    fun regenerateApiKey(): String {
        val key = generateApiKey()
        apiKey = key
        return key
    }

    fun reset() {
        prefs.edit().clear().apply()
    }

    private fun generateAndSaveApiKey(): String {
        val key = generateApiKey()
        prefs.edit().putString(KEY_API_KEY, key).apply()
        return key
    }

    private fun generateApiKey(): String =
        UUID.randomUUID().toString().replace("-", "") +
                UUID.randomUUID().toString().replace("-", "").take(0)

    companion object {
        private const val KEY_SETUP_COMPLETE = "setup_complete"
        private const val KEY_PORT = "port"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_AUTO_START = "auto_start"
        private const val KEY_NOTIFY_FAILURE = "notify_failure"
        private const val KEY_SMS_PER_MINUTE = "sms_per_minute"
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_IP_ALLOWLIST = "ip_allowlist"
    }
}
