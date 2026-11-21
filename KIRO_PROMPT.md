# Kiro Prompt — intelliCARE Music Play-a-Long

> Paste this into Kiro chat (Spec mode). Put `requirements.md`, `design.md` and `tasks.md` in `.kiro/specs/music-play-a-long/` first so Kiro reads them as the spec.

---

Build **intelliCARE Music Play-a-Long**, a gamified, Guitar Hero / Rock Band–style finger-drumming web app, following the spec in `.kiro/specs/music-play-a-long/` (requirements.md, design.md, tasks.md). Execute `tasks.md` in order and tick tasks as you finish them.

**Song shown in the app**
- Title: **心跳的花蕾 | Buds of a Heartbeat**
- Performed by: **Grace Liew 刘嘉意**
- Video: `https://d2yy42b28nebea.cloudfront.net/activity/5_S5_-_D3_MASTER_20260311_94c87043_20260311_4cc76ca0.mp4`

**What it does**
- Plays the performance video, and the user drums along on 5 on-screen pads: SNARE, HI-HAT, TOM, CYMBAL (top row) and a full-width KICK bar underneath (thumb-friendly).
- Falling colour-coded gems on a perspective note highway show which pad to hit and when. Every hit plays a synthesised drum sound and fires a coloured visualisation (lane flash, particles, ripple, spectrum) **above the pads**.
- The drum part comes from a pre-computed beatmap produced offline in Google Colab (Demucs drum separation → ADTOF drum transcription → librosa beats). Also create that Colab notebook (`tools/beatmap_pipeline.ipynb`). Until the real chart is pasted in, ship a clearly labelled placeholder chart.
- Includes a Chart Editor (`?editor=1`) to fix the auto-chart and to tap-record charts for new songs.

**Hard constraints**
1. **Never cover the video.** Pads, highway, HUD, particles, judgement text and toasts sit below it (portrait) or beside it (landscape). Only pause/modal dialogs may overlay it.
2. **Portrait phone first** (vertical stack: header 32 px → 16:9 video → HUD 36 px → highway → pads). The pad block takes ≤ 24 % of the viewport height, max 190 px; pads ≥ 64 px, kick bar ≥ 48 px, gaps ≥ 8 px. **Landscape** for iPad/desktop: video ~62 % left, game column right.
3. **Vanilla HTML/CSS/JS in one `index.html`**: no frameworks, no npm, no build step, no CDN libraries, no web fonts. Deploys as-is on GitHub Pages. The video stays on CloudFront.
4. **Low-latency input:** Pointer Events `pointerdown` with multi-touch, `event.timeStamp` for judging, sound triggered synchronously in the handler, Web Audio `latencyHint: "interactive"`. Keyboard `D F J K` + `Space` for desktop.
5. **Timing:** interpolated song clock from `requestVideoFrameCallback` + `performance.now()`, plus a user calibration offset (tap-along calibration screen).
6. Do **not** connect the `<video>` to Web Audio with `createMediaElementSource` (the cross-origin video would go silent). The spectrum visualiser uses the pad-sound analyser.
7. ≥ 55 fps on a mid-range phone; DPR capped at 2; sprite-based gems; pooled particles; adaptive quality; `prefers-reduced-motion` respected.

**Gamification:** PERFECT/GREAT/GOOD/MISS with EARLY/LATE, combo multiplier ×1–×4, rock meter, **Heartbeat Mode** (Star Power: pink sakura theme, ×2 score), grades S–D, 1–5 stars, Full Combo, achievements, local leaderboard with arcade initials, XP/levels, streak toasts. Difficulties: **Gentle** (kick + snare, forgiving windows, made for seniors), **Groove** (4 pads), **Fire** (all 5). Modes: Play, Practice (0.5×/0.75×/1× speed, section and A–B loop), Free Jam, Demo auto-play, Calibration.

**Accuracy and feedback:**
- Track the expected pad against the pad actually hit for every note: wrong-pad hits and a 5 × 6 confusion matrix.
- Per-pad accuracy and EARLY/LATE timing bias, and a bar-by-bar accuracy timeline.
- Rule-based coaching tips, with a one-tap practice loop on the weakest section.

**More gamification:**
- Live per-pad accuracy rings, pad mastery tiers (Bronze → Diamond) and rank titles.
- Date-seeded daily challenges, day streaks, coins and a cosmetic unlock shop (pad skins, highway themes, hit FX).
- A personal-best ghost delta in the HUD, an achievements gallery and a shareable results PNG.
- Leaderboards (score, accuracy, combo, reaction time, Rhythm Index) filtered by age band, gender, week and today.

**Player profiles:**
- Nickname, age, gender, plus optional dominant hand and musical experience.
- Multiple local profiles plus Guest, and a "Who's playing?" picker for shared iPads.
- PDPA consent notice, guardian confirmation for under-18s, and data export/delete.

**Science modes:**
- **Reflex Test:** simple and 4-choice reaction time on the pads.
- **Beat Sync Test:** metronome paced tapping at 600 and 450 ms.
- **In-song metrics:** mean asynchrony, SD, circular consistency R, chord simultaneity and limb independence.
- **Rhythm Index and Coordination Index.**
- **Norm comparison:** percentile, z-score, band and bell curve against age band × gender. Use literature norms only from the cited papers (ship them as null + `verified: false`; **never invent norm values**), plus cohort norms once n ≥ 30. Always label results "not a clinical assessment".

**README = Technical and Scientific Manual:**
- Write `README.md` as a professional scientific and technical manual following design.md §21: background science, the audio pipeline, the timing model, every metric equation, norm methodology, validity and limitations, PDPA, architecture, deployment, user and facilitator guides, and appendices.
- Use APA 7 citations and references, taken only from the vetted list in design.md §21.3.
- Every number in the manual must match the code.

**Live global leaderboard (Google Sheets):**
- Any visitor to the deployed GitHub Pages URL submits scores to a shared Google Sheet through an Apps Script Web App (Execute as Me, access Anyone).
- The endpoint is one constant, `Config.SHEETS_ENDPOINT`. To avoid CORS preflight, POST with `Content-Type: text/plain` and use plain GETs (design §22.2).
- Boards poll every 15 s with a LIVE pill, and the results screen shows your global rank.
- Failed submissions wait in an offline outbox and are deduped by `sessionId` on the server.
- The server validates scores, rate-limits submissions, filters nicknames and lets a facilitator hide rows. Public reads return nickname, age band and scores only.
- Deliver `tools/apps_script.gs` (with a `setup()` that builds the Sheet) and `tools/sheets_template.md`, and add the deployment steps to the README manual.

**Look and feel:** dark neon music-game aesthetic (navy-black background, glowing lanes, glass panels), lane colours KICK `#FF7A1A`, SNARE `#FF3B5C`, HI-HAT `#FFD23F`, TOM `#3D8BFF`, CYMBAL `#2EE6A6`, Heartbeat pink `#FF6FB5`. Bilingual EN / 中文 UI labels. The app title and the bilingual song title and performer must be clearly shown on the start screen, the in-game header and the results screen.

When finished, give me:
- the completed `index.html`,
- `tools/beatmap_pipeline.ipynb`, `tools/apps_script.gs`, `tools/sheets_template.md` and `tools/README.md`,
- `README.md` (the Technical and Scientific Manual),
- a short list of anything that needs device testing or human verification (references marked `[to verify]`, NORMS values to fill).
