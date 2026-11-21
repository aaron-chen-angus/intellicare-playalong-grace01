# Google Sheet template — intelliCARE Music Play-a-Long

Sheet: https://docs.google.com/spreadsheets/d/1M92hn8TyPRbegZE4g470PJlsSx_5sDqmg95kbtDW6uk

Running `setup()` in `tools/apps_script.gs` creates every tab below (existing tabs and data are kept). You do not need to type anything by hand.

| Tab | Purpose | Public? |
|---|---|---|
| **Sessions** | Full SessionRecords, only from players who gave remote consent | Private |
| **Leaderboard** | One row per accepted submission. Boards are computed from it | Public fields only, via API |
| **Players** | Rate-limit bookkeeping (`dailyCount` = `yyyy-MM-dd|count`, `lastSubmitTs` = epoch ms) | Private |
| **Charts** | `songId, difficulty, noteCount, maxScore`: the score ceiling used for validation | Private |
| **NormsAgg** | Hourly deciles per metric × age band × gender (n ≥ 30) | Aggregates via `?action=norms` |
| **Config** | `currentSeason`, `seasonStart`, `facilitatorPinHash`, `profanityList` | Private |
| **Log** | Rejected submissions and reasons | Private |

## Column order

**Sessions:** ts, sessionId, playerId, nickname, age, ageBand, gender, hand, musicExp, mode, songId, difficulty, score, grade, accuracy, maxCombo, fullCombo, perfect, great, good, miss, wrong, stray, meanAsyncMs, sdAsyncMs, R, chordSimulMs, limbIndependence, srtMedian, crtMedian, crtErr, beatsyncSd600, rhythmIndex, coordinationIndex, perPadJSON, confusionJSON, appVersion, userAgent

**Leaderboard:** ts, sessionId, playerId, nickname, avatarColor, ageBand, gender, showGender (checkbox), songId, difficulty, season, score, accuracy, maxCombo, srtMedian, crtMedian, rhythmIndex, hidden (checkbox)

**Players:** playerId, nickname, firstSeen, lastSeen, sessions, dailyCount, lastSubmitTs

**Charts:** songId, difficulty, noteCount, maxScore

**NormsAgg:** metric, ageBand, gender, n, p10…p90, mean, sd, updated

**Config:** key, value

**Log:** ts, reason, payload

## Validation and formatting applied by `setup()`

- Header rows are frozen, bold, dark background.
- `Leaderboard.hidden` and `Leaderboard.showGender` have checkbox validation.
- Conditional format: a Leaderboard row with `hidden = TRUE` turns light red.

## Facilitator tasks

- **Hide a row:** tick `hidden` on that Leaderboard row. Boards update on the next 15 s cache refresh.
- **New season:** change `Config → currentSeason` (e.g. `S2`). The "Season" filter then shows only new rows.
- **Score ceiling:** after finishing the chart, set `Charts.maxScore` for each difficulty. The Results screen of the Editor shows the value as "max score (no Heartbeat)". The server allows up to 2× that, since Heartbeat Mode doubles points. Until it is set, the server uses 5,000,000.
- **Profanity list:** comma-separated, in `Config → profanityList`.

## Dashboards (v1.1)

| Tab / URL | What it shows |
|---|---|
| **Dashboard** (first tab) | 8 KPI tiles; charts for runs per day, difficulty mix, accuracy by age band × gender, reaction time by age band, Rhythm and Coordination Index, accuracy distribution, hit rate per pad, timing by age band; a top-10 table; a weekday × 3-hour activity heat-map; the expected-pad → hit-pad confusion matrix. Refreshed every 10 minutes, or via the menu **🎵 intelliCARE → Refresh dashboard now** |
| **DashData** | Chart source tables, written by `refreshDashboard()`. Do not edit by hand |
| `<web app URL>?action=dashboard` | Live, filterable web dashboard (period, difficulty, age band, gender). Auto-refreshes every 60 s |

The dashboards show aggregates only. Hidden leaderboard rows are excluded. Pad accuracy, confusion and timing come from consented Sessions records only.
