package dev.opensms.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dev.opensms.ui.screens.DashboardScreen
import dev.opensms.ui.screens.LogsScreen
import dev.opensms.ui.screens.SetupScreen
import dev.opensms.ui.screens.SettingsScreen
import dev.opensms.ui.screens.TemplatesScreen
import androidx.hilt.navigation.compose.hiltViewModel
import dev.opensms.ui.viewmodel.MainViewModel

@Composable
fun OpenSMSNavHost() {
    val navController = rememberNavController()
    val mainVm: MainViewModel = hiltViewModel()

    NavHost(
        navController = navController,
        startDestination = if (mainVm.isSetupComplete) "dashboard" else "setup",
    ) {
        composable("setup") {
            SetupScreen(
                onSetupComplete = { navController.navigate("dashboard") { popUpTo("setup") { inclusive = true } } }
            )
        }
        composable("dashboard") {
            DashboardScreen(navController = navController)
        }
        composable("templates") {
            TemplatesScreen(navController = navController)
        }
        composable("logs") {
            LogsScreen(navController = navController)
        }
        composable("settings") {
            SettingsScreen(navController = navController)
        }
    }
}
