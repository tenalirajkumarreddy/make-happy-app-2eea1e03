package dev.opensms.templates

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TemplateRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val prefs = context.getSharedPreferences("opensms_templates", Context.MODE_PRIVATE)
    private val gson = Gson()

    private val defaultTemplates = listOf(
        Template("otp", "Your OTP is {{otp}}. Valid for {{minutes}} minutes. Do not share."),
        Template("welcome", "Welcome to {{app_name}}! Your account is ready."),
        Template("order_placed", "Order #{{order_id}} placed. Delivery by {{date}}."),
        Template("payment", "Payment of \u20b9{{amount}} received for order #{{order_id}}."),
        Template("alert", "[{{severity}}] {{message}} \u2014 {{timestamp}}"),
    )

    init {
        if (getAll().isEmpty()) {
            saveAll(defaultTemplates)
        }
    }

    fun getAll(): List<Template> {
        val json = prefs.getString(KEY_TEMPLATES, null) ?: return emptyList()
        val type = object : TypeToken<List<Template>>() {}.type
        return gson.fromJson(json, type) ?: emptyList()
    }

    fun get(name: String): Template? = getAll().find { it.name == name }

    fun save(template: Template) {
        val current = getAll().toMutableList()
        val idx = current.indexOfFirst { it.name == template.name }
        if (idx >= 0) current[idx] = template else current.add(template)
        saveAll(current)
    }

    fun delete(name: String) {
        val current = getAll().filter { it.name != name }
        saveAll(current)
    }

    private fun saveAll(templates: List<Template>) {
        prefs.edit().putString(KEY_TEMPLATES, gson.toJson(templates)).apply()
    }

    companion object {
        private const val KEY_TEMPLATES = "templates"
    }
}
