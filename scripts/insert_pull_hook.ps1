$path = 'src\mobile\pages\admin\AdminInventory.tsx'
$lines = [System.IO.File]::ReadAllLines($path)
$hook = @(
  '',
  '  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({',
  '    onRefresh: async () => { await refetch(); },',
  '  });',
  ''
)
$idx = [Array]::IndexOf($lines, '  // Filter stock')
$newlines = $lines[0..($idx-1)] + $hook + $lines[$idx..($lines.Length-1)]
[System.IO.File]::WriteAllLines($path, $newlines)
Write-Host "Inserted at line $idx in Inventory"

# Now do Purchases
$path2 = 'src\mobile\pages\admin\AdminPurchases.tsx'
$lines2 = [System.IO.File]::ReadAllLines($path2)
$idx2 = [Array]::IndexOf($lines2, '  // fmtINR from @/lib/utils handles ₹ formatting')
if ($idx2 -lt 0) {
  # Fallback: find line after useQuery block closes
  for ($i = 0; $i -lt $lines2.Length; $i++) {
    if ($lines2[$i] -match '^\s*\}\);$' -and $i -gt 50) { $idx2 = $i + 1; break }
  }
}
$hook2 = @(
  '',
  '  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({',
  '    onRefresh: async () => { await refetch(); },',
  '  });',
  ''
)
$newlines2 = $lines2[0..($idx2-1)] + $hook2 + $lines2[$idx2..($lines2.Length-1)]
[System.IO.File]::WriteAllLines($path2, $newlines2)
Write-Host "Inserted at line $idx2 in Purchases"
