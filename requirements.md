# Requirements — intelliCARE Music Play-a-Long

## Introduction

**intelliCARE Music Play-a-Long** is a fluid, gamified web app (Guitar Hero / Rock Band style) in which the user watches a music-performance video and finger-drums along on an on-screen 5-pad kit. Falling note "gems" on a highway tell the user which pad to hit and when. Every hit triggers a synthesised drum sound and a coloured visualisation above the pads. The app never covers the video.

- **App title:** intelliCARE Music Play-a-Long
- **Launch song:** 心跳的花蕾 | Buds of a Heartbeat
- **Performed by:** Grace Liew 刘嘉意
- **Video source:** `https://d2yy42b28nebea.cloudfront.net/activity/5_S5_-_D3_MASTER_20260311_94c87043_20260311_4cc76ca0.mp4`
- **Primary target:** phone, portrait. **Secondary:** landscape on iPad / laptop / desktop.
- **Deployment:** GitHub Pages, vanilla HTML/CSS/JS, no build step, no npm, no runtime CDN dependencies.
- **Audience:** general users plus seniors in intelliCARE community sessions (needs a forgiving "Gentle" mode).

### Glossary

| Term | Meaning |
|---|---|
| Pad | A tappable on-screen drum zone. 5 pads: KICK, SNARE, HI-HAT, TOM, CYMBAL |
| Lane | Vertical column on the highway matching one pad |
| Gem / Note | A falling marker for one expected hit `{t, lane}` |
| Hit line | The horizontal "strike zone" where a gem should be hit |
| Beatmap / Chart | JSON list of notes with timings, generated offline from the song |
| Judgement | PERFECT / GREAT / GOOD / MISS rating of a hit's timing |
| Song time | `video.currentTime` corrected by the user calibration offset |
| Heartbeat Mode | The app's "Star Power" (score ×2 for a period) |

---

## Requirement 1 — Branding and song information

**User story:** As a user, I want to see what app and song I am playing so the experience feels polished and identifiable.

1. THE SYSTEM SHALL display the app title "intelliCARE Music Play-a-Long" on the start screen and in a compact header during play.
2. THE SYSTEM SHALL display the song title as two lines/parts, "心跳的花蕾" and "Buds of a Heartbeat", and the credit "performed by Grace Liew 刘嘉意", on the start screen, the song card, the results screen and in a compact header strip during play.
3. THE SYSTEM SHALL render Chinese and English text with a system CJK font stack (`"PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif`) so no web font download is needed.
4. WHEN the header strip is shown during play THE SYSTEM SHALL keep it ≤ 32 px tall in portrait so it does not steal space from the pads.

## Requirement 2 — Video playback, never obstructed

**User story:** As a player, I want to see the full performance video while I drum.

1. THE SYSTEM SHALL embed the launch video with `<video playsinline webkit-playsinline preload="auto">` and no native controls during play.
2. THE SYSTEM SHALL NOT place any game element (pads, highway, particles, HUD, toasts, judgement text) over the video's rectangle in any mode or orientation. Only the pause menu and modal dialogs may cover it.
3. THE SYSTEM SHALL keep the video at its native 16:9 aspect ratio (`object-fit: contain`), letterboxing on a dark background if needed.
4. WHEN the user taps START THE SYSTEM SHALL begin video playback with sound from that user gesture (satisfying iOS/Android autoplay rules) and resume the AudioContext in the same gesture.
5. IF the video fails to load or stalls THEN THE SYSTEM SHALL show a non-blocking "Buffering…" indicator in the game area (not over the video), freeze the highway and pause judging until playback resumes.
6. THE SYSTEM SHALL provide a video volume slider and a drum-pad volume slider, independently.
7. THE SYSTEM SHALL pre-buffer: the START button shows a progress ring until `canplaythrough` fires or 8 s pass.

## Requirement 3 — Drum pads (5-pad kit, finger-drummable)

**User story:** As a player on a phone, I want pads that are big enough to hit accurately with my fingers and thumbs, without taking over the screen.

1. THE SYSTEM SHALL provide five pads: SNARE, HI-HAT, TOM, CYMBAL in a top row of four, and KICK as a full-width bar beneath them (Rock Band layout — kick is played with a thumb).
2. THE SYSTEM SHALL colour-code pads consistently everywhere (pads, lanes, gems, particles, stats):
   - KICK `#FF7A1A` (orange) · SNARE `#FF3B5C` (red) · HI-HAT `#FFD23F` (yellow) · TOM `#3D8BFF` (blue) · CYMBAL `#2EE6A6` (green)
