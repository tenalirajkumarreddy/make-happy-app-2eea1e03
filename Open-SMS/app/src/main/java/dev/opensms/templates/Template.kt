package dev.opensms.templates

data class Template(
    val name: String,
    val body: String,
) {
    val vars: List<String> get() = TemplateEngine.extractVars(body)
}
