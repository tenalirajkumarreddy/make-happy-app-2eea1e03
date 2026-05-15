$files = @(
  'src\mobile\pages\admin\AdminInventory.tsx',
  'src\mobile\pages\admin\AdminPurchases.tsx'
)

$pullImports = @'
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
'@

foreach ($f in $files) {
  $c = [System.IO.File]::ReadAllText($f)
  if ($c -notlike '*usePullToRefresh*') {
    # Insert after last import block (first non-import line)
    $c = $c -replace '(import \{ fmtINR \} from "@/lib/utils";)', "`$1`n$pullImports"
    [System.IO.File]::WriteAllText($f, $c)
    Write-Host "Patched imports: $f"
  } else {
    Write-Host "Already has imports: $f"
  }
}

# Replace spinners with skeleton in Inventory
$inv = 'src\mobile\pages\admin\AdminInventory.tsx'
$c = [System.IO.File]::ReadAllText($inv)
$c = $c -replace '<div className="flex justify-center py-8">\s*<Loader2 className="h-6 w-6 animate-spin text-primary" />\s*</div>', '<CardSkeletonList count={4} />'
[System.IO.File]::WriteAllText($inv, $c)
Write-Host "Inventory spinner replaced"

# Replace spinners with skeleton in Purchases
$pur = 'src\mobile\pages\admin\AdminPurchases.tsx'
$c = [System.IO.File]::ReadAllText($pur)
$c = $c -replace '<div className="flex justify-center py-8">\s*<Loader2 className="h-6 w-6 animate-spin text-primary" />\s*</div>', '<CardSkeletonList count={4} />'
[System.IO.File]::WriteAllText($pur, $c)
Write-Host "Purchases spinner replaced"
