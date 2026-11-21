# Design — intelliCARE Music Play-a-Long

## 1. Overview

A single-page, zero-dependency web app. The song's drum part is detected **offline** (Python in Google Colab: Demucs → ADTOF → librosa) and shipped as an inline JSON beatmap. At runtime the browser only plays the video, renders the highway on a canvas, synthesises drum sounds with Web Audio and judges hits against the video's clock.

Why offline rather than live detection: real-time drum transcription in a browser from a full mix is unreliable (vocals and instruments trigger false onsets) and the cross-origin video cannot be analysed unless the CDN sends CORS headers. Offline separation + transcription gives a far more accurate chart, and it can be hand-corrected in the built-in Editor.

```
┌──────────── OFFLINE (Google Colab, once per song) ────────────┐
│ MP4 ─ffmpeg→ WAV ─Demucs htdemucs→ drums.wav                  │
│                 ├─ADTOF→ drums.mid (kick/snare/tom/hh/cym)    │
│                 └─librosa→ BPM, beats, downbeats, sections    │
│ merge + clean + difficulties → beatmap.json (+ peaks.json)    │
└───────────────────────────────┬───────────────────────────────┘
                                ▼ paste inline / ?chart=
┌──────────────────── RUNTIME (index.html) ─────────────────────┐
│ <video> (CloudFront) ──currentTime──▶ SongClock               │
│ Pointer/Keyboard/MIDI ─▶ InputManager ─▶ DrumSynth (WebAudio) │
│                               └──────▶ Judge ─▶ Score/Game    │
│ Renderer (Canvas 2D, rAF): highway, gems, FX, spectrum        │
│ UI (DOM): screens, HUD, settings, results, editor             │
│ Storage (localStorage): settings, bests, achievements, XP     │
└───────────────────────────────────────────────────────────────┘
```

## 2. File structure

```
/ (GitHub Pages repo root)
├── index.html                 # entire app: inline CSS + JS + inline beatmap JSON
├── beatmap.json               # optional external copy / override (?chart=beatmap.json)
├── tools/
│   ├── beatmap_pipeline.ipynb # Google Colab notebook (Demucs + ADTOF + librosa)
│   └── README.md              # how to regenerate the chart for a new song
├── .kiro/specs/music-play-a-long/{requirements,design,tasks}.md
└── README.md
```

Inside `index.html`, organise JS as clearly separated modules (IIFE or `const Module = (() => {...})()` blocks) in this order: `Config`, `Storage`, `I18n`, `Beatmap`, `SongClock`, `DrumSynth`, `InputManager`, `Judge`, `Game`, `FX`, `Renderer`, `UI`, `Calibration`, `Editor`, `AutoCharter`, `App`.

## 3. Layout

### 3.1 Portrait (primary) — CSS grid on `#app`, height `100dvh`

```
┌──────────────────────────────┐
│ intelliCARE ♪ 心跳的花蕾 · Grace Liew 刘嘉意   ⏸ │ header 32px
├──────────────────────────────┤
│                              │
│        VIDEO 16:9            │ width 100vw → height 56.25vw
│   (nothing ever drawn here)  │
├──────────────────────────────┤
│ 128,400  ×3  COMBO 27  96.4% ♥│ HUD 36px  (+ rock meter 4px line)
├──────────────────────────────┤
│  ╲   │    │    │    ╱        │
│   ╲  ◆    │    │   ╱  highway │ flex: 1  (min 22vh)
│    ╲ │    ◆    │  ╱  (canvas) │ judgement text / particles live here
│ ═══════ hit line ═══════════ │
├──────────────────────────────┤
│ [SNARE][HI-HAT][ TOM ][CYMBAL]│ pads row  ≥64px
│ [          K I C K          ]│ kick bar  ≥48px
└──────────────────────────────┘ + safe-area-inset-bottom
```

```css
#app.portrait {
  display: grid;
  grid-template-rows: 32px auto 36px minmax(22vh, 1fr) auto;
  grid-template-areas: "header" "video" "hud" "highway" "pads";
  height: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}
#videoWrap { grid-area: video; aspect-ratio: 16/9; max-height: 40dvh; width: 100%; }
#pads      { grid-area: pads; max-height: min(24dvh, 190px); }
```

Shrink priority when height is short: video (down to `max-height: 30dvh`) → highway (to min 22dvh) → never pads below minimum.

### 3.2 Landscape (tablet / desktop)

```
┌───────────────────────────────┬────────────────────┐
│                               │ HUD                │
│          VIDEO 16:9           ├────────────────────┤
│                               │  highway (canvas)  │
│                               │                    │
├───────────────────────────────┤ ═══ hit line ═══   │
│ 心跳的花蕾 | Buds of a Heartbeat│ [S][H][T][C]       │
│ performed by Grace Liew 刘嘉意 │ [    KICK     ]    │
└───────────────────────────────┴────────────────────┘
        ~62% width                     ~38% width (min 340px)
```

```css
#app.landscape {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(340px, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas: "video hud" "info game";
}
```

Orientation is chosen by `matchMedia("(orientation: portrait)")` **and** aspect ratio; listen to `change` and `resize` (debounced 100 ms) and call `Renderer.resize()` without interrupting play.

### 3.3 Pad component

- DOM `<button class="pad" data-lane="snare">` elements (accessible, crisp text), absolutely no `click` handlers during play — only `pointerdown`/`pointerup`/`pointercancel`.
- Pads have: rounded rect 16px radius, inner gradient of lane colour at 25 % opacity, 2 px rim in lane colour, icon (inline SVG: drum, hat, tom, cymbal, kick-pedal) + label. Pressed = scale(0.94) + rim glow `box-shadow: 0 0 24px color`. "Get ready" = rim pulse.
- Pad x-centres are exported to the Renderer so lanes align exactly with the pads beneath them (recomputed on resize via `getBoundingClientRect`).

## 4. Song clock (timing core)

`video.currentTime` updates coarsely (often 15–250 ms steps). Use an interpolated clock:

