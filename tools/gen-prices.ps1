# Generates SteamPorter's bundled public CNY price snapshot.
# Usage: powershell -ExecutionPolicy Bypass -File tools\gen-prices.ps1 [-MaxApps 100]
param(
  [string]$SeedPath = '',
  [switch]$SkipFeatured,
  [int]$MaxApps = 100
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
if (-not $SeedPath) { $SeedPath = Join-Path $PSScriptRoot 'seed-appids.json' }
$outPath = Join-Path $root 'data\prices.json'
New-Item -ItemType Directory -Force (Split-Path -Parent $outPath) | Out-Null

function Get-Json([string]$Url) {
  Invoke-RestMethod -Uri $Url -TimeoutSec 30 -Headers @{ 'User-Agent' = 'Mozilla/5.0 (SteamPorter-PriceGen)' }
}

$seed = @()
if (Test-Path $SeedPath) {
  $seed = @((Get-Content $SeedPath -Raw | ConvertFrom-Json) | ForEach-Object { [string]$_ })
}

$featured = @()
if (-not $SkipFeatured) {
  try {
    $categories = Get-Json 'https://store.steampowered.com/api/featuredcategories?cc=cn&l=schinese'
    foreach ($category in @('top_sellers', 'specials', 'new_releases', 'coming_soon')) {
      foreach ($item in @($categories.$category.items)) { if ($item.id) { $featured += [string]$item.id } }
    }
  } catch { Write-Warning "Featured list unavailable: $($_.Exception.Message)" }
}

$apps = @($seed + $featured | Sort-Object -Unique)
if ($MaxApps -gt 0 -and $apps.Count -gt $MaxApps) { $apps = @($apps | Select-Object -First $MaxApps) }
Write-Host "Fetching prices for $($apps.Count) public Steam apps..."

$prices = @{}
$names = @{}
for ($i = 0; $i -lt $apps.Count; $i++) {
  $id = $apps[$i]
  $response = $null
  $url = "https://store.steampowered.com/api/appdetails?appids=$id&filters=price_overview,basic&cc=cn&l=schinese"
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    try { $response = Get-Json $url; break }
    catch { Start-Sleep -Seconds (2 * ($attempt + 1)) }
  }
  $node = if ($response) { $response.$id } else { $null }
  if ($node -and $node.success -and $node.data -and (-not $node.data.type -or $node.data.type -in @('game', 'Game'))) {
    if ($node.data.name) { $names[$id] = [string]$node.data.name }
    if ($node.data.is_free) { $prices[$id] = 0 }
    elseif ($node.data.price_overview -and $null -ne $node.data.price_overview.final) { $prices[$id] = [int]$node.data.price_overview.final }
  }
  $done = $i + 1
  Write-Progress -Activity 'Fetching Steam prices' -Status "$done / $($apps.Count)" -PercentComplete (($done / $apps.Count) * 100)
  Start-Sleep -Milliseconds 350
}
Write-Progress -Activity 'Fetching Steam prices' -Completed

$output = [ordered]@{
  _meta = [ordered]@{ generatedAt = (Get-Date -Format 'yyyy-MM-dd'); count = $prices.Count; sources = @('seed', 'featured'); currency = 'CNY' }
  prices = [ordered]@{}
}
foreach ($id in ($prices.Keys | Sort-Object { [int]$_ })) {
  $entry = [ordered]@{ price = $prices[$id] }
  if ($names.ContainsKey($id)) { $entry.name = $names[$id] }
  $output.prices[[string]$id] = $entry
}
[IO.File]::WriteAllText($outPath, ($output | ConvertTo-Json -Depth 5 -Compress), [Text.Encoding]::UTF8)
Write-Host "Done: $($prices.Count) prices saved to $outPath"