3. Each top-row pad SHALL be ≥ 64 × 64 CSS px; the KICK bar SHALL be ≥ 48 px tall; gaps between pads SHALL be ≥ 8 px.
4. In portrait, the whole pad block (4 pads + kick + gaps) SHALL occupy ≤ 24 % of viewport height and never exceed 190 px.
5. THE SYSTEM SHALL support simultaneous multi-touch hits (e.g. kick + cymbal) using Pointer Events, each `pointerId` tracked independently.
6. THE SYSTEM SHALL fire a pad on `pointerdown` (not `click`), with `touch-action: none`, no long-press menu, no text selection, no double-tap zoom, no pull-to-refresh while playing.
7. WHEN a pad is hit THE SYSTEM SHALL play that pad's drum sound within one audio render quantum and show a press animation (scale 0.94, glow) for ≥ 80 ms.
8. THE SYSTEM SHALL support desktop keyboard: SNARE `D`, HI-HAT `F`, TOM `J`, CYMBAL `K`, KICK `Space`; alternates `A S L ;` and `B`/`N` for kick. Show key labels on pads only when a keyboard is detected (first `keydown`).
9. THE SYSTEM SHALL optionally accept Web MIDI input (e-drum kits / pad controllers) using General MIDI drum notes, where supported, with no permission prompt until the user enables it in Settings.
10. THE SYSTEM SHALL offer a "4-pad mode" (merges TOM into SNARE lane and hides TOM pad) for beginners/seniors.
11. WHERE the device supports `navigator.vibrate` THE SYSTEM SHALL emit a 10–15 ms haptic tick on each hit (toggle in Settings; iOS Safari has no support — fail silently).

## Requirement 4 — Drum sounds

**User story:** As a player, I want realistic, punchy drum sounds with no lag.

1. THE SYSTEM SHALL synthesise all five drum voices in Web Audio at runtime (oscillators + noise + envelopes + filters) so no sample files are required. Optionally, short base64-embedded one-shot samples MAY replace synthesis if they sound better (each ≤ 30 KB).
2. THE SYSTEM SHALL create the AudioContext with `latencyHint: "interactive"`.
3. THE SYSTEM SHALL apply velocity-free but slightly randomised (±3 % pitch, ±1.5 dB) playback to avoid a machine-gun effect.
4. Hi-hat hits SHALL choke (cut) any ringing open-hat/cymbal tail of the hi-hat voice; cymbal tails SHALL ring ≥ 1.2 s.
5. THE SYSTEM SHALL route all pad audio through a master bus → compressor → `AnalyserNode` → destination, and the analyser SHALL drive the spectrum visualiser.

## Requirement 5 — Beat detection and beatmap (chart)

**User story:** As the content creator, I want the drum parts of the song detected automatically and turned into a playable chart, so I don't have to transcribe by hand.

1. THE SYSTEM SHALL use a pre-computed beatmap (JSON) as the primary source of notes. The beatmap SHALL be produced offline by a Python pipeline that runs in **Google Colab** (no local install), consisting of:
   a. download of the MP4 → extract audio (ffmpeg, 44.1 kHz mono WAV),
   b. drum-stem separation with **Demucs** (`htdemucs`) to isolate drums from vocals/instruments,
   c. automatic drum transcription of the drum stem with **ADTOF** (5 classes: kick, snare, toms, hi-hat, cymbals → MIDI),
   d. tempo, beat and downbeat tracking with **librosa** (and/or madmom) for BPM, bar lines and section markers,
   e. post-processing (de-duplication, min-gap per lane, quantise-to-grid option, difficulty reduction) → `beatmap.json` matching the schema in design.md.
2. THE SYSTEM SHALL embed the final beatmap inline in `index.html` (a `<script type="application/json" id="beatmap">` block) and also accept an external `beatmap.json` override via `?chart=` URL param or file drop in Editor mode.
3. THE SYSTEM SHALL contain a **fallback in-browser auto-charter** that, if no beatmap is present AND the video is CORS-readable, decodes the audio with `fetch` + `decodeAudioData` + `OfflineAudioContext`, splits bands (kick < 150 Hz, snare/tom 150–2 kHz, hats/cymbals > 6 kHz), computes spectral-flux onsets with adaptive thresholding, and produces an approximate chart. It SHALL show the label "Auto-chart (approximate)".
4. IF the video is not CORS-readable THEN THE SYSTEM SHALL disable the in-browser auto-charter with an explanatory message and SHALL NOT connect the `<video>` to Web Audio via `createMediaElementSource` (doing so would mute a cross-origin video).
5. THE SYSTEM SHALL provide a **Chart Editor** (Requirement 11) so automatic transcription errors can be corrected by hand.
6. THE SYSTEM SHALL generate three difficulties from one full chart:
   - **Gentle** (seniors/beginners): KICK + SNARE only, ≤ 1 note per beat, wider timing windows.
   - **Groove** (normal): 4 pads (toms folded into snare), hi-hat thinned to ≤ 8th notes.
   - **Fire** (hard): all 5 pads, full transcription.
   Pre-generated difficulties in the JSON take precedence; otherwise the app derives them at load time.

