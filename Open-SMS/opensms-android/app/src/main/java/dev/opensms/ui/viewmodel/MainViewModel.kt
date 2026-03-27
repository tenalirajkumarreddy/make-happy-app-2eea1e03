package dev.opensms.ui.viewmodel

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.opensms.data.GatewayStats
import dev.opensms.data.model.SmsJob
import dev.opensms.data.model.SmsJobRecord
import dev.opensms.prefs.AppPreferences
import dev.opensms.relay.ConnectionStatus
import dev.opensms.service.SmsGatewayService
import dev.opensms.sms.SmsSender
import dev.opensms.templates.Template
import dev.opensms.templates.TemplateRepository
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    application: Application,
    val prefs: AppPreferences,
    private val templateRepo: TemplateRepository,
    private val smsSender: SmsSender,
) : AndroidViewModel(application) {

    val isConfigured: Boolean get() = prefs.hasCredentials

    var isServiceRunning by mutableStateOf(SmsGatewayService.serviceRunning.value)
        private set

    var isPaused by mutableStateOf(SmsGatewayService.isPaused)
        private set

    var connectionStatus by mutableStateOf(SmsGatewayService.statusFlow.value)
        private set

    var recentMessages by mutableStateOf<List<SmsJobRecord>>(emptyList())
        private set

    var allMessages by mutableStateOf<List<SmsJobRecord>>(emptyList())
        private set

    var stats by mutableStateOf(SmsGatewayService.statsFlow.value)
        private set

    var templates by mutableStateOf<List<Template>>(emptyList())
        private set

    val supabaseDomain: String get() = prefs.supabaseDomain()

    init {
        collectFlows()
        refreshTemplates()
    }

    private fun collectFlows() {
        viewModelScope.launch {
            SmsGatewayService.serviceRunning.collect { isServiceRunning = it }
        }
        viewModelScope.launch {
            SmsGatewayService.statusFlow.collect { connectionStatus = it }
        }
        viewModelScope.launch {
            SmsGatewayService.recentJobsFlow.collect { recentMessages = it }
        }
        viewModelScope.launch {
            SmsGatewayService.allJobsFlow.collect { allMessages = it }
        }
        viewModelScope.launch {
            SmsGatewayService.statsFlow.collect { stats = it }
        }
    }

<<<<<<< Updated upstream
    fun connect(url: String, anonKey: String) {
        prefs.supabaseUrl = url.trim()
        prefs.anonKey     = anonKey.trim()
=======
    fun refreshTemplates() {
        templates = templateRepo.getAll()
    }

    fun connectFromQR(supabaseUrl: String, supabaseKey: String) {
        prefs.supabaseUrl  = supabaseUrl
        prefs.supabaseKey  = supabaseKey
        prefs.isConfigured = true
        prefs.isSetupComplete = true

        if (SmsGatewayService.isRunning) {
            val intent = android.content.Intent(getApplication(), SmsGatewayService::class.java).apply {
                action = SmsGatewayService.ACTION_UPDATE_CREDENTIALS
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                getApplication<Application>().startForegroundService(intent)
            } else {
                getApplication<Application>().startService(intent)
            }
        } else {
            startGateway()
        }
    }

    fun completeSetup(port: Int) {
        prefs.isSetupComplete = true
        prefs.isConfigured = true
>>>>>>> Stashed changes
        startGateway()
    }

    fun startGateway() {
        SmsGatewayService.start(getApplication())
        isServiceRunning = true
    }

    fun stopGateway() {
        SmsGatewayService.stop(getApplication())
        isServiceRunning = false
    }

    fun togglePause() {
        SmsGatewayService.isPaused = !SmsGatewayService.isPaused
        isPaused = SmsGatewayService.isPaused
    }

    fun reconnectNow() {
        if (prefs.hasCredentials) {
            val intent = Intent(getApplication<Application>(), SmsGatewayService::class.java).apply {
                action = SmsGatewayService.ACTION_UPDATE_CREDENTIALS
                putExtra("supabase_url", prefs.supabaseUrl)
                putExtra("anon_key", prefs.anonKey)
            }
            getApplication<Application>().startService(intent)
        }
    }

    fun refreshTemplates() {
        templates = templateRepo.getAll()
    }

    fun saveTemplate(template: Template) {
        templateRepo.save(template)
        refreshTemplates()
    }

    fun deleteTemplate(name: String) {
        templateRepo.delete(name)
        refreshTemplates()
    }

    fun clearLogs() {
        allMessages   = emptyList()
        recentMessages = emptyList()
    }

    fun exportLogs(context: Context) {
        // TODO: implement CSV export for SmsJobRecord
    }

    fun sendTestSms(to: String, onResult: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val job = SmsJob(
<<<<<<< Updated upstream
                id      = "test_${UUID.randomUUID().toString().take(8)}",
                toPhone = to,
                body    = "OpenSMS test message. Your gateway is working correctly!",
=======
                messageId    = "test_${UUID.randomUUID().toString().take(8)}",
                to           = to,
                body         = "OpenSMS test message. Your gateway is working!",
>>>>>>> Stashed changes
            )
            smsSender.send(
                context     = getApplication(),
                job         = job,
                onSent      = { onResult(true, "Test SMS sent successfully!") },
                onDelivered = {},
                onFailed    = { reason -> onResult(false, "Failed: $reason") },
            )
        }
    }

    fun disconnect() {
        stopGateway()
        prefs.clearCredentials()
    }
}
