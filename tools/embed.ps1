# Embeds tools/_check/beatmap.json (with crosstalk clean-up) and tools/_check/samples.json into index.html
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false
$idx = Join-Path $root "index.html"
$html = [IO.File]::ReadAllText($idx, $utf8)
$bm = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "_check\beatmap.json"), $utf8) | ConvertFrom-Json
$notes = @($bm.charts.full)
$kicks = @($notes | Where-Object { $_.l -eq 'kick' } | ForEach-Object { [double]$_.t })
$snares = @($notes | Where-Object { $_.l -eq 'snare' } | ForEach-Object { [double]$_.t })
$hats = @($notes | Where-Object { $_.l -eq 'hihat' } | ForEach-Object { [double]$_.t })
$downs = @($bm.downbeats | ForEach-Object { [double]$_ })
function Near($arr, $t, $w) { foreach ($x in $arr) { if ([math]::Abs($x - $t) -le $w) { return $true } } return $false }
$before = @{}; $notes | Group-Object l | ForEach-Object { $before[$_.Name] = $_.Count }
$clean = @($notes | Where-Object {
  if ($_.l -eq 'tom') { -not (Near $kicks ([double]$_.t) 0.045) }
  elseif ($_.l -eq 'cymbal') { $t = [double]$_.t; (Near $downs $t 0.06) -or -not ((Near $hats $t 0.05) -or (Near $snares $t 0.05)) }
  else { $true } })
$bm.charts.full = $clean
$bm.meta | Add-Member -NotePropertyName postprocess -NotePropertyValue "tom within 45 ms of kick removed; cymbal within 50 ms of hi-hat/snare removed unless on a downbeat" -Force
$after = @{}; $clean | Group-Object l | ForEach-Object { $after[$_.Name] = $_.Count }
"before: " + (($before.GetEnumerator() | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' ')
"after:  " + (($after.GetEnumerator() | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' ')
$json = $bm | ConvertTo-Json -Depth 8 -Compress
$json = $json.Replace('</', '<\/')
$re = New-Object System.Text.RegularExpressions.Regex '(<script type="application/json" id="beatmap">)(.*?)(</script>)', 'Singleline'
$html = $re.Replace($html, { param($m) $m.Groups[1].Value + "`n" + $json + "`n" + $m.Groups[3].Value }, 1)
$samples = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "_check\samples.json"), $utf8)
$re2 = New-Object System.Text.RegularExpressions.Regex '(<script type="application/json" id="drumSamples">)(.*?)(</script>)', 'Singleline'
$html = $re2.Replace($html, { param($m) $m.Groups[1].Value + $samples + $m.Groups[3].Value }, 1)
[IO.File]::WriteAllText($idx, $html, $utf8)
"index.html size: $([math]::Round((Get-Item $idx).Length/1KB)) KB"