## Requirement 6 — Note highway and play guide

**User story:** As a player, I want to see clearly which pad to hit next and exactly when.

1. THE SYSTEM SHALL render a note highway (Canvas 2D) in the space between video and pads, with one lane per active pad aligned horizontally with its pad. KICK notes SHALL render as a full-width orange bar across all lanes (Rock Band convention).
2. Gems SHALL travel from the top of the highway to the hit line just above the pads, arriving exactly at their `t`. Default approach time 1.8 s; "Note Speed" setting 1.0–3.0 s.
3. THE SYSTEM SHALL use a subtle perspective (lanes narrow toward the top, gems scale 0.6 → 1.0) for a Guitar Hero feel, with an option for flat 2D.
4. THE SYSTEM SHALL draw beat lines (thin) and bar lines (thicker) from the beatmap's beat grid, scrolling with the notes.
5. WHEN a gem is within 250 ms of the hit line THE SYSTEM SHALL brighten the matching pad's rim as a "get ready" cue.
6. THE SYSTEM SHALL show a 3-2-1 count-in synced to the song's beat grid before the first note, and a "Section" label (e.g. Intro / Verse / Chorus) from the beatmap when sections change.
7. In portrait the highway SHALL be ≥ 22 % of viewport height; if the screen is too short, the video shrinks first (never below 40 % of width-derived height), then the highway, never the pads below their minimum.

## Requirement 7 — Hit judging and scoring

**User story:** As a player, I want fair, responsive judging and a score that rewards accuracy and streaks.

1. THE SYSTEM SHALL judge each pad press against the nearest unjudged note in that lane within the GOOD window:

   | Judgement | Groove/Fire window | Gentle window | Base points |
   |---|---|---|---|
   | PERFECT | ±45 ms | ±70 ms | 300 |
   | GREAT | ±90 ms | ±130 ms | 200 |
   | GOOD | ±135 ms | ±200 ms | 100 |
   | MISS | note passes +GOOD window unhit | — | 0, breaks combo |

2. A press with no note in range SHALL play the sound and show the visual, but count as a "stray"; strays SHALL NOT break combo in Gentle, and SHALL cost −20 points (floor 0) and break combo in Fire only.
3. THE SYSTEM SHALL compute timing from a high-resolution song clock (design.md §4), corrected by the user's calibration offset, and record each hit's signed error (ms).
4. Combo multiplier: ×1 (0–9), ×2 (10–19), ×3 (20–29), ×4 (30+). Score = base × multiplier × (Heartbeat Mode ? 2 : 1).
5. THE SYSTEM SHALL display score, combo, multiplier and live accuracy % in a compact HUD bar between the video and highway (≤ 36 px tall in portrait).
6. THE SYSTEM SHALL show judgement text (PERFECT / GREAT / GOOD / MISS) and "EARLY"/"LATE" sub-label above the struck lane, animated (pop + fade 400 ms), never over the video.

## Requirement 8 — Visualisations on hit

**User story:** As a player, I want every hit to explode with colour so drumming feels rewarding.

1. WHEN a pad is hit THE SYSTEM SHALL, in its colour, above the pad: (a) flash the lane from the hit line upward (gradient, 150 ms), (b) emit a particle burst (12–30 particles, more for PERFECT), (c) draw an expanding ring ripple at the hit line.
2. KICK hits SHALL additionally pulse the whole highway floor and apply a 2–3 px screen-shake to the game area only (not the video) — disable under `prefers-reduced-motion`.
3. CYMBAL hits SHALL emit a wide shimmering sparkle arc.
4. THE SYSTEM SHALL draw a live audio-spectrum strip (32–48 bars, pad-coloured gradient) behind the hit line, driven by the pad-audio analyser.
5. A "heartbeat" pulse (subtle glow on the highway frame) SHALL beat on every quarter note from the beat grid, tying into the song title.
6. Heartbeat Mode active SHALL turn the highway pink/sakura (`#FF6FB5`) with floating blossom/bud particles.
7. Particle count SHALL auto-reduce if frame time > 20 ms for 30 consecutive frames (adaptive quality).

