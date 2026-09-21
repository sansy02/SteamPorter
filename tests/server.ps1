# 极简静态文件服务器(仅本地测试用):powershell -File tests\server.ps1
param([int]$Port = 8000, [string]$Root = '')
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "serving $Root on http://localhost:$Port/ (Ctrl+C 停止)"
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
  '.mjs'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png';
  '.jpg'='image/jpeg'; '.vdf'='text/plain; charset=utf-8'; '.ico'='image/x-icon'
}
while ($true) {
  try {
    $ctx = $listener.GetContext()
  } catch { break }
  try {
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -match '\.\.') { $ctx.Response.StatusCode = 403 }
    else {
      $file = Join-Path $Root ($path.TrimStart('/').Replace('/', '\'))
      if ((Test-Path $file -PathType Leaf)) {
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $ct = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($file)
        $ctx.Response.ContentType = $ct
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $ctx.Response.StatusCode = 404 }
    }
  } catch { try { $ctx.Response.StatusCode = 500 } catch {} }
  finally { try { $ctx.Response.Close() } catch {} }
}
