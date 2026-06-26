# Replace the offline/pending sync banner in dashboard files
$files = @(
    "src/pages/AgentDashboard.tsx",
    "src/pages/MarketerDashboard.tsx", 
    "src/pages/PosDashboard.tsx"
)

foreach ($file in $files) {
    $content = Get-Content»: [0] = (Get-Content $file -Raw)
    
    # Match the entire block from {(!isOnline || pendingCount > 0) to the closing )}
    $newContent = [regex]::Replace($content, '\{\(!isOnline \|\| pendingCount > 0\) && \([\s\S]*?\n\s*\)\}', '{/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You are offline. Some features may be unavailable.</span>
        </div>
      )}')
    
    if ($newContent -ne $content) {
        Set-Content -Path $file -Value $newContent -NoNewline
        Write-Output "Replaced banner in: $file"
    } else {
        Write-Output "No match in: $file"
    }
}
