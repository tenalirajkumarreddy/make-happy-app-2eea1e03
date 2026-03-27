package dev.opensms.templates

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TemplateRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val prefs = context.getSharedPreferences("opensms_templates", Context.MODE_PRIVATE)
    private val json  = Json { ignoreUnknownKeys = true }

    private val defaultTemplates = listOf(
        Template("otp",          "Your OTP is {{otp}}. Valid for {{minutes}} minutes. Do not share."),
        Template("welcome",      "Welcome to {{app_name}}! Your account is ready."),
        Template("order_placed", "Order #{{order_id}} placed. Delivery by {{date}}."),
        Template("payment",      "Payment of \u20b9{{amount}} received for order #{{order_id}}."),
        Template("alert",        "[{{severity}}] {{message}} \u2014 {{timestamp}}"),
    )

    init {
        if (getAll().isEmpty()) saveAll(defaultTemplates)
    }

    fun getAll(): List<Template> = runCatching {
        val raw = prefs.getString(KEY_TEMPLATES, null) ?: return emptyList()
        json.decodeFromString<List<Template>>(raw)
    }.getOrElse { emptyList() }

    fun get(name: String): Template? = getAll().find { it.name == name }

    fun save(template: Template) {
        val current = getAll().toMutableList()
        val idx = current.indexOfFirst { it.name == template.name }
        if (idx >= 0) current[idx] = template else current.add(template)
        saveAll(current)
    }

    fun delete(name: String) {
        saveAll(getAll().filter { it.name != name })
    }

    private fun saveAll(templates: List<Template>) {
        prefs.edit().putString(KEY_TEMPLATES, json.encodeToString(templates)).apply()
    }

    companion object {
        private const val KEY_TEMPLATES = "templates"
    }
}
