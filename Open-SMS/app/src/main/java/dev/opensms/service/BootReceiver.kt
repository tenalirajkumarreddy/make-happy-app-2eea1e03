package dev.opensms.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import dev.opensms.prefs.AppPreferences
import javax.inject.Inject

@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {

    @Inject lateinit var prefs: AppPreferences

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if ((action == Intent.ACTION_BOOT_COMPLETED ||
                    action == Intent.ACTION_MY_PACKAGE_REPLACED) &&
            prefs.autoStart && prefs.isSetupComplete
        ) {
            SmsGatewayService.start(context)
        }
    }
}
