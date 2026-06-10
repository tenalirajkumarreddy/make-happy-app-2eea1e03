# Design Consistency Fix Script
# Run this from the project root

$src = "src"

Write-Host "=== FIX 1: Typography off-scale values ===" -ForegroundColor Green

# Fix text-[10px] -> text-xs (128 instances, but let's be careful)
# Note: text-[10px] is 2px smaller than text-xs (12px). For very small labels,
# we could map to text-xs, but let's use a token approach.
# Since 10px is often used for tiny labels that need to fit in small spaces,
# and the Martha K. - text-[10px] doesn't map cleanly to any standard scale value.
# The closest is text-xs (12px). Let's replace with a custom scale if needed,
# but for now, let's replace with the closest standard scale value.

Get-ChildItem -Recurse -File $src -Filter "*.tsx" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    $changed = $false

    # text-[9px] -> text-xs (12px) - 9px is too small for web, bump to 12px
    if ($content -match 'text-\[9px\]') {
        $content = $content -replace 'text-\[9px\]', 'text-xs'
        $changed = $true
    }

    # text-[10px] -> text-xs (12px) - 10px to 12px is a small jump
    if ($content -match 'text-\[10px\]') {
        $content = $content -replace 'text-\[10px\]', 'text-xs'
        $changed = $true
    }

    # text-[11px] -> text-xs (12px)
    if ($content -match 'text-\[11px\]') {
        $content = $content -replace 'text-\[11px\]', 'text-xs'
        $changed = $true
    }

    # text-[15px] -> text-sm (14px) - closest standard value
    if ($content -match 'text-\[15px\]') {
        $content = $content -replace 'text-\[15px\]', 'text-sm'
        $changed = $true
    }

    if ($changed) {
        Set-Content -Path $_.FullName -Value $content -NoNewlineŭn        Write-Host "Updated: $($_.FullName)"
    }
}

Write-Host "=== FIX 2: Dark mode hardcoded colors in MobileListSkeleton ===" -ForegroundColor Green

$skeletonFile = "$src\components\ui\MobileListSkeleton.tsx"
if (Test-Path $skeletonFile) {
    $content = Get-Content $skeletonFile -Raw
    # Replace hardcoded dark mode bg values with proper tokens
    $content = $content -replace 'dark:bg-\[#1a1d24\]', 'dark:bg-card'
    $content = $content -replace 'dark:bg-\[#0f1115\]', 'dark:bg-background'
    Set-Content -Path $skeletonFile -Value $content -NoNewLine
    Write-Host "Updated: $skeletonFile"
}

# Also check if the files exist in other locations
$mobileSkeletonFiles = Get-ChildItem -Recurse -File $src -Filter "MobileListSkeleton.tsx"
foreach ($file in $mobileSkeletonFiles) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    $content = $content -replace 'dark:bg-\[#1a1d24\]', 'dark:bg-card'
    $content = $content -replace 'dark:bg-\[#0f1115\]', 'dark:bg-background'
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewLine
        Write-Host "Updated: $($file.FullName)"
    }
}

Write-Host "=== FIX 3: Inline style fallback colors ===" -ForegroundColor Green

# Fix common inline style fallback colors to use closest Tailwind class or var
Get-ChildItem -Recurse -File $src -Filter "*.tsx" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    $changed = $false

    # These are fallback colors in inline styles - we can't easily replace the dynamic part
    # but we can document them. The dynamic color from DB can't be tokenized.
    # The fallback "#6b7280" -> gray-500 is close to muted-foreground
    # The fallback "#6366f1" -> indigo-500 is a brand color

    # For now, let's focus on non-dynamic hardcoded colors

    if ($changed) {
        Set-Content -Path $_.FullName -Value $content -NoNewLine
        Write-Host "Updated: $($_.FullName)"
    }
}

Write-Host "=== FIX 4: Remove rounded-b-[2rem] hardcoded radius ===" -ForegroundColor Green

Get-ChildItem -Recurse -File $src -Filter "*.tsx" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $original = $content
    $changed = $false

    # rounded-b-[2rem] -> rounded-b-2xl (2rem = 32px, closest is rounded-b-2xl which is 1rem/16px in default)
    # Actually Tailwind uses rem-based scale. 2rem is quite large.
    # Let's check what Tailwind rounded values map to:
    # rounded-sm = 2px, rounded = 4px, rounded-md = 6px, rounded-lg = 8px, rounded-xl = 12px, rounded-2xl = 16px, rounded-3xl = 24px, rounded-full = 9999px
    # 2rem = 32px which would be closest to rounded-3xl (24px) or custom
    # For a big rounded bottom, let's use rounded-b-3xl as closest approximation

    if ($content -match 'rounded-b-\[2rem\]') {
        $content = $content -replace 'rounded-b-\[2rem\]', 'rounded-b-3xl'
        $changed = $true
    }

    if ($changed) {
        Set-Content -Path $_.FullName -Value $content -NoNewLine
        Write-Host "Updated: $($_.FullName)"
    }
}

Write-Host "=== Done ===" -ForegroundColor Green