## Requirement 9 — Gamification

**User story:** As a player, I want goals, rewards and reasons to replay.

1. **Heartbeat Mode (Star Power):** specially flagged "bud" notes (every ~8th bar phrase, flagged in the beatmap or auto-picked) glow pink; hitting all bud notes in a phrase adds 25 % to a Heartbeat meter. At ≥ 50 %, a pulsing "♥" button appears beside the HUD (or user hits KICK + CYMBAL together / presses `Enter`) to activate ×2 score that drains over ~8 bars.
2. **Rock meter:** a health bar that rises with hits and falls with misses. In Fire, empty meter = "Song Failed" (with "Continue in Practice" option). In Gentle/Groove, the song never fails.
3. **Results screen:** score, grade (S ≥ 95 % accuracy, A ≥ 90, B ≥ 80, C ≥ 70, D below), 1–5 stars (based on score vs max possible), max combo, counts per judgement, per-pad accuracy bars, early/late histogram, "Full Combo" badge, new-best banner.
4. **Achievements** (stored in `localStorage`), shown as toast in the game area when earned: First Beat, 50 Combo, 100 Combo, Full Combo, Perfect Kick (all kick notes PERFECT/GREAT), Heartbeat Hero (activate Heartbeat Mode 3× in one song), Steady Hands (≥ 90 % in Gentle), Fire Starter (clear Fire), Comeback (recover from < 20 % rock meter).
5. **Leaderboards:**
   - **Boards:** Song score (per difficulty), Accuracy %, Max Combo, Reflex Test (SRT, CRT) and Rhythm Index.
   - **Filters:** All / My age band / My gender / This week / Today (facilitator session).
   - **Entries:** rank, avatar colour, nickname, age band, value and date. The player's own row is highlighted and pinned when outside the top 10, and the podium (top 3) is animated.
   - **Storage:** local boards in `localStorage` by default; optional remote boards (Phase 2) via Google Apps Script → Google Sheets, shared across devices in a session.
6. **XP & player level:** XP = score / 100 accumulated across sessions; level badge shown on the start screen.
7. **Streak bonus toasts:** "ON FIRE!" at 30 combo, "UNSTOPPABLE!" at 60, "HEARTBEAT!" at 100.

## Requirement 10 — Game modes

1. **Play** — full song, scored.
2. **Practice** — playback speed 0.5× / 0.75× / 1× (via `video.playbackRate` with `preservesPitch = true`), section loop (choose a section or set A–B points), no fail, no leaderboard.
3. **Free Jam** — no notes, no scoring; just drum along to the video with full visuals.
4. **Demo (Auto-play)** — the app plays the chart perfectly, showing what correct play looks like.
5. **Calibration** — see Requirement 12.

## Requirement 11 — Chart Editor (creator tool)

**User story:** As the content creator, I want to correct the auto-generated chart and create charts for future songs without coding.

1. THE SYSTEM SHALL provide an Editor mode (hidden behind `?editor=1` or a long-press on the logo) showing a horizontal, zoomable timeline with 5 lanes under the video, a playhead synced to the video, beat/bar grid lines and the waveform of the drum stem if a `drums.wav`/peaks file is provided.
2. Editor SHALL support: tap-record (play pads along with the video to record notes into the chart), add/delete/drag notes, snap-to-grid (1/4, 1/8, 1/16, triplets, off), select range + delete, undo/redo (≥ 50 steps), set sections, flag bud notes, global offset nudge (±1 ms steps), and quick difficulty auto-generation.
3. Editor SHALL import/export `beatmap.json` (file picker + download) and copy-to-clipboard the inline `<script>` block for pasting into `index.html`.

## Requirement 12 — Latency calibration

**User story:** As a player on any device, I want hits to line up with what I hear and see.

1. THE SYSTEM SHALL provide a calibration screen: a metronome click at 100 BPM plus a flashing pulse; the user taps any pad for 16 beats; the app computes the median offset (discarding outliers > 150 ms) and stores it as `inputOffsetMs` in `localStorage`.
2. THE SYSTEM SHALL provide a manual "Audio/Video offset" slider (−200 to +200 ms) in Settings.
3. THE SYSTEM SHALL prompt the user to calibrate on first launch (skippable) and recommend wired headphones / device speaker over Bluetooth (Bluetooth adds 150–300 ms).

