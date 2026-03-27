package dev.opensms.templates

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class Template(
    val name: String,
    val body: String,
) {
    @Transient
    val vars: List<String> = TemplateEngine.extractVars(body)
}
