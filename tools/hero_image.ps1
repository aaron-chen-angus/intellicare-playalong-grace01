# Rebuilds assets/web/grace-hero.png (used by the menu hero + header avatar) from a source photo in assets/
param([string]$Pattern = "*Pink Guitar Rock Pose*")
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing
$src = Get-ChildItem (Join-Path $root "assets") -Filter $Pattern | Where-Object { -not $_.PSIsContainer } | Select-Object -First 1
if (-not $src) { "source not found: $Pattern"; exit 1 }
$img = [System.Drawing.Image]::FromFile($src.FullName)
$bmp = New-Object System.Drawing.Bitmap $img
$corner = $bmp.GetPixel(3, 3)
$w = 620; $h = [int]($img.Height * $w / $img.Width)
$dst = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst); $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.DrawImage($img, 0, 0, $w, $h)
$out = Join-Path $root "assets\web\grace-hero.png"; $dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
"source: $($src.Name) $($img.Width)x$($img.Height) corner alpha=$($corner.A) -> $w x $h, $([math]::Round((Get-Item $out).Length/1KB)) KB"
$g.Dispose(); $dst.Dispose(); $bmp.Dispose(); $img.Dispose()