## Requirement 13 — Layout and responsiveness

1. **Portrait (primary, phones):** vertical stack — [compact header 32 px] → [video, full width, 16:9] → [HUD bar 36 px] → [highway, flex-fill] → [pad block]. No vertical scrolling during play. Use `100dvh` and safe-area insets (`env(safe-area-inset-*)`).
2. **Landscape (tablets/desktop):** two columns — video on the left (≈ 60–65 % width, vertically centred, with song info below it) and game column on the right (HUD → highway → pads). The video is never overlaid.
3. **Landscape on short phones (height < 480 px):** same two-column layout with smaller pads (min 52 px) and header hidden.
4. THE SYSTEM SHALL re-layout live on resize/orientation change without restarting the song.
5. THE SYSTEM SHALL support fullscreen (Fullscreen API where available, with a button) and request a Screen Wake Lock during play.
6. THE SYSTEM SHALL work in Safari iOS 16+, Chrome Android 110+, Chrome/Edge/Firefox desktop latest.

## Requirement 14 — Visual design

1. THE SYSTEM SHALL use a dark, neon, glossy "music game" aesthetic: deep navy-to-black background (`#07070F` → `#12102A`), glowing lane colours, glass-morphism panels, smooth 60 fps motion.
2. The start screen SHALL show a song card (video poster frame, bilingual title, performer, difficulty selector with star ratings, best score/grade per difficulty), big PLAY button, and secondary buttons (Practice, Free Jam, Demo, Calibrate, Settings, Achievements, Leaderboard).
3. All buttons ≥ 44 px touch target; contrast ≥ 4.5:1 for text.
4. Animations SHALL respect `prefers-reduced-motion`.

## Requirement 15 — Pause, resume and lifecycle

1. THE SYSTEM SHALL provide a pause button in the HUD and pause on `Escape`/`P`.
2. WHEN the page becomes hidden (`visibilitychange`) THE SYSTEM SHALL auto-pause video, audio and judging.
3. On resume THE SYSTEM SHALL show a 3-2-1 countdown and rewind 2 s so the player can re-enter.
4. Pause menu: Resume, Restart, Settings, Quit to menu.

## Requirement 16 — Settings and persistence

1. Settings (persisted in `localStorage` under key `icmpal.v1`): difficulty, 4-pad mode, note speed, perspective on/off, video volume, pad volume, offset, haptics, reduced effects, show key labels, MIDI input, language of UI labels (EN / 中文).
2. Bilingual UI labels (English / Simplified Chinese) switchable in Settings; default from `navigator.language`.

## Requirement 17 — Performance and quality

1. THE SYSTEM SHALL maintain ≥ 55 fps on a mid-range 2022 phone (e.g. iPhone 12, Pixel 6) in portrait.
2. Canvas backing store SHALL use `devicePixelRatio` capped at 2.
3. Input-to-sound latency (excluding device output latency) SHALL be < 15 ms; input handling must never wait for the render loop.
4. `index.html` (excluding video) SHALL be ≤ 600 KB.
5. No console errors in production. All code in one `index.html` (inline CSS/JS) unless the design allows the optional `beatmap.json`.

## Requirement 18 — Optional data logging (Phase 2)

1. WHERE a Google Apps Script URL is configured THE SYSTEM SHALL POST a session record (timestamp, anonymous player ID, nickname, age, gender, difficulty, score, accuracy, max combo, per-pad accuracy, confusion matrix, timing metrics, test results from R21–R22) for intelliCARE engagement tracking and cohort norm building (R23). Off by default; only sent when the player has given consent (R20.4).

## Requirement 19 — Extended gamification and performance feedback

**User story:** As a player, I want rich feedback on how accurately I played each drum and lots of goals to chase, so I keep improving and keep coming back.

1. **Pad accuracy vs expected drum.** THE SYSTEM SHALL track, for every note, which pad was *expected* and which pad was *actually hit*:
   - Correct-pad hits are judged as in R7.
   - A press on the wrong pad while a note on another lane is inside its GOOD window SHALL count as a **wrong-pad hit** (recorded as expected → played) and break combo in Groove/Fire.
   - Unhit notes are recorded as expected → none.
2. **Results — accuracy breakdown.** The results screen SHALL show, per pad:
   - accuracy % (hits ÷ expected notes) as coloured bars, plus PERFECT/GREAT/GOOD/MISS counts,
   - a **5 × 6 confusion matrix** heatmap (expected pad × played pad / none), with the most common mistake called out (e.g. "You hit HI-HAT when CYMBAL was expected 9 times"),
   - mean signed timing error per pad (ms) with an EARLY/LATE label ("You rush the snare by 28 ms"),
   - a **song accuracy timeline** (accuracy per bar, coloured by section) showing where the player struggled.
