package dev.opensms.prefs

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
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
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (t: Throwable) {
            context.getSharedPreferences("opensms_prefs_fallback", Context.MODE_PRIVATE)
        }
    }

    var supabaseUrl: String
        get() = prefs.getString(KEY_SUPABASE_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SUPABASE_URL, value).apply()

<<<<<<< Updated upstream
    var anonKey: String
        get() = prefs.getString(KEY_ANON_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_ANON_KEY, value).apply()

    var autoStartOnBoot: Boolean
=======
    var supabaseUrl: String
        get() = prefs.getString(KEY_SUPABASE_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SUPABASE_URL, value).apply()

    var supabaseKey: String
        get() = prefs.getString(KEY_SUPABASE_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SUPABASE_KEY, value).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    var isSetupComplete: Boolean
        get() = prefs.getBoolean(KEY_SETUP_COMPLETE, false)
        set(value) = prefs.edit().putBoolean(KEY_SETUP_COMPLETE, value).apply()

    var deviceId: String
        get() = prefs.getString(KEY_DEVICE_ID, null) ?: generateAndSaveDeviceId()
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value).apply()

    var autoStart: Boolean
>>>>>>> Stashed changes
        get() = prefs.getBoolean(KEY_AUTO_START, true)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_START, value).apply()

    var notifyOnFailure: Boolean
        get() = prefs.getBoolean(KEY_NOTIFY_FAILURE, true)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFY_FAILURE, value).apply()

    var smsPerMinute: Int
        get() = prefs.getInt(KEY_SMS_PER_MINUTE, 10)
        set(value) = prefs.edit().putInt(KEY_SMS_PER_MINUTE, value).apply()

<<<<<<< Updated upstream
    val hasCredentials: Boolean
        get() = supabaseUrl.isNotBlank() && anonKey.isNotBlank()
=======
    fun backendDomain(): String {
        if (supabaseUrl.isBlank()) return ""
        return runCatching {
            supabaseUrl.removePrefix("https://").substringBefore(".")
        }.getOrElse { supabaseUrl }
    }
>>>>>>> Stashed changes

    fun supabaseDomain(): String =
        supabaseUrl.removePrefix("https://").removePrefix("http://").substringBefore("/")

    fun clearCredentials() {
        prefs.edit()
<<<<<<< Updated upstream
            .remove(KEY_SUPABASE_URL)
            .remove(KEY_ANON_KEY)
=======
            .putBoolean(KEY_CONFIGURED, false)
            .putString(KEY_SUPABASE_URL, "")
            .putString(KEY_SUPABASE_KEY, "")
>>>>>>> Stashed changes
            .apply()
    }

    companion object {
<<<<<<< Updated upstream
        private const val KEY_SUPABASE_URL   = "supabase_url"
        private const val KEY_ANON_KEY       = "anon_key"
        private const val KEY_AUTO_START     = "auto_start"
=======
        private const val KEY_CONFIGURED    = "configured"
        private const val KEY_SUPABASE_URL  = "supabase_url"
        private const val KEY_SUPABASE_KEY  = "supabase_key"
        private const val KEY_API_KEY       = "api_key"
        private const val KEY_SETUP_COMPLETE = "setup_complete"
        private const val KEY_DEVICE_ID     = "device_id"
        private const val KEY_AUTO_START    = "auto_start"
>>>>>>> Stashed changes
        private const val KEY_NOTIFY_FAILURE = "notify_failure"
        private const val KEY_SMS_PER_MINUTE = "sms_per_minute"
    }
}
