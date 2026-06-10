# Typography Fix Script - Corrected
$src = "src"

Write-Host "=== FIX: Typography off-scale values ===" -ForegroundColor Green

Get-ChildItem -Recurse -File $src -Filter "*.tsx" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    $changed = $false

    # text-[9px] -> text-xs (12px)
    if ($content -match 'text-\[9px\]') {
        $content = $content -replace 'text-\[9px\]', 'text-xs'
        $changed = $true
    }

    # text-[10px] -> text-xs (12px)
    if ($content -match 'text-\[10px\]') {
        $content = $content -replace 'text-\[10px\]', 'text-xs'
        $changed = $true
    }

    # text-[11px] -> text-xs (12px)
    if ($content -match 'text-\[11px\]') {
        $content = $content -replace 'text-\[11px\]', 'text-xs'
        $changed = $true
    }

    # text-[15px] -> text-sm (14px)
    if ($content -match 'text-\[15px\]') {
        $content = $content -replace 'text-\[15px\]', 'text-sm'
        $changed = $true
    }

    if ($changed) {
        Set-Content -Path $_.FullName -Value $content -NoNewline
        Write-Host "Updated: $($_.FullName)"
    }
}

Write-Host "=== Done ===" -ForegroundColor Green
