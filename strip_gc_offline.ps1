# Strip gcTime and remove offlineQueue/persister imports from all TS/TSX files under src/
$srcPath = "C:\Users\rajku\Documents\PUBLIC PROJECTS\make-happy-app-2eea1e03\src"
Get-ChildItem -Path $srcPath -Recurse -File | Where-Object { $_.Extension -match '\.(ts|tsx)$' -and $_.FullName -notmatch 'node_modules|WASTE|archive' } | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $modified = $false

    # Remove gcTime lines
    if ($content -match 'gcTime') {
        $content = $content -replace '(?m)^\s*gcTime:\s*[^,\r\n]*,?\s*\r?\n?', ''
        $modified = $true
    }

    # Remove refetchInterval lines (no background polling)
    if ($content -match 'refetchInterval:') {
        $content = $content -replace '(?m)^\s*refetchInterval:\s*[^,\r\n]*,?\s*\r?\n?', ''
        $modified = $true
    }

    # Remove imports from deleted modules
    $importPatterns = @(
        'from "@/lib/offlineQueue"',
        'from "@/lib/persister"',
        'from "@/lib/offlineCreditValidation"',
        'from "@/lib/offlineRouteCache"'
    )
    foreach ($pattern in $importPatterns) {
        if ($content -match [regex]::Escape($pattern)) {
            # Remove the entire import line/block containing this pattern
            $content = $content -replace "(?m)^\s*import\s*\{[^}]*\}\s*$pattern\s*;?\r?\n?", ""
            $modified = $true
        }
    }

    # Also remove multi-line import blocks
    if ($content -match 'from "@/lib/offlineQueue"') {
        $content = $content -replace '(?s)import\s*\{[^}]*getQueuedActions[^}]*\}\s*from\s*"@/lib/offlineQueue"\s*;?\r?\n?', ''
        $content = $content -replace '(?s)import\s*\{[^}]*addToQueue[^}]*\}\s*from\s*"@/lib/offlineQueue"\s*;?\r?\n?', ''
        $modified = $true
    }

    if ($modified) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Output "Modified: $($_.FullName)"
    }
}
