package dev.opensms.templates

object TemplateEngine {

    private val VAR_REGEX = Regex("""\{\{(\w+)\}\}""")

    fun render(body: String, vars: Map<String, String>): String {
        val missing = VAR_REGEX.findAll(body)
            .map { it.groupValues[1] }
            .filter { it !in vars }
            .toList()

        if (missing.isNotEmpty()) {
            throw MissingVariableException(missing)
        }

        return VAR_REGEX.replace(body) { match ->
            vars[match.groupValues[1]] ?: match.value
        }
    }

    fun extractVars(body: String): List<String> =
        VAR_REGEX.findAll(body).map { it.groupValues[1] }.distinct().toList()
}

class MissingVariableException(val variables: List<String>) :
    Exception("Missing variables: ${variables.joinToString(", ")}")