```js
const SongClock = {
  anchorMedia: 0, anchorPerf: 0, rate: 1, playing: false,
  init(video) {
    const resync = (now, meta) => {
      // meta.mediaTime is the presentation time of the frame just shown
      this.anchorMedia = meta ? meta.mediaTime : video.currentTime;
      this.anchorPerf  = now;
      video.requestVideoFrameCallback?.(resync);
    };
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype)
      video.requestVideoFrameCallback(resync);
    else setInterval(() => resync(performance.now()), 50);   // fallback
    ['play','playing','pause','seeked','ratechange','waiting'].forEach(e =>
      video.addEventListener(e, () => { this.playing = !video.paused && video.readyState >= 3;
        this.rate = video.playbackRate; resync(performance.now()); }));
  },
  now(perfT = performance.now()) {                 // seconds, song time
    const t = this.playing ? this.anchorMedia + (perfT - this.anchorPerf) / 1000 * this.rate
                           : this.anchorMedia;
    return t - (Settings.offsetMs + Beatmap.offsetMs) / 1000;
  }
};
```

- Input events use `event.timeStamp` (same timebase as `performance.now()`) so judging uses the true touch time, not the time the handler ran.
- Smooth jitter: if the new anchor differs from the predicted time by < 30 ms, blend 20 % toward it rather than jumping (prevents gem jitter); if > 30 ms (seek/stall), snap.
- Practice speed changes `video.playbackRate`; `video.preservesPitch = true`. Beatmap times stay in song seconds, so no rescaling is needed; approach time in seconds is divided by rate for visual consistency.

## 5. Beatmap schema (`beatmap.json`)

```jsonc
{
  "version": 1,
  "song": {
    "title_zh": "心跳的花蕾",
    "title_en": "Buds of a Heartbeat",
    "artist": "Grace Liew 刘嘉意",
    "video": "https://d2yy42b28nebea.cloudfront.net/activity/5_S5_-_D3_MASTER_20260311_94c87043_20260311_4cc76ca0.mp4",
    "duration": 0.0,          // seconds
    "previewStart": 30.0
  },
  "offsetMs": 0,              // chart-level correction
  "bpm": 0.0,                 // global estimate
  "beats": [ 0.52, 1.04 ],    // seconds of every beat
  "downbeats": [ 0.52, 2.60 ],// bar starts
  "sections": [ { "t": 0.0, "name": "Intro" }, { "t": 18.2, "name": "Verse 1" } ],
  "lanes": ["kick","snare","hihat","tom","cymbal"],
  "charts": {
    "full":   [ { "t": 0.520, "l": "kick", "v": 0.9, "bud": false } ],
    "fire":   [],             // optional pre-baked; else derived from full
    "groove": [],
    "gentle": []
  },
  "meta": { "generator": "demucs-htdemucs + ADTOF + librosa", "created": "2026-11-21" }
}
```

`v` = normalised velocity 0–1 (used to size gems and FX slightly). `bud` = Heartbeat phrase note.

### 5.1 Difficulty derivation (runtime, if not pre-baked)

- **fire** = full, then enforce min gap 60 ms per lane.
- **groove** = full with `tom → snare`; hi-hat thinned: keep a hi-hat note only if it is within 40 ms of an 8th-note grid point; min gap per lane 110 ms; merge cymbal+hihat collisions into cymbal.
- **gentle** = kick + snare only (`tom → snare`), keep notes nearest to beat grid points, max 1 note per beat (prefer snare on beats 2 & 4, kick on 1 & 3), min gap 300 ms.
- **bud flags**: if none in data, flag all notes in every 8th bar of each chorus section (or every 8th bar if no sections).

## 6. Offline pipeline (tools/beatmap_pipeline.ipynb — Google Colab)

Runs entirely in Colab (GPU runtime recommended), so nothing is installed on the institution laptop.

```python
# Cell 1 — setup
!pip -q install demucs librosa pretty_midi soundfile
!pip -q install git+https://github.com/MZehren/ADTOF.git   # ADTOF drum transcription
!apt -qq install -y ffmpeg

VIDEO_URL = "https://d2yy42b28nebea.cloudfront.net/activity/5_S5_-_D3_MASTER_20260311_94c87043_20260311_4cc76ca0.mp4"
!wget -q -O song.mp4 "$VIDEO_URL"
!ffmpeg -y -loglevel error -i song.mp4 -vn -ac 2 -ar 44100 song.wav

# Cell 2 — isolate drums
!python -m demucs -n htdemucs --two-stems=drums song.wav -o sep
DRUMS = "sep/htdemucs/song/drums.wav"

# Cell 3 — PATH A: ADTOF transcription → drums.mid
# Follow ADTOF's bin/drumTranscriptor.ipynb for the exact call (API may change);
# run the pretrained 5-class model on DRUMS and write drums.mid.

# Cell 4 — PATH B (fallback, no ML): band-split onset detection on the isolated stem
import librosa, numpy as np, scipy.signal as sps
y, sr = librosa.load(DRUMS, sr=44100, mono=True)
def band_onsets(lo, hi, delta, wait_s):
    sos = sps.butter(4, [lo, hi] if lo else hi, btype='band' if lo else 'low', fs=sr, output='sos')
    yb = sps.sosfiltfilt(sos, y)
    env = librosa.onset.onset_strength(y=yb, sr=sr, hop_length=256)
    fr = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=256,
                                    backtrack=False, delta=delta, wait=int(wait_s*sr/256))
    return librosa.frames_to_time(fr, sr=sr, hop_length=256), env[fr]
# kick <150Hz, snare 180–2500Hz (+ noise 2–5k), hats 7–16kHz, cymbal = long high-band decay
# classify overlaps by band-energy ratios; tune delta per song.

# Cell 5 — tempo / beats / downbeats
y_mix, _ = librosa.load("song.wav", sr=22050, mono=True)
tempo, beat_frames = librosa.beat.beat_track(y=y_mix, sr=22050, units='frames')
beats = librosa.frames_to_time(beat_frames, sr=22050).round(3).tolist()
downbeats = beats[::4]      # refine by aligning with strongest kick per 4-beat group
# sections: librosa.segment.agglomerative on chroma/MFCC → ~6–10 boundaries, label manually after

# Cell 6 — MIDI → lanes → beatmap.json
import pretty_midi, json
GM = {**{p:'kick' for p in (35,36)}, **{p:'snare' for p in (37,38,39,40)},
      **{p:'tom' for p in (41,43,45,47,48,50)}, **{p:'hihat' for p in (42,44,46)},
      **{p:'cymbal' for p in (49,51,52,53,55,57,59)}}
pm = pretty_midi.PrettyMIDI("drums.mid")
notes = sorted(({"t": round(n.start, 3), "l": GM[n.pitch], "v": round(n.velocity/127, 2), "bud": False}
                for inst in pm.instruments for n in inst.notes if n.pitch in GM), key=lambda n: n["t"])
# de-dupe: same lane within 30 ms → keep first
# write beatmap per schema §5, plus peaks.json (drum-stem waveform peaks @ 100/s) for the Editor
```

