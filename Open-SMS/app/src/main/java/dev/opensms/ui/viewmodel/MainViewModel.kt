package dev.opensms.ui.viewmodel

import android.app.Application
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.opensms.prefs.AppPreferences
import dev.opensms.queue.SmsJob
import dev.opensms.service.SmsGatewayService
import dev.opensms.sms.SmsSender
import dev.opensms.state.MessageLog
import dev.opensms.state.MessageRecord
import dev.opensms.state.StatsCounter
import dev.opensms.templates.Template
import dev.opensms.templates.TemplateRepository
import dev.opensms.util.CsvExporter
import dev.opensms.util.NetworkUtils
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    application: Application,
    val prefs: AppPreferences,
    private val messageLog: MessageLog,
    private val stats: StatsCounter,
    private val templateRepo: TemplateRepository,
    private val smsSender: SmsSender,
) : AndroidViewModel(application) {

    val isSetupComplete: Boolean get() = prefs.isSetupComplete

    var isServiceRunning by mutableStateOf(SmsGatewayService.isRunning)
        private set

    var isPaused by mutableStateOf(SmsGatewayService.isPaused)
        private set

    var queueDepth by mutableStateOf(0)
        private set

    var recentMessages by mutableStateOf<List<MessageRecord>>(emptyList())
        private set

    var allMessages by mutableStateOf<List<MessageRecord>>(emptyList())
        private set

    var templates by mutableStateOf<List<Template>>(emptyList())
        private set

    var sentToday by mutableStateOf(0)
        private set

    var sentThisWeek by mutableStateOf(0)
        private set

    var failedTotal by mutableStateOf(0)
        private set

    var localIpAddress by mutableStateOf("")
        private set

    var allLocalIps by mutableStateOf<List<String>>(emptyList())
        private set

    init {
        startPolling()
        refreshTemplates()
    }

    private fun startPolling() = viewModelScope.launch {
        while (isActive) {
            isServiceRunning = SmsGatewayService.isRunning
            isPaused = SmsGatewayService.isPaused
            queueDepth = SmsGatewayService.queueDepth.get()
            recentMessages = messageLog.getRecent(10)
            allMessages = messageLog.getAll()
            sentToday = stats.sentToday()
            sentThisWeek = stats.sentThisWeek()
            failedTotal = stats.failedTotal()
            localIpAddress = NetworkUtils.getWifiIp(getApplication())
            delay(1000)
        }
    }

    fun refreshTemplates() {
        templates = templateRepo.getAll()
    }

    fun detectAllIps() {
        allLocalIps = NetworkUtils.getAllLocalIps()
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

    fun completeSetup(port: Int) {
        prefs.port = port
        prefs.isSetupComplete = true
        startGateway()
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
        messageLog.clear()
        allMessages = emptyList()
        recentMessages = emptyList()
    }

    fun exportLogs(context: Context) {
        CsvExporter.shareAsCsv(context, allMessages)
    }

    fun regenerateApiKey(): String = prefs.regenerateApiKey()

    fun sendTestSms(to: String, onResult: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            val job = SmsJob(
                messageId = "test_${UUID.randomUUID().toString().take(8)}",
                to = to,
                body = "OpenSMS test message. Your gateway is working!",
                templateName = null,
                webhookUrl = null,
            )
            smsSender.send(
                job = job,
                onSent = { onResult(true, "Test SMS sent successfully!") },
                onDelivered = {},
                onFailed = { reason -> onResult(false, "Failed: $reason") },
            )
        }
    }

    fun resetAll() {
        stopGateway()
        messageLog.clear()
        prefs.reset()
    }
}
