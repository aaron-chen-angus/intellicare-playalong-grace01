# Prepares web assets: resized Grace image + base64 of drum samples (for inlining into index.html)
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing
$src = Get-ChildItem (Join-Path $root "assets") -Filter "Grace Liew with Guitar 09*" | Select-Object -First 1
$img = [System.Drawing.Image]::FromFile($src.FullName)
$w = 620; $h = [int]($img.Height * $w / $img.Width)
$dst = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst); $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.DrawImage($img, 0, 0, $w, $h)
New-Item -ItemType Directory -Force (Join-Path $root "assets\web") | Out-Null
$out = Join-Path $root "assets\web\grace-hero.png"; $dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
"hero: $($src.Name) -> $w x $h, $([math]::Round((Get-Item $out).Length/1KB)) KB"
$g.Dispose(); $dst.Dispose(); $img.Dispose()
$lines = @()
foreach ($p in @(@('kick','KICK.mp3'),@('snare','SNARE.mp3'),@('hihat','HI-HAT.mp3'),@('tom','TOM.mp3'),@('cymbal','CYMBAL.mp3'))) {
  $b = [IO.File]::ReadAllBytes((Join-Path $root ("sounds\" + $p[1])))
  $lines += ('"' + $p[0] + '":"' + [Convert]::ToBase64String($b) + '"')
}
$json = '{' + ($lines -join ',') + '}'
[IO.File]::WriteAllText((Join-Path $PSScriptRoot "_check\samples.json"), $json)
"samples json: $([math]::Round($json.Length/1KB)) KB"