3. **Coaching tips.** THE SYSTEM SHALL generate 1–3 rule-based tips from the metrics (e.g. timing bias > 25 ms; a pad below 70 %; chord simultaneity > 40 ms; most-missed section) and suggest a Practice loop for the weakest section in one tap.
4. **Live per-pad accuracy** SHALL show as a thin ring around each pad that fills green → amber → red during play (togglable; off in Gentle by default).
5. **Pad mastery.** Each pad SHALL have a mastery level (Bronze → Silver → Gold → Platinum → Diamond) from that pad's lifetime accuracy and hit count; shown on the profile and as a small badge on the pad.
6. **Ranks / titles** by player XP level: Rookie → Groove Starter → Beat Keeper → Rhythm Master → Heartbeat Legend.
7. **Daily challenges** (3 per day, seeded from the date so all players get the same ones), e.g. "Hit 50 kick notes PERFECT", "Get a 40 combo on Groove", "Score ≥ 85 % on the chorus". Rewards: XP and coins.
8. **Day streak:** count consecutive days played; bonus XP at 3, 7 and 30 days; streak flame on the start screen.
9. **Coins and unlockables:** coins earned from score, challenges and achievements unlock cosmetic **pad skins** (Neon, Wood, Crystal, Sakura), **highway themes** (Night City, Sakura Garden, Galaxy) and **hit-effect styles** (Sparks, Petals, Hearts). Cosmetic only, no effect on scoring.
10. **Ghost of your best:** during play, a small marker on the HUD shows whether the current score is ahead of or behind the player's personal best at the same song time (+1,240 / −560).
11. **Personal progress:** a profile page with charts over sessions of score, accuracy, mean asynchrony, timing variability, reaction time (R21) and Rhythm Index (R22).
12. **Expanded achievements** (add to R9.4): Sharpshooter (no wrong-pad hits in a song), Metronome (timing SD < 30 ms), Lightning Reflexes (simple RT better than own age-band median), Twin Strike (20 chord hits within 20 ms), Section Master (≥ 95 % on every section), Streak 7, Collector (unlock 5 cosmetics). Shown in a gallery with locked silhouettes and progress bars.
13. **Session summary card:** a shareable 1080 × 1920 PNG (canvas render) with nickname, song, grade, score, accuracy, best pad and achievements. No age/gender on it unless the player opts in.

## Requirement 20 — Player profiles

**User story:** As a player, or a facilitator running a community session on a shared iPad, I want each person to have a profile so scores, progress and norm comparisons are personal.

1. THE SYSTEM SHALL ask for a player profile before first play, with these fields:
   - **Nickname** (2–16 characters, profanity-filtered, required),
   - **Age** in years (5–100, required for norm comparisons),
   - **Gender** (Male / Female / Other / Prefer not to say),
   - optional **dominant hand** (Left / Right),
   - optional **musical experience** (None / < 2 years / 2–5 years / > 5 years), a known factor in synchronisation performance.
2. THE SYSTEM SHALL support several local profiles on one device with a quick "Who's playing?" picker (avatar colour + nickname), add / edit / delete, and a **Guest** profile that is not ranked or normed.
3. THE SYSTEM SHALL derive an **age band** from age: 5–12, 13–17, 18–29, 30–39, 40–49, 50–59, 60–69, 70–79, 80+.
4. **Consent and privacy (Singapore PDPA 2012):**
   - Before age and gender are collected, a short notice SHALL explain why (norm comparison) and where the data is stored (device only, unless remote logging is on).
   - A separate opt-in checkbox SHALL be required for remote logging.
   - For under-18 players, guardian/facilitator confirmation SHALL be required.
   - Players SHALL be able to export (JSON) and delete their profile and data.
5. Each profile SHALL get a random anonymous `playerId` (UUID v4); the nickname is display-only.

## Requirement 21 — Reflex Test (reaction time)

**User story:** As a player, I want to measure my reaction time on the drum pads and see how it compares with people of my age and gender.

1. THE SYSTEM SHALL provide a **Reflex Test** mode using the pad layout:
   - **Simple RT (SRT):** a single pad (always the SNARE) lights up after a random foreperiod of 1.0–3.0 s; the player hits it as fast as possible. 5 practice trials + 20 test trials.
   - **4-Choice RT (CRT):** one of the four top pads lights up at random (balanced, no more than 3 repeats in a row); the player hits that pad. 5 practice trials + 20 test trials. Wrong pad = error.