Output: `beatmap.json`. Then paste into `index.html` via Editor's "Copy inline block" or upload to repo and use `?chart=beatmap.json`.

**Expected accuracy:** ADTOF on a separated stem is strong on kick/snare/hi-hat, weaker on toms/cymbals — so always do a quick pass in the Editor (Requirement 11).

## 7. Runtime in-browser AutoCharter (fallback)

Only when no beatmap exists and `fetch(video.src, {mode:'cors'})` succeeds (CloudFront CORS headers present). Steps: fetch → `decodeAudioData` → `OfflineAudioContext` with three `BiquadFilterNode` chains (lowpass 150 Hz; bandpass 1 kHz Q 0.7; highpass 6 kHz) → render → per band compute RMS frames (hop 512) → half-wave-rectified first difference (spectral flux proxy) → adaptive threshold (moving median × 1.5 + floor) → peak pick with per-band refractory (kick 120 ms, snare 120 ms, hat 70 ms) → map low→kick, mid→snare, high→hihat; high peaks with long decay (> 400 ms above 50 %) → cymbal. Run in a Web Worker (inline Blob worker) with progress bar. Label chart "Auto-chart (approximate)".

Never call `createMediaElementSource(video)` for a cross-origin video.

## 8. DrumSynth (Web Audio recipes)

All voices go → `voiceGain` → `padBus` (GainNode, user pad volume) → `DynamicsCompressor` (threshold −10, ratio 4) → `Analyser` (fftSize 256) → destination.

| Voice | Recipe |
|---|---|
| KICK | Sine osc, freq exp-ramp 150 → 45 Hz over 120 ms; gain 1 → 0.001 over 450 ms; plus 3 ms click (noise burst through highpass 3 kHz, gain 0.3) |
| SNARE | Triangle 185 Hz (gain 0.6 → 0 in 120 ms) + white noise → highpass 1.2 kHz → bandpass 3.5 kHz; noise gain 0.9 → 0 in 200 ms |
| HI-HAT (closed) | 6 square oscs at metallic ratios (40·[2, 3, 4.16, 5.43, 6.79, 8.21] Hz) → bandpass 10 kHz → highpass 7 kHz; gain 0.5 → 0 in 60 ms. Choke group: new hit stops previous |
| TOM | Sine 120 Hz → 80 Hz over 250 ms, gain 0.9 → 0 in 400 ms + subtle noise 5 % |
| CYMBAL (crash) | Same metallic bank + noise → highpass 5 kHz; attack 2 ms; gain 0.6 → 0 over 1.6 s exponential |

- Pre-generate one 2 s white-noise `AudioBuffer` at init; reuse it.
- Trigger at `ctx.currentTime` (no scheduling ahead for live hits).
- Demo/Auto-play schedules notes ahead with `ctx.currentTime + (note.t - SongClock.now())`.
- Random ±3 % detune and ±1.5 dB per hit.
- Unlock: on first gesture, `ctx.resume()` and play a 1-sample silent buffer (iOS).

## 9. Input

```js
padEl.addEventListener('pointerdown', e => {
  e.preventDefault();
  padEl.setPointerCapture(e.pointerId);
  Input.hit(lane, e.timeStamp, 'touch');        // synchronous: sound first, then judge, then FX queue
}, { passive: false });
```

- `Input.hit(lane, ts)` → `DrumSynth.play(lane)` → `Judge.evaluate(lane, SongClock.now(ts))` → push FX event to Renderer queue. Never wait for rAF.
- Keyboard: ignore `e.repeat`. MIDI: `navigator.requestMIDIAccess()` only after user enables; map GM pitch → lane (§6 table), `note-on` velocity > 0.
- Global: `document.addEventListener('touchmove', e => e.preventDefault(), {passive:false})` while in Play; CSS `overscroll-behavior: none; user-select: none; -webkit-touch-callout: none`.
- Chord help: KICK + any pad within 30 ms = a valid double; each judged separately.

## 10. Judge

```js
// notes per lane sorted by t; each lane keeps a moving pointer `next[lane]`
evaluate(lane, tHit) {
  const W = windows[difficulty];                 // {perfect, great, good} in seconds
  advanceMisses(tHit);                           // mark notes with t < tHit - W.good as MISS
  const note = nearestUnjudged(lane, tHit, W.good);
  if (!note) return stray(lane);
  const err = tHit - note.t;                     // + = late
  const a = Math.abs(err);
  const j = a <= W.perfect ? 'PERFECT' : a <= W.great ? 'GREAT' : 'GOOD';
  note.judged = j; note.err = err;
  Game.onJudge(j, lane, err, note);
}
```

Also call `advanceMisses(SongClock.now())` every frame. Auto-play marks every note PERFECT at its time.

## 11. Game state

```
BOOT → MENU ─┬→ CALIBRATE → MENU
             ├→ LOADING → COUNTIN → PLAYING ⇄ PAUSED → RESULTS → MENU
             ├→ PRACTICE (PLAYING with loop/speed, no fail)
             ├→ FREEJAM
             ├→ DEMO
             └→ EDITOR
```

