# Implementation Plan — intelliCARE Music Play-a-Long

Build in order. Each task should leave `index.html` runnable on GitHub Pages. Requirements referenced as R#.

- [ ] 1. Project scaffold
  - [ ] 1.1 Create `index.html` with inline `<style>` and `<script>`, module sections per design §2, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`, theme-color, apple-mobile-web-app tags. _R13, R17_
  - [ ] 1.2 Add `Config` (song metadata, lane order, colours, windows) and `Storage` (namespaced, try/catch) modules. _R1, R16_
  - [ ] 1.3 Add `I18n` with EN / 中文 label dictionary. _R16.2_

- [ ] 2. Responsive layout shell
  - [ ] 2.1 Build portrait grid (header / video / HUD / highway / pads) using `100dvh` and safe-area insets. _R13.1_
  - [ ] 2.2 Build landscape two-column grid with song info under video; short-landscape variant. _R13.2–13.3_
  - [ ] 2.3 Orientation/resize listener that re-lays out live and notifies Renderer. Verify nothing overlaps the video rect (add a debug assertion in `?debug=1`). _R2.2, R13.4_

- [ ] 3. Video + song clock
  - [ ] 3.1 Embed video (`playsinline`, `preload="auto"`, no controls), buffering ring on START, buffering indicator in game area. _R2_
  - [ ] 3.2 Implement `SongClock` with `requestVideoFrameCallback`, interpolation, jitter smoothing, offset. _Design §4_
  - [ ] 3.3 `?debug=1` overlay: clock, currentTime, drift, fps.

- [ ] 4. Drum pads + input
  - [ ] 4.1 Render 4 pads + full-width kick bar with SVG icons, lane colours, sizes per R3.3–3.4.
  - [ ] 4.2 Pointer Events multi-touch, `event.timeStamp` timing, scroll/zoom/context-menu suppression. _R3.5–3.6_
  - [ ] 4.3 Keyboard mapping + auto key labels; ignore repeats. _R3.8_
  - [ ] 4.4 4-pad mode toggle; haptics. _R3.10–3.11_
  - [ ] 4.5 Optional Web MIDI input behind Settings toggle. _R3.9_

- [ ] 5. DrumSynth
  - [ ] 5.1 AudioContext (`interactive`), unlock on gesture, master bus → compressor → analyser. _R4.2, R4.5_
  - [ ] 5.2 Five synth voices per design §8 with humanisation and hi-hat choke. _R4.1, 4.3, 4.4_
  - [ ] 5.3 Separate video volume and pad volume sliders. _R2.6_

- [ ] 6. Beatmap
  - [ ] 6.1 Inline `<script type="application/json" id="beatmap">` loader + `?chart=` override + schema validation with helpful errors. _R5.2_
  - [ ] 6.2 Difficulty derivation (fire / groove / gentle) and auto bud-flagging. _R5.6, Design §5.1_
  - [ ] 6.3 Until the real chart exists, generate a **temporary placeholder chart** from a fixed BPM (basic rock beat) and clearly label it "Placeholder chart" in the menu.

- [ ] 7. Highway renderer
  - [ ] 7.1 Canvas sizing with DPR cap, lane x positions aligned to pad centres. _R6.1_
  - [ ] 7.2 Perspective projection, gems as pre-rendered sprites, kick bar gems, bud gems. _R6.2–6.3_
  - [ ] 7.3 Beat/bar lines, hit line, lane targets, "get ready" pad rim cue. _R6.4–6.5_
  - [ ] 7.4 Count-in and section labels. _R6.6_

- [ ] 8. Judge + scoring + HUD
  - [ ] 8.1 Judge per design §10 with difficulty windows, strays, auto-miss each frame. _R7.1–7.3_
  - [ ] 8.2 Combo multiplier, score, accuracy, rock meter; HUD with rolling score counter. _R7.4–7.5, R9.2_
  - [ ] 8.3 Judgement + EARLY/LATE text in lane. _R7.6_

- [ ] 9. Visual FX
  - [ ] 9.1 Particle pool, lane flash, ripple ring per hit; PERFECT bigger burst. _R8.1_
  - [ ] 9.2 Kick floor pulse + game-area shake; cymbal sparkle arc. _R8.2–8.3_
  - [ ] 9.3 Spectrum strip from analyser; heartbeat quarter-note pulse. _R8.4–8.5_
  - [ ] 9.4 Heartbeat Mode sakura theme and blossom particles. _R8.6_
  - [ ] 9.5 Adaptive quality + `prefers-reduced-motion`. _R8.7, R14.4_

- [ ] 10. Gamification
  - [ ] 10.1 Heartbeat Mode meter, activation (♥ button / KICK+CYMBAL / Enter), ×2 drain. _R9.1_
  - [ ] 10.2 Results screen: grade, stars, counts, per-pad accuracy bars, early/late histogram, Full Combo, new best. _R9.3_
  - [ ] 10.3 Achievements with toasts and gallery screen. _R9.4_
  - [ ] 10.4 Local leaderboard with arcade initials entry; XP + level. _R9.5–9.6_
  - [ ] 10.5 Streak toasts ON FIRE / UNSTOPPABLE / HEARTBEAT. _R9.7_

- [ ] 11. Menus and modes
  - [ ] 11.1 Start screen with song card (poster, bilingual title, performer, difficulty pills, bests), mode buttons, level bar. _R1, R14.2_
  - [ ] 11.2 Pause menu, visibility auto-pause, resume countdown with 2 s rewind. _R15_
  - [ ] 11.3 Practice mode: speed 0.5/0.75/1, section loop, A–B loop. _R10.2_
  - [ ] 11.4 Free Jam and Demo (auto-play scheduled synth). _R10.3–10.4_
  - [ ] 11.5 Settings panel (all of R16.1), fullscreen button, wake lock. _R13.5, R16_

- [ ] 12. Calibration
  - [ ] 12.1 Tap-along calibration at 100 BPM, median with outlier rejection, saved offset; first-launch prompt; Bluetooth warning. _R12_

- [ ] 13. Chart Editor
  - [ ] 13.1 Timeline canvas with lanes, zoom/scroll, playhead, beat grid, optional peaks waveform. _R11.1_
  - [ ] 13.2 Tap-record, add/delete/drag, snap options, box select, undo/redo. _R11.2_
  - [ ] 13.3 Sections, bud flags, offset nudge, generate difficulties. _R11.2_
  - [ ] 13.4 Import/export JSON and "Copy inline block". _R11.3_

- [ ] 14. Offline beatmap pipeline
  - [ ] 14.1 Create `tools/beatmap_pipeline.ipynb` (Colab) per design §6: download, ffmpeg, Demucs drums stem, ADTOF path, librosa fallback path, beats/downbeats/sections, MIDI→JSON with GM map, de-dupe, poster frame base64, `peaks.json`. _R5.1_
  - [ ] 14.2 `tools/README.md`: step-by-step for Aaron (Open in Colab → Runtime GPU → Run all → download `beatmap.json` → open app `?editor=1` → import → fix → Copy inline block → paste into `index.html` → commit).

- [ ] 15. In-browser AutoCharter fallback
  - [ ] 15.1 CORS probe; if allowed, Worker-based band-split onset charter with progress; else explanatory message. Never use `createMediaElementSource` on cross-origin video. _R5.3–5.4, Design §7_

- [ ] 16. Polish and QA
  - [ ] 16.1 `?test=1` harness for Judge, difficulty derivation, scoring, calibration.
  - [ ] 16.2 Device matrix pass (iPhone portrait/landscape, Android, iPad, desktop keyboard); fix overlaps and touch issues.
  - [ ] 16.3 Performance pass: ≥ 55 fps on mid-range phone, no allocations in render loop, file ≤ 600 KB. _R17_
  - [ ] 16.4 Superseded by task 23 (README as Technical & Scientific Manual).

- [ ] 17. (Phase 2, optional) Google Apps Script session logging and remote leaderboard. _R18_
  - [ ] 17.1 Apps Script `doPost` (append SessionRecord rows, consent-gated) and `doGet ?action=leaderboard|norms` returning only aggregates. _R18, R23.1_
  - [ ] 17.2 Include `tools/apps_script.gs` + set-up steps in the manual.

- [ ] 18. Player profiles
  - [ ] 18.1 Profile creation flow (nickname, age, gender, hand, musical experience), age-band derivation, avatar colour, Guest. _R20.1–20.3_
  - [ ] 18.2 PDPA notice, consent checkboxes, guardian confirmation for under-18s, export/delete data. _R20.4_
  - [ ] 18.3 "Who's playing?" picker; history capped at 200 SessionRecords. _R20.2, Design §18_

- [ ] 19. Extended gamification
  - [ ] 19.1 Wrong-pad detection + 5×6 confusion matrix in Judge. _R19.1, Design §19_
  - [ ] 19.2 Results breakdown: per-pad bars, confusion heatmap, per-pad timing bias, bar-by-bar accuracy timeline. _R19.2_
  - [ ] 19.3 Coaching tips + one-tap practice loop on the weakest section. _R19.3_
  - [ ] 19.4 Live per-pad accuracy rings; pad mastery tiers; rank titles. _R19.4–19.6_
  - [ ] 19.5 Daily challenges (date-seeded), day streaks, coins, cosmetic unlock shop (skins, themes, FX). _R19.7–19.9_
  - [ ] 19.6 Personal-best ghost delta in HUD; profile progress charts. _R19.10–19.11_
  - [ ] 19.7 Expanded achievements gallery; shareable session PNG card. _R19.12–19.13_
  - [ ] 19.8 Leaderboards for all boards with filters and pinned own row. _R9.5_

- [ ] 20. Reflex Test
  - [ ] 20.1 SRT and 4-choice CRT protocols, double-rAF onset stamping, exclusions, early-press handling. _R21.1–21.3_
  - [ ] 20.2 Summary stats, gamified feedback, Reflex leaderboard, latency disclaimer. _R21.4–21.6_

- [ ] 21. Rhythm and coordination metrics
  - [ ] 21.1 Beat Sync Test at 600 ms and 450 ms IOI with scheduled Web Audio clicks. _R22.1_
  - [ ] 21.2 In-song metrics: asynchrony, SD, circular R (+ Rayleigh p), chord simultaneity, limb independence, section accuracy. _R22.2_
  - [ ] 21.3 Rhythm Index and Coordination Index + "How is this calculated?" sheet; add metric unit tests to `?test=1`. _R22.3, Design §19_

- [ ] 22. Norms engine
  - [ ] 22.1 `NORMS` config with null values + source pointers + `verified` flags; "Literature norms pending" state. Do not invent numbers. _R23.1, Design §20_
  - [ ] 22.2 Cohort percentiles (local, then remote cache), age band × gender with n ≥ 30 fallback rules. _R23.1, R23.3_
  - [ ] 22.3 Bell-curve SVG, percentile/z/band display, non-diagnostic wording. _R23.2, R23.4_
  - [ ] 22.4 PIN-protected facilitator view with CSV export. _R23.5_

- [ ] 23. README — Technical & Scientific Manual
  - [ ] 23.1 Write `README.md` following the structure and writing rules in design §21.1–21.2, documenting the implemented code accurately (parameters must match the code). _R24.1–24.2_
  - [ ] 23.2 Equations in LaTeX, Mermaid diagrams for architecture, the state machine and the pipeline; numbered figures and equations. _R24.2, R24.5_
  - [ ] 23.3 APA 7 in-text citations and reference list from design §21.3 only; mark any additions `[to verify]`. _R24.3–24.4_
  - [ ] 23.4 Appendices A–F, glossary, version history. _R24.5_
  - [ ] 23.5 Final consistency check: every formula and threshold in the manual equals the value in `index.html`; list any discrepancies and fix them.

- [ ] 24. Live Google Sheets leaderboard _R25, Design §22_
  - [ ] 24.1 `tools/apps_script.gs`: `setup()` (tabs, headers, validation, hourly trigger), `doGet` (leaderboard / norms / ping), `doPost` (submit with LockService, validation, dedupe, rate limit, ranks in response), CacheService, Log tab.
  - [ ] 24.2 `tools/sheets_template.md` with tab and column specs; `Charts` tab values exported from the Editor.
  - [ ] 24.3 `LeaderboardClient` using the CORS-safe text/plain POST and plain GET, 10 s timeout, `Config.SHEETS_ENDPOINT` + PIN-protected override.
  - [ ] 24.4 Live board UI: 15 s visibility-aware polling, version skip, row-diff animations, NEW flash, LIVE / SYNCING / OFFLINE pill, All-time / Season toggle.
  - [ ] 24.5 Results: background submit, then global rank and percentile chips; offline outbox with backoff and idempotent `sessionId`.
  - [ ] 24.6 Consent-aware payloads (entry-only without remote consent; Guest never submitted).
  - [ ] 24.7 Add the step-by-step Sheets/Apps Script deployment, API contract, privacy and quota caveats to the README manual.
  - [ ] 24.8 Test: two devices on the deployed URL see each other's scores within 30 s; offline submit syncs on reconnect; invalid score rejected and logged.