2. Stimulus onset SHALL be time-stamped on the frame it is actually painted (`requestAnimationFrame` timestamp after the class change, double-rAF). RT = `pointerdown.timeStamp − onset`.
3. Responses < 100 ms SHALL be anticipations and > 1500 ms (SRT) / 2000 ms (CRT) lapses; both are excluded and repeated (max 5 repeats). A press during the foreperiod SHALL show "Too early!" and restart the trial.
4. The test SHALL report median RT, mean RT, SD, coefficient of variation (intra-individual variability), CRT error rate, and the number of anticipations/lapses.
5. The test SHALL be gamified: a "lightning" combo for consecutive trials faster than the player's median, a speed gauge, a rank badge, and its own leaderboard.
6. THE SYSTEM SHALL note on the results that browser and touchscreen latency add a device-dependent delay (typically tens of ms) and that results are **indicative, not clinical**.

## Requirement 22 — Rhythm and coordination metrics

**User story:** As a player, I want a measure of my rhythm and multi-limb coordination, not just a game score.

1. **Beat Sync Test** (adapted from paced finger tapping in BAASTA): a metronome at 600 ms inter-onset interval (100 BPM); 4 lead-in clicks then 40 taps on any pad; then the same at 450 ms. Report mean signed asynchrony (ms), SD of asynchrony (ms) and synchronisation consistency *R* (0–1, from circular statistics).
2. **In-song metrics** (from every Play session, correct-pad hits only):
   - mean signed asynchrony and its SD, across all pads and per pad,
   - consistency *R*, using the local beat interval from the beatmap,
   - **chord simultaneity error**: mean |Δt| between the two hits of notes charted at the same time (e.g. kick + cymbal),
   - **limb independence ratio**: accuracy on chord notes ÷ accuracy on single notes,
   - **pattern accuracy** per section.
3. **Rhythm Index (0–100)** and **Coordination Index (0–100)** SHALL be computed as described in design.md §19 and shown on the results and profile pages, with the formula available in an "How is this calculated?" info sheet.
4. All metric formulas SHALL be documented in the README manual (R24).

## Requirement 23 — Norm-referenced scores

**User story:** As a player or facilitator, I want my reaction time and coordination compared with norms for my age band and gender.

1. THE SYSTEM SHALL compare SRT, CRT, Beat Sync SD, Rhythm Index and Coordination Index against two sources:
   - **Literature reference values** from a `NORMS` config block (design.md §20). Each entry SHALL carry its citation, table/page reference, sample, and a `verified` flag. Kiro SHALL NOT invent numeric norm values: fields are shipped as `null` with source pointers until filled from the cited papers and marked `verified: true`. If they are null or unverified, the UI SHALL show "Literature norms pending" instead of a comparison.
   - **Cohort norms** built from logged sessions (R18): percentiles by age band × gender once n ≥ 30 in that cell, otherwise by age band only (n ≥ 30), otherwise "Not enough data yet (n = k)". Computed by the Apps Script and cached in the app (refreshed at most daily), or computed locally from all profiles on the device for offline sessions.
2. THE SYSTEM SHALL display the result as:
   - a percentile ("Faster than 72 % of players aged 60–69"),
   - a z-score,
   - a 5-level band (Well below / Below / Average / Above / Well above average) on a horizontal bell-curve graphic with the player's marker,
   - the n and the source of the norm.
3. "Other" and "Prefer not to say" players SHALL be compared with the combined-gender norms for their age band.
4. Norm feedback SHALL use encouraging, non-diagnostic wording and include the line "For fun and engagement — not a medical or clinical assessment."
5. A facilitator view (PIN-protected) SHALL list all local profiles with their latest metrics and norm bands, and export them as CSV.

## Requirement 24 — README as a technical and scientific manual

**User story:** As the project lead, I want a professional README that works as both a technical manual and a scientific manual, so the app can be handed over, cited, reviewed and used in research and teaching.