`Game` holds: score, combo, maxCombo, multiplier, counts{PERFECT,GREAT,GOOD,MISS,stray}, perLane stats, errors[] (for histogram), rockMeter (0–1, start 0.5; +0.02 PERFECT, +0.015 GREAT, +0.008 GOOD, −0.04 MISS), heartbeatMeter (0–1), heartbeatActiveUntil (song time), achievementsThisRun.

Max possible score for stars: Σ(300 × ×4 after first 30 notes) without Heartbeat. Stars: ≥ 20/40/60/80/95 % of max → 1–5★.

## 12. Renderer (Canvas 2D)

One `<canvas id="highway">` filling the highway grid cell; DPR capped at 2; `ctx.setTransform(dpr,0,0,dpr,0,0)`.

Per frame (rAF):
1. `t = SongClock.now()`.
2. Background: vertical gradient; lane strips with 6 % lane-colour tint; heartbeat glow pulse (`exp(-((t - lastBeat)/0.12))`).
3. Perspective transform: `y` from 0 (top, far) to `hitY` (near). For progress `p = 1 - (note.t - t)/approach` (0..1): `screenY = hitY * p^1.6` (ease to compress far notes); lane x lerps from vanishing-point-scaled x to pad centre x; scale 0.6 + 0.4p.
4. Beat/bar lines from `beats` within window.
5. Gems: rounded capsules in lane colour with white top highlight + outer glow (pre-render each lane's gem to an offscreen canvas once — sprite blit, no per-frame shadowBlur). KICK = full-width orange bar. Bud notes: pink outline + small heart.
6. Hit line: glowing bar; lane targets as rings above each pad.
7. Spectrum strip behind hit line from `analyser.getByteFrequencyData`.
8. FX: lane flashes, ripples, particles (object pool of 400, no allocation in loop), judgement texts, combo milestone texts.
9. Screen shake offset applied to canvas transform only.

Adaptive quality: rolling average frame time > 20 ms for 30 frames → halve particles, disable spectrum; recover after 120 good frames.

## 13. UI screens (DOM overlays inside the game area or full-screen menus)

- **Menu:** animated neon background (CSS gradients + floating bud/heart particles), app title, song card, difficulty pills (Gentle ★, Groove ★★★, Fire ★★★★★) with best grade per pill, PLAY, mode buttons, level/XP bar, settings cog, language toggle EN/中文.
- **HUD:** score (tabular numerals, rolling counter animation), multiplier chip coloured by tier, combo, accuracy %, heartbeat ♥ button, rock meter thin bar, pause.
- **Pause / Settings / Results / Achievements / Leaderboard:** glass panels (`backdrop-filter: blur(16px)`, fallback solid). Results animate counts in sequence, then grade stamp with burst; initials entry if top 10.
- **Toasts:** achievements slide in at top of the highway area, 2.5 s.

## 14. Editor

- Layout: video top (same rule — no overlay), timeline canvas below (lanes horizontal rows, time left→right, zoom 50–800 px/s via pinch / ctrl+wheel), toolbar (Record ●, Snap ▾, Undo, Redo, Add section, Flag bud, Offset ±, Generate difficulties, Import, Export, Copy inline).
- Record: while video plays, pad hits insert notes at `SongClock.now(ts)`, snapped if snap on.
- Edit: tap empty cell = add, tap note = select, drag = move (snapped), Delete/backspace = remove, box-select with drag on background.
- Command pattern for undo/redo.
- Waveform: from `peaks.json` if available.

## 15. Persistence keys (`localStorage`, all JSON, wrapped in try/catch)

- `icmpal.v1.settings`, `icmpal.v1.best.<songId>.<difficulty>`, `icmpal.v1.leaderboard.<songId>.<difficulty>`, `icmpal.v1.achievements`, `icmpal.v1.xp`, `icmpal.v1.chart.<songId>` (editor draft).

## 16. Hosting and CORS notes

- The MP4 stays on CloudFront (too large to embed). Set `crossorigin="anonymous"` on the `<video>` **only if** the CloudFront distribution returns `Access-Control-Allow-Origin` for the GitHub Pages origin; otherwise omit the attribute (with it, a non-CORS response fails to load).
- Don't rely on `<link rel="preload" as="video">` (unreliable); instead set `preload="auto"` and show buffering progress from `video.buffered`.
- Provide a poster frame (extract one frame in the Colab notebook → base64 JPEG ≤ 40 KB inline) for the song card and before playback.

## 17. Testing strategy

- **Unit-ish (in-page `?test=1` harness, no frameworks):** Judge windows, difficulty derivation, beatmap validation, score/multiplier maths, calibration median.
- **Device matrix:** iPhone (Safari) portrait/landscape, Android Chrome portrait, iPad landscape, desktop Chrome with keyboard.
- **Timing check:** Demo mode with a debug overlay (`?debug=1`) showing song clock, video currentTime, drift, fps, last hit error; verify gem arrival coincides with audible drum hits in the video.
- **Lighthouse:** performance ≥ 90 on mobile (excluding video).

## 18. Player profile and data model

```js
Profile = {
  playerId: "uuid-v4", nickname: "Aaron", avatarColor: "#3D8BFF",
  age: 45, ageBand: "40-49", gender: "M" | "F" | "O" | "NA",
  hand: "R" | "L" | null, musicExp: "none" | "<2" | "2-5" | ">5" | null,
  consent: { local: true, remote: false, guardian: false, ts: "ISO" },
  createdAt: "ISO", xp: 0, coins: 0, streak: { days: 0, last: "YYYY-MM-DD" },
  mastery: { kick: {hits:0, notes:0}, snare: {...}, hihat: {...}, tom: {...}, cymbal: {...} },
  unlocks: ["skin.neon"], equipped: { skin: "neon", theme: "night", fx: "sparks" },
  achievements: { id: "ISO date" }, history: [ SessionRecord ]   // last 200
}

SessionRecord = {
  sessionId, playerId, ts, mode: "play" | "practice" | "reflex" | "beatsync",
  songId, difficulty, score, grade, stars, accuracy, maxCombo, fullCombo,
  counts: {PERFECT, GREAT, GOOD, MISS, WRONG, STRAY},
  perPad: { kick: {notes, hits, acc, meanErrMs, sdErrMs}, ... },
  confusion: { kick: {kick, snare, hihat, tom, cymbal, none}, ... },   // expected → played
  timing: { meanAsyncMs, sdAsyncMs, medianAbsErrMs, R },
  coordination: { chordSimulMs, chordAcc, singleAcc, limbIndependence },
  sections: [ { name, acc } ], barAcc: [ ... ],
  reflex: { srt: {median, mean, sd, cv, n, anticip, lapses},
            crt: {median, mean, sd, cv, n, errRate} } | null,
  beatsync: { ioi600: {meanAsync, sd, R, n}, ioi450: {...} } | null,
  rhythmIndex, coordinationIndex, deviceOffsetMs, userAgent, appVersion
}
```

Storage keys: `icmpal.v1.profiles` (array), `icmpal.v1.activeProfile`, and the per-profile `history` capped at 200 records (older ones are rolled into aggregate stats).

## 19. Metric definitions

Notation: for correct-pad hit *i*, asynchrony is *eᵢ = t_hit,i − t_note,i* (ms; negative = early). *N* is the number of correct-pad hits.

| Metric | Formula |
|---|---|
| Pad accuracy | `acc_p = (PERFECT_p + GREAT_p + GOOD_p) / notes_p` |
| Overall accuracy (weighted) | `Σ w_j · count_j / total_notes`, with w = 1.0 (PERFECT), 0.75 (GREAT), 0.5 (GOOD), 0 (MISS / WRONG) |
| Mean asynchrony | `ē = (1/N) Σ eᵢ` |
| Timing variability | `SD_e = √( Σ (eᵢ − ē)² / (N − 1) )` |
| Phase | `φᵢ = 2π · eᵢ / IBIᵢ`, where IBIᵢ is the local inter-beat interval from `beats[]` |
| Consistency R | `R = |(1/N) Σ exp(i φᵢ)| = √( C̄² + S̄² )`, with C̄ = mean cos φ and S̄ = mean sin φ (0 = random, 1 = perfectly consistent); a Rayleigh test p-value is also reported |
| Chord simultaneity | for chord notes hit on both lanes: `mean |t_hit,A − t_hit,B|` |
| Limb independence | `acc_chord / acc_single` (capped at 1.2) |
| RT summary | median, mean, SD, `CV = SD / mean` after exclusions (anticipation < 100 ms; lapse > 1500 ms SRT / 2000 ms CRT) |
| Rhythm Index (0–100) | `100 · (0.4·R + 0.3·(1 − min(SD_e, 120)/120) + 0.3·(1 − min(|ē|, 80)/80))` |
| Coordination Index (0–100) | `100 · (0.4·accW + 0.3·(1 − min(chordSimul, 100)/100) + 0.3·min(limbIndependence, 1))` |

The index weights are heuristic engagement composites. The manual must say so explicitly and must not present them as validated psychometric scales. Sessions with N < 30 hits show "insufficient data" for R, SD_e and both indices.

**Wrong-pad logic** in `Judge.evaluate(lane, tHit)`: if there is no unjudged note in `lane` within GOOD, look for the nearest unjudged note in any other lane within GOOD. If found, record `confusion[thatLane][lane]++` and mark that note `WRONG` (it can no longer be hit). Otherwise record a stray. Notes that expire are counted as `confusion[lane].none++`.

**Coaching rules** (evaluated in order; show the first 3 that fire):
1. `|ē_pad| > 25 ms` → "You're {early/late} on {pad} by {x} ms. Try {relaxing/anticipating}."
2. `acc_pad < 0.7` → "Practise {pad} — loop the {weakest section}."
3. Top confusion off the diagonal ≥ 5 → "You hit {played} when {expected} was due {n}×."
4. `chordSimul > 40 ms` → "Hit both pads together on chords."
5. `SD_e > 60 ms` → "Steady the groove — try the Beat Sync Test."

## 20. Norms engine

```js
const NORMS = {
  version: "0.1",
  metrics: {
    srt_median_ms: {
      direction: "lower_is_better",
      literature: [{
        source: "Der & Deary (2006)", table: "fill from paper", sample: "UK HALS, N = 7,130, ages 18–90+",
        bands: { "18-29": { M: { mean: null, sd: null }, F: { mean: null, sd: null } } /* … */ },
        verified: false,
        caveat: "Lab apparatus; web/touch RT is slower by device latency"
      }]
    },
    crt4_median_ms: { direction: "lower_is_better", literature: [ /* Der & Deary (2006), 4-choice */ ] },
    beatsync_sd_ms: { direction: "lower_is_better", literature: [ /* Dalla Bella et al. (2024) mobile BAASTA adult norms */ ] },
    rhythm_index:   { direction: "higher_is_better", literature: [] },   // cohort-only
    coordination_index: { direction: "higher_is_better", literature: [] } // cohort-only
  }
};
```

- **Literature comparison** (only when `verified: true` and the values are non-null): `z = (x − μ)/σ`, with sign flipped for lower-is-better metrics; percentile = Φ(z). Optionally apply a device-latency adjustment: `x_adj = x − deviceVisualLatencyMs`, where the default comes from a settings field (0 ms) and the manual explains why.
- **Cohort comparison:** empirical percentile rank `PR = (count_below + 0.5·count_equal) / n · 100` in the age band × gender cell when n ≥ 30, else the age band only (n ≥ 30), else not shown. Use each player's **best** session per metric, so one person does not dominate the cell.
- **Bands by percentile:** < 10 Well below · 10–24 Below · 25–74 Average · 75–89 Above · ≥ 90 Well above.
- **Visual:** an SVG bell curve with five shaded bands, the player's marker, and the label "n = 214 · Cohort: intelliCARE players aged 60–69, female". The source line is always shown.

**Remote cohort (Phase 2):** the Apps Script exposes `GET ?action=norms&metric=…` and returns aggregated percentile tables (deciles per cell plus n) so raw data never reaches the client. The app caches this in `icmpal.v1.normsCache` with a timestamp.

## 21. README — Technical & Scientific Manual specification

### 21.1 Required structure

```
Title page: intelliCARE Music Play-a-Long — Technical and Scientific Manual
            Version, date, Republic Polytechnic School of Sports & Health, author placeholder, licence
Abstract (150–250 words)
Table of contents · List of figures · List of equations · Glossary
1. Introduction — purpose, target users (community seniors, students, general public), scope, intended use and non-clinical disclaimer
2. Scientific background
   2.1 Sensorimotor synchronisation and finger tapping (negative mean asynchrony, error correction)
   2.2 Reaction time: simple vs choice, age and sex differences, intra-individual variability
   2.3 Rhythm and ageing; music-based activity for older adults
   2.4 Gamification and motivation (self-determination theory, flow, game design elements)
3. System overview — features, modes, user flow diagrams (Mermaid)
4. Audio analysis pipeline
   4.1 Source separation (Hybrid Transformer Demucs)
   4.2 Automatic drum transcription (ADTOF; class mapping; GM pitch table)
   4.3 Onset detection (spectral flux, adaptive thresholding — equations)
   4.4 Beat and downbeat tracking (dynamic-programming beat tracker)
   4.5 Chart post-processing and difficulty derivation (algorithms, parameters)
   4.6 Expected accuracy and the manual-correction workflow
5. Real-time engine
   5.1 Song-clock model (requestVideoFrameCallback interpolation; equations)
   5.2 Input pipeline and latency budget (touch → event → audio; table of typical latencies)
   5.3 Calibration procedure (median offset, outlier rejection)
   5.4 Drum synthesis (signal flow, parameters per voice)
   5.5 Rendering (perspective projection equation, sprite strategy, adaptive quality)
6. Judging, scoring and gamification design — windows table, multiplier, Heartbeat Mode, rock meter, XP/levels, achievements, challenges, unlockables, with design rationale linked to Section 2.4
7. Performance metrics — every formula from design §19, worked numerical examples, interpretation
8. Reflex and Beat Sync tests — protocol (trials, foreperiods, exclusions), outcome measures, rationale (link to BAASTA paced tapping and the HALS RT protocol)
9. Normative comparison — literature vs cohort norms, percentile and z computation, minimum n, banding, device-latency caveat, how to populate and verify NORMS
10. Validity, reliability and limitations — browser/touch timing error, Bluetooth audio, transcription errors, heuristic indices, cross-sectional norms, non-diagnostic use; suggested validation study design (test–retest ICC; concurrent validity vs lab tapping)
11. Data protection and ethics — PDPA 2012 obligations (consent, purpose, access, correction, retention), minors, data dictionary, IRB note for research use
12. Architecture and code organisation — module map, state machine, data schemas
13. Deployment — GitHub Pages, CloudFront video/CORS, adding a new song, Apps Script set-up
14. User guide — players; facilitator guide (profiles, session mode, exports)
15. Testing and quality assurance — test harness, device matrix, performance targets
16. Maintenance and roadmap
References (APA 7, alphabetical, hanging indent, DOIs)
Appendix A Beatmap schema · B Settings and storage keys · C Data dictionary · D NORMS format · E Metric worked examples · F Changelog
```

### 21.2 Writing rules

- Formal third-person scholarly register; Singapore/British spelling; SI units (ms, Hz).
- Equations in LaTeX math blocks (`$$ … $$`, which GitHub renders); every equation numbered and referenced in the text.
- Every empirical claim gets an APA in-text citation, e.g. (Repp, 2005) or (Der & Deary, 2006).
- No invented statistics, norms or study results. Where a value must come from a paper, write "see Table X in Author (Year)" or leave a clearly marked `TODO(verify)`.

### 21.3 Vetted reference list (APA 7) — use these

- Anwyl-Irvine, A., Dalmaijer, E. S., Hodges, N., & Evershed, J. K. (2021). Realistic precision and accuracy of online experiment platforms, web browsers, and devices. *Behavior Research Methods, 53*(4), 1407–1425. https://doi.org/10.3758/s13428-020-01501-5
- Bello, J. P., Daudet, L., Abdallah, S., Duxbury, C., Davies, M., & Sandler, M. B. (2005). A tutorial on onset detection in music signals. *IEEE Transactions on Speech and Audio Processing, 13*(5), 1035–1047. https://doi.org/10.1109/TSA.2005.851998
- Böck, S., Korzeniowski, F., Schlüter, J., Krebs, F., & Widmer, G. (2016). madmom: A new Python audio and music signal processing library. In *Proceedings of the 24th ACM International Conference on Multimedia* (pp. 1174–1178). https://doi.org/10.1145/2964284.2973795
- Csikszentmihalyi, M. (1990). *Flow: The psychology of optimal experience*. Harper & Row.
- Dalla Bella, S., Farrugia, N., Benoit, C.-E., Begel, V., Verga, L., Harding, E., & Kotz, S. A. (2017). BAASTA: Battery for the Assessment of Auditory Sensorimotor and Timing Abilities. *Behavior Research Methods, 49*(3), 1128–1145. https://doi.org/10.3758/s13428-016-0773-6
- Dalla Bella, S., Foster, N. E. V., Laflamme, H., Zagala, A., Melissa, K., Komeilipoor, N., Blais, M., Rigoulot, S., & Kotz, S. A. (2024). Mobile version of the Battery for the Assessment of Auditory Sensorimotor and Timing Abilities (BAASTA): Implementation and adult norms. *Behavior Research Methods, 56*(4), 3737–3756. https://doi.org/10.3758/s13428-024-02363-x
- Deary, I. J., & Der, G. (2005). Reaction time, age, and cognitive ability: Longitudinal findings from age 16 to 63 years in representative population samples. *Aging, Neuropsychology, and Cognition, 12*(2), 187–215. https://doi.org/10.1080/13825580590969235
- Der, G., & Deary, I. J. (2006). Age and sex differences in reaction time in adulthood: Results from the United Kingdom Health and Lifestyle Survey. *Psychology and Aging, 21*(1), 62–73. https://doi.org/10.1037/0882-7974.21.1.62
- Deterding, S., Dixon, D., Khaled, R., & Nacke, L. (2011). From game design elements to gamefulness: Defining "gamification". In *Proceedings of the 15th International Academic MindTrek Conference* (pp. 9–15). https://doi.org/10.1145/2181037.2181040
- Dykiert, D., Der, G., Starr, J. M., & Deary, I. J. (2012). Sex differences in reaction time mean and intraindividual variability across the life span. *Developmental Psychology, 48*(5), 1262–1276. https://doi.org/10.1037/a0027550
- Ellis, D. P. W. (2007). Beat tracking by dynamic programming. *Journal of New Music Research, 36*(1), 51–60. https://doi.org/10.1080/09298210701653344
- Fisher, N. I. (1993). *Statistical analysis of circular data*. Cambridge University Press. https://doi.org/10.1017/CBO9780511564345
- Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? — A literature review of empirical studies on gamification. In *Proceedings of the 47th Hawaii International Conference on System Sciences* (pp. 3025–3034). IEEE. https://doi.org/10.1109/HICSS.2014.377
- McFee, B., Raffel, C., Liang, D., Ellis, D. P. W., McVicar, M., Battenberg, E., & Nieto, O. (2015). librosa: Audio and music signal analysis in Python. In *Proceedings of the 14th Python in Science Conference* (pp. 18–25). https://doi.org/10.25080/Majora-7b98e3ed-003
- Personal Data Protection Act 2012 (Singapore). https://sso.agc.gov.sg/Act/PDPA2012
- Pollok, B., Hagedorn, A., Krause, V., & Kotz, S. A. (2023). Age interferes with sensorimotor timing and error correction in the supra-second range. *Frontiers in Aging Neuroscience, 14*, Article 1048610. https://doi.org/10.3389/fnagi.2022.1048610
- Pronk, T., Wiers, R. W., Molenkamp, B., & Murre, J. (2020). Mental chronometry in the pocket? Timing accuracy of web applications on touchscreen and keyboard devices. *Behavior Research Methods, 52*(3), 1371–1382. https://doi.org/10.3758/s13428-019-01321-2
- Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. *Psychonomic Bulletin & Review, 12*(6), 969–992. https://doi.org/10.3758/BF03206433
- Repp, B. H., & Su, Y.-H. (2013). Sensorimotor synchronization: A review of recent research (2006–2012). *Psychonomic Bulletin & Review, 20*(3), 403–452. https://doi.org/10.3758/s13423-012-0371-2
- Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation. In *ICASSP 2023 — IEEE International Conference on Acoustics, Speech and Signal Processing*. https://doi.org/10.1109/ICASSP49357.2023.10096956 [to verify DOI]
- Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. *American Psychologist, 55*(1), 68–78. https://doi.org/10.1037/0003-066X.55.1.68
- Thaut, M. H., & Hoemberg, V. (Eds.). (2014). *Handbook of neurologic music therapy*. Oxford University Press.
- Thompson, E. C., White-Schwoch, T., Tierney, A., & Kraus, N. (2015). Beat synchronization across the lifespan: Intersection of development and musical experience. *PLOS ONE, 10*(6), Article e0128839. https://doi.org/10.1371/journal.pone.0128839
- Woods, D. L., Wyma, J. M., Yund, E. W., Herron, T. J., & Reed, B. (2015). Factors influencing the latency of simple reaction time. *Frontiers in Human Neuroscience, 9*, Article 131. https://doi.org/10.3389/fnhum.2015.00131
- Wu, C.-W., Dittmar, C., Southall, C., Vogl, R., Widmer, G., Hockman, J., Müller, M., & Lerch, A. (2018). A review of automatic drum transcription. *IEEE/ACM Transactions on Audio, Speech, and Language Processing, 26*(9), 1457–1483. https://doi.org/10.1109/TASLP.2018.2830113
- W3C. (2021). *Web Audio API* (W3C Recommendation). https://www.w3.org/TR/webaudio/
- Zehren, M., Alunno, M., & Bientinesi, P. (2021). ADTOF: A large dataset of non-synthetic music for automatic drum transcription. In *Proceedings of the 22nd International Society for Music Information Retrieval Conference* (pp. 818–824).
- Zehren, M., Alunno, M., & Bientinesi, P. (2023). High-quality and reproducible automatic drum transcription from crowdsourced data. *Signals, 4*(4), 768–787. https://doi.org/10.3390/signals4040042

## 22. Live Google Sheets leaderboard (R25)

### 22.1 Architecture

```
Browser (GitHub Pages)                         Google
┌───────────────────────┐  POST text/plain   ┌──────────────────────────┐
│ LeaderboardClient     │ ─────────────────▶ │ Apps Script Web App      │
│  submit() + outbox    │  GET ?action=…     │  doPost / doGet          │
│  poll 15 s (visible)  │ ◀───────────────── │  LockService, CacheSvc   │
└───────────────────────┘   JSON             │        │                 │
                                             │        ▼                 │
                                             │  Google Sheet            │
                                             │  Sessions | Leaderboard  │
                                             │  Players | Charts        │
                                             │  NormsAgg | Config | Log │
                                             └──────────────────────────┘
```

### 22.2 CORS-safe calling convention (important)

Apps Script Web Apps do not answer CORS preflight (`OPTIONS`) requests. So:

- **POST:** send the body as a JSON string with header `Content-Type: text/plain;charset=utf-8` (a "simple request", so no preflight). Do not send `application/json` or custom headers. The server parses it with `JSON.parse(e.postData.contents)`.
- **GET:** plain `fetch(url + '?' + params)` with no custom headers.
- Both use `redirect: "follow"`: Apps Script answers via a 302 to `script.googleusercontent.com`, which returns `Access-Control-Allow-Origin: *`.
- Never use `mode: "no-cors"`, because the response must be readable to get the rank back.
- Timeout: `AbortController`, 10 s.

```js
const LeaderboardClient = {
  async post(payload) {
    const r = await fetch(Config.SHEETS_ENDPOINT, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
    });
    const j = await r.json(); if (!j.ok) throw new Error(j.error); return j;
  },
  async get(params) {
    const r = await fetch(Config.SHEETS_ENDPOINT + '?' + new URLSearchParams(params),
                          { redirect: 'follow', signal: AbortSignal.timeout(10000) });
    return r.json();
  }
};
```

### 22.3 API contract

| Call | Params / body | Response |
|---|---|---|
| `POST` `{action:"submit", record, entry, appVersion}` | `record` = SessionRecord (only if remote consent), `entry` = `{sessionId, playerId, nickname, avatarColor, ageBand, gender, showGender, board values…}` | `{ok, dedup, ranks:{ score:{global, n, pct, band, bandN}, accuracy:{…}, … }}` |
| `GET ?action=leaderboard` | `song, board (score/accuracy/combo/srt/crt/rhythm), difficulty, period (all/season/week/today), ageBand?, gender?, limit=10, playerId?` | `{ok, updated, version, rows:[{rank, nickname, avatarColor, ageBand, gender?, value, date, isNew}], me:{rank, value}|null, n}` |
| `GET ?action=norms` | `metric, ageBand?, gender?` | `{ok, updated, cells:[{ageBand, gender, n, deciles:[p10…p90], mean, sd}]}` |
| `GET ?action=ping` | — | `{ok, version, season}` |

`version` is a counter incremented on every accepted submission. The client skips re-rendering when it is unchanged.

### 22.4 Sheet tabs (created by `setup()`)

- **Sessions** (raw, private): `ts, sessionId, playerId, nickname, age, ageBand, gender, hand, musicExp, mode, songId, difficulty, score, grade, accuracy, maxCombo, fullCombo, perfect, great, good, miss, wrong, stray, meanAsyncMs, sdAsyncMs, R, chordSimulMs, limbIndependence, srtMedian, crtMedian, crtErr, beatsyncSd600, rhythmIndex, coordinationIndex, perPadJSON, confusionJSON, appVersion, userAgent`
- **Leaderboard** (one row per accepted entry; boards are computed from it): `ts, sessionId, playerId, nickname, avatarColor, ageBand, gender, showGender, songId, difficulty, season, score, accuracy, maxCombo, srtMedian, crtMedian, rhythmIndex, hidden(checkbox)`
- **Players:** `playerId, nickname, firstSeen, lastSeen, sessions, dailyCount, lastSubmitTs`
- **Charts:** `songId, difficulty, noteCount, maxScore` (validation source; the app's Editor can export these values)
- **NormsAgg:** written hourly by the trigger
- **Config:** `key, value` — `currentSeason`, `seasonStart`, `facilitatorPinHash`, `profanityList`
- **Log:** rejected submissions with reason (for monitoring)

### 22.5 Apps Script skeleton (`tools/apps_script.gs`)

```js
const SS = SpreadsheetApp.getActive();
const json = o => ContentService.createTextOutput(JSON.stringify(o))
                                .setMimeType(ContentService.MimeType.JSON);

function doGet(e) {
  const p = e.parameter;
  try {
    if (p.action === 'leaderboard') return json(getBoard_(p));
    if (p.action === 'norms')       return json(getNorms_(p));
    return json({ ok: true, version: ver_(), season: cfg_('currentSeason') });
  } catch (err) { return json({ ok: false, error: String(err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'submit') throw 'bad action';
    lock.waitLock(10000);
    const v = validate_(body.entry);              // ranges, maxScore, nickname, rate limit
    if (!v.ok) { log_(body, v.reason); return json({ ok: false, error: v.reason }); }
    if (seen_(body.entry.sessionId)) return json({ ok: true, dedup: true, ranks: ranks_(body.entry) });
    if (body.record) appendSession_(body.record);
    appendLeaderboard_(body.entry);
    bumpVersion_(); CacheService.getScriptCache().removeAll(boardKeys_(body.entry));
    return json({ ok: true, ranks: ranks_(body.entry) });
  } catch (err) { return json({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}
// getBoard_: read Leaderboard (cached 15 s in CacheService per param combo), drop hidden,
//   filter song/difficulty/period/ageBand/gender, keep each player's BEST value per board,
//   sort (lower-is-better for srt/crt), slice top N, find the requester's rank, return public fields only.
// setup(): create tabs + headers + checkbox validation + frozen header row; seed Config.
// hourlyNorms(): compute deciles per ageBand × gender cell (n ≥ 30) → NormsAgg; install a time trigger in setup().
```

Rules:
- Every value read from the client is type-coerced and clamped.
- Nicknames are trimmed, filtered for profanity and capped at 16 chars.
- Writes use `appendRow` under the lock.
- Reads use `getDataRange().getValues()` once per request, plus the cache.

### 22.6 Client behaviour

- `LeaderboardScreen` starts a 15 s `setInterval` poll on open and stops it on close or when `document.hidden` is true. It shows skeleton rows on first load and diffs rows by `sessionId` for the animations.
- Results flow: render local results immediately, then `submit()` in the background, then show the global ranks when the response arrives (a spinner chip in the meantime).
- Outbox: `[{payload, tries, nextAt}]`, flushed on app start, on `online`, and after each successful call. Capped at 50 items.
- Status pill logic: last call OK within 30 s → LIVE; request in flight → SYNCING; failed or no endpoint → OFFLINE.

### 22.7 Limits and caveats (for the manual)

- Apps Script has daily execution and concurrency quotas. The manual must link Google's current quota page and not hard-code numbers.
- The 15 s polling plus the 15 s server cache keep the load low. For large public events, raise the poll to 30 s.
- Anyone can read the public endpoint, so it returns public fields only. Anyone can also POST, so rely on the validation and the facilitator `hidden` column. True anti-cheat would need server-side replay verification, which is out of scope.
- After editing the script, redeploy as a **new version of the same deployment** so the `/exec` URL stays the same.
