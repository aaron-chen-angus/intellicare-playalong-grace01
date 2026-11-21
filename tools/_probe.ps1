$root = Split-Path -Parent $PSScriptRoot
$o = @()
Add-Type -AssemblyName System.Drawing
Get-ChildItem (Join-Path $root "assets\web") | ForEach-Object { $i = [System.Drawing.Image]::FromFile($_.FullName); $o += "$($_.Name)  $($i.Width)x$($i.Height)  $([math]::Round($_.Length/1KB)) KB  $($_.LastWriteTime)"; $i.Dispose() }
$o += "git: " + ((Get-Command git -ErrorAction SilentlyContinue) -ne $null)
$o += "is repo: " + (Test-Path (Join-Path $root ".git"))
try { $r = Invoke-RestMethod "https://script.google.com/macros/s/AKfycbw5UvYkTF_nZgu21LzXBwVwUZMFZj2vNK8DsSK7FWqTd4zIB7vIpnTmAtHWEpY93oeBDQ/exec" -TimeoutSec 30; $o += "ping: " + ($r | ConvertTo-Json -Compress) } catch { $o += "ping ERR " + $_.Exception.Message }
try { $r = Invoke-RestMethod "https://script.google.com/macros/s/AKfycbw5UvYkTF_nZgu21LzXBwVwUZMFZj2vNK8DsSK7FWqTd4zIB7vIpnTmAtHWEpY93oeBDQ/exec?action=leaderboard&board=score&difficulty=groove&song=buds-of-a-heartbeat" -TimeoutSec 30; $o += "board: " + ($r | ConvertTo-Json -Compress -Depth 5) } catch { $o += "board ERR " + $_.Exception.Message }
try { $r = Invoke-WebRequest "https://aaron-chen-angus.github.io/intellicare-playalong-grace01/assets/web/grace-hero.png" -Method Head -UseBasicParsing -TimeoutSec 30; $o += "live hero: " + $r.Headers['Content-Length'] + " bytes, " + $r.Headers['Last-Modified'] } catch { $o += "live hero ERR " + $_.Exception.Message }
$o | Out-File (Join-Path $PSScriptRoot "_probe.txt") -Encoding utf8