1. Kiro SHALL produce `README.md` as a formal **Technical and Scientific Manual**, written in a professional, scholarly register, with the structure in design.md §21.
2. The manual SHALL document every scientific and technical detail: the audio pipeline (source separation, drum transcription, onset detection, beat tracking), the timing model and latency handling, judging windows, scoring, every metric formula (with equations), the norm methodology, validity, reliability and limitations, data protection, architecture, deployment, user and facilitator guides, testing and maintenance.
3. All in-text citations and the reference list SHALL follow **APA 7th edition**, including DOIs as `https://doi.org/...` URLs where they exist.
4. Kiro SHALL cite only the sources in design.md §21.3 (the vetted reference list). It may add others only if it can give a working DOI or URL, and must mark any added reference `[to verify]` for human review.
5. The manual SHALL include a version history table, a glossary, a list of equations and figures, and appendices (beatmap schema, settings keys, data dictionary for logged fields, norm config format).
6. Kiro SHALL also produce `tools/README.md` (chart-generation guide) and keep the user-facing "How to play" in-app.

## Requirement 25 — Live global leaderboard via Google Sheets

**User story:** As a player using the deployed URL on any device, I want my scores to appear on a shared live leaderboard that everyone else sees too.

> This requirement makes the remote leaderboard and session logging **core (Phase 1)**. It builds on R9.5, R17/R18 and R23. Local `localStorage` boards stay as the offline fallback.

1. **Backend.** THE SYSTEM SHALL use a Google Sheet as the database and a Google Apps Script **Web App** as its API. The Web App is deployed with *Execute as: Me* and *Who has access: Anyone*, so any visitor to the GitHub Pages URL can read and submit without a Google sign-in.
2. **Configuration.** The Web App `/exec` URL SHALL be one constant, `Config.SHEETS_ENDPOINT`, in `index.html`. A facilitator SHALL be able to override it in a PIN-protected Settings field (stored in `localStorage`). If it is empty, the app SHALL run local-only with no errors.
3. **Submitting.**
   - At the end of every ranked run (Play, Reflex Test, Beat Sync; not Practice, Free Jam, Demo or Guest), the app SHALL POST the SessionRecord (design §18), provided the player has remote consent (R20.4).
   - Players without remote consent SHALL post only a leaderboard entry: nickname, age band, gender code and scores. No exact age is sent.
4. **Live updates.**
   - While the Leaderboard screen or the Results screen is open, THE SYSTEM SHALL refresh the board from the Sheet every 15 s, and immediately after the player's own submission.
   - Changed rows SHALL animate (slide and glow), and new entries SHALL flash "NEW".
   - A status pill SHALL show **● LIVE** (green), **◌ SYNCING** (amber) or **○ OFFLINE** (grey), with the time of the last update.
   - Polling SHALL pause when the tab is hidden.
5. **Rank feedback.** After submitting, the results screen SHALL show the player's **global rank** and percentile on each board ("#7 of 312 worldwide · #2 in age 60–69 this week"), returned by the API in the same response.
6. **Boards and filters:** the same boards and filters as R9.5, served by the API. Plus an **All-time / Season** toggle, where seasons are defined in a `Config` sheet tab and a facilitator can reset them.
7. **Offline outbox.** IF a submission fails THEN THE SYSTEM SHALL queue it in `localStorage` (`icmpal.v1.outbox`). It retries with exponential backoff (5 s → 5 min) and on the `online` event, and shows "Saved offline — will sync". Submissions are idempotent: the server dedupes by `sessionId`.
8. **Validation and anti-abuse (server side):**
   - reject entries whose score exceeds the chart's maximum possible score for that difficulty (stored in the `Charts` tab), or whose accuracy, RT or combo values are out of range,
   - rate-limit to 1 submission per `playerId` per 20 s and 60 per day,
   - apply a profanity filter and length rules to nicknames,
   - let a facilitator hide any row by ticking a `hidden` checkbox in the Sheet.
   The manual SHALL state that a client-side game cannot fully prevent score tampering.
9. **Privacy on public boards:** only nickname, avatar colour, age band, gender code (if the player allows it), value and date are ever returned by the API. Raw SessionRecords and exact ages are never readable through the public endpoint.
10. **Norms feed:** the same API serves the aggregated cohort percentile tables for R23 (`action=norms`), recomputed by a time-driven trigger every hour.
11. **Deliverables:**
    - Kiro SHALL produce `tools/apps_script.gs` (complete and commented).
    - Kiro SHALL produce `tools/sheets_template.md`: exact tab names, column headers in order, data validation and conditional formatting, plus a one-click `setup()` function in the script that creates all tabs and headers.
    - The README manual (R24) SHALL contain a step-by-step deployment section: create the Sheet → Extensions › Apps Script → paste the code → run `setup()` → Deploy › New deployment › Web app → copy the `/exec` URL into `Config.SHEETS_ENDPOINT` → commit → test. It SHALL also cover redeploying versions without changing the URL ("Manage deployments" › edit › new version).
