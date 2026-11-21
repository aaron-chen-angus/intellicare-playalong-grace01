# Makes phone-friendly copies (640 px wide, transparent PNG) of every image in assets/web -> assets/stage
# Usage:  powershell -ExecutionPolicy Bypass -File tools\stage_images.ps1   [-Width 640]
param([int]$Width = 640)
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing
$src = Join-Path $root "assets\web"; $dst = Join-Path $root "assets\stage"; New-Item -ItemType Directory -Force $dst | Out-Null
$log = @()
Get-ChildItem $src -Filter *.png | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName); $h = [int]($img.Height * $Width / $img.Width)
  $bmp = New-Object System.Drawing.Bitmap $Width, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.SmoothingMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $Width, $h); $out = Join-Path $dst $_.Name; $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $log += "$($_.Name): $($img.Width)x$($img.Height) -> $Width x $h, $([math]::Round((Get-Item $out).Length/1KB)) KB"
  $g.Dispose(); $bmp.Dispose(); $img.Dispose() }
$log | Out-File (Join-Path $PSScriptRoot "_stage.txt") -Encoding utf8
