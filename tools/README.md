# tools/ — chart generation and backend

| File | Purpose |
|---|---|
| `beatmap_pipeline.ipynb` | Google Colab notebook: video → drum stem (Demucs) → drum notes (ADTOF, or a band-split onset fallback) → beats, bars and sections (librosa) → `beatmap.json` |
| `apps_script.gs` | Google Apps Script Web App for the live leaderboard. It is bound to the project Sheet by ID |
| `sheets_template.md` | Tab and column reference for the Google Sheet |

## Make the real chart (about 10 minutes, nothing to install)

1. Open <https://colab.research.google.com> → File → Upload notebook → `tools/beatmap_pipeline.ipynb`.
2. Runtime → Change runtime type → **T4 GPU** → Save.
3. Runtime → **Run all**. Cell 3 (ADTOF) may fail, which is fine: cell 4 then provides the fallback chart. The notebook prints which path was used.
4. Cell 7 downloads `beatmap.json`, `peaks.json` and `poster.jpg`.
5. Open the app with `?editor=1` (for example `https://<you>.github.io/<repo>/?editor=1`), press **Chart Editor**, then **Import** and choose `beatmap.json`.
6. Play the video and check the gems against the audible drums:
   - **Off −1 / Off +1** shift the whole chart by 1 ms (chart `offsetMs`).
   - Tap an empty spot to add a note, tap a note to select it, drag to move it, and use **Del** to remove it.
   - **● Rec** records pad taps into the chart while the video plays.
   - **＋Section** names a section at the playhead. **♥ Bud** flags Heartbeat notes.
7. Press **Generate**. The dialog shows the note count and `maxScore` for each difficulty. Type these into the Sheet's **Charts** tab.
8. Press **Copy inline**. In `index.html`, replace the whole `<script type="application/json" id="beatmap"> … </script>` block with the copied text, then commit.
   - Alternative: upload `beatmap.json` to the repo and open the app with `?chart=beatmap.json`.

Editor drafts autosave in the browser (`icmpal.v1.chart.buds-of-a-heartbeat`).

## A new song

Change `VIDEO_URL` and `SONG` in cell 1, run the notebook, then update `Config.song` and `Config.SONG_ID` in `index.html`.

## Tuning the fallback detector

In cell 4, `delta` is the onset-peak threshold. If a lane has too many notes, raise it; if notes are missing, lower it. `wait_s` is the minimum gap between notes in the same lane.

## Faster option: analyse an isolated drum track in the browser (`analyze.html`)

If you already have the drum stem (for example `sounds/心跳的花蕾drums.wav`), open `tools/analyze.html` in Edge or Chrome. Choose the drum track and all 5 samples (KICK, SNARE, HI-HAT, TOM, CYMBAL), then press **Analyse**. The tool uses the samples as templates for NMF decomposition: each drum gets its own activation curve, and notes are picked from each curve. It also tracks the beat with a dynamic-programming tracker and estimates bars and sections. Download `beatmap.json` and import it in the Editor.

On this PC, the following scripts do the same headlessly:
- `run_analyze.ps1` writes its output to `tools/_check/`.
- `embed.ps1` cleans up crosstalk and pastes the chart and samples into `index.html`.
- `shots.ps1` takes screenshots and runs the tests.

## Video buffering

The master MP4 is about 524 MB (about 18 Mbit/s) and CloudFront sends no CORS header. Run cell 8 of the notebook to make a 720p web copy (about 100 MB), upload it, and set `Config.VIDEO_WEB`. If you also enable CORS on the bucket, players can use Settings → **Save video to this device** for completely stutter-free play.
