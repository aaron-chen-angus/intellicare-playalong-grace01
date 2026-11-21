/**
 * intelliCARE Music Play-a-Long — Google Apps Script backend (Web App)
 * -------------------------------------------------------------------
 * Live global leaderboard + session logging + cohort norms, stored in ONE Google Sheet.
 *
 * SET-UP (once):
 *   1. Open the Sheet  https://docs.google.com/spreadsheets/d/1M92hn8TyPRbegZE4g470PJlsSx_5sDqmg95kbtDW6uk
 *   2. Extensions > Apps Script. Delete any code, paste this whole file, Save.
 *   3. Select function  setup  in the toolbar > Run. Authorise when asked.
 *      (Creates the tabs Sessions, Leaderboard, Players, Charts, NormsAgg, Config, Log
 *       and installs the hourly norms trigger.  Existing tabs are kept, never wiped.)
 *   4. Deploy > New deployment > type "Web app":
 *        Execute as: Me      Who has access: Anyone
 *      Copy the /exec URL into  Config.SHEETS_ENDPOINT  in index.html, commit, done.
 *   5. After later edits: Deploy > Manage deployments > pencil > Version: New version > Deploy
 *      (the /exec URL stays the same).
 *
 * CORS: the browser POSTs Content-Type text/plain (no preflight) and reads JSON back
 * through Apps Script's redirect.  No custom headers are needed here.
 */

// ---------------------------------------------------------------- constants
const SHEET_ID = '1M92hn8TyPRbegZE4g470PJlsSx_5sDqmg95kbtDW6uk';
const APP_VERSION_SERVER = '1.0.0';
const TABS = {
  Sessions: ['ts','sessionId','playerId','nickname','age','ageBand','gender','hand','musicExp','mode','songId','difficulty',
    'score','grade','accuracy','maxCombo','fullCombo','perfect','great','good','miss','wrong','stray',
    'meanAsyncMs','sdAsyncMs','R','chordSimulMs','limbIndependence','srtMedian','crtMedian','crtErr',
    'beatsyncSd600','rhythmIndex','coordinationIndex','perPadJSON','confusionJSON','appVersion','userAgent'],
  Leaderboard: ['ts','sessionId','playerId','nickname','avatarColor','ageBand','gender','showGender','songId','difficulty',
    'season','score','accuracy','maxCombo','srtMedian','crtMedian','rhythmIndex','hidden'],
  Players: ['playerId','nickname','firstSeen','lastSeen','sessions','dailyCount','lastSubmitTs'],
  Charts: ['songId','difficulty','noteCount','maxScore'],
  NormsAgg: ['metric','ageBand','gender','n','p10','p20','p30','p40','p50','p60','p70','p80','p90','mean','sd','updated'],
  Config: ['key','value'],
  Log: ['ts','reason','payload']
};
const AGE_BANDS = ['5-12','13-17','18-29','30-39','40-49','50-59','60-69','70-79','80+'];
const BOARDS = {                       // board name -> [Leaderboard column, lowerIsBetter]
  score: ['score', false], accuracy: ['accuracy', false], combo: ['maxCombo', false],
  srt: ['srtMedian', true], crt: ['crtMedian', true], rhythm: ['rhythmIndex', false]
};
const NORM_METRICS = { srt: 'srtMedian', crt: 'crtMedian', beatsync: 'beatsyncSd600',
                       rhythm: 'rhythmIndex', coordination: 'coordinationIndex' };
const DEFAULT_MAX_SCORE = 5000000;       // used only when the Charts tab has no row for the song
const RATE_SECONDS = 20, RATE_PER_DAY = 60;

const SS_ = () => SpreadsheetApp.openById(SHEET_ID);
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// ---------------------------------------------------------------- setup
/** Run once from the editor. Safe to re-run. */
function setup() {
  const ss = SS_();
  Object.keys(TABS).forEach(name => {
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const head = TABS[name];
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#12102A').setFontColor('#ffffff');
  });
  // hidden checkbox column on Leaderboard
  const lb = ss.getSheetByName('Leaderboard');
  const hc = TABS.Leaderboard.indexOf('hidden') + 1;
  lb.getRange(2, hc, 2000, 1).insertCheckboxes();
  lb.getRange(2, TABS.Leaderboard.indexOf('showGender') + 1, 2000, 1).insertCheckboxes();
  // highlight hidden rows
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + colLetter_(hc) + '2=TRUE').setBackground('#f4c7c3').setRanges([lb.getRange('A2:R2000')]).build();
  lb.setConditionalFormatRules([rule]);
  // Config defaults
  const cfg = ss.getSheetByName('Config');
  const have = cfg.getLastRow() > 1 ? cfg.getRange(2, 1, cfg.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  [['currentSeason', 'S1'], ['seasonStart', new Date().toISOString().slice(0, 10)],
   ['facilitatorPinHash', ''], ['profanityList', 'fuck,shit,bitch,cunt,dick,asshole,bastard,slut,nigger,fag']]
    .forEach(kv => { if (have.indexOf(kv[0]) < 0) cfg.appendRow(kv); });
  // Charts defaults (edit maxScore after exporting from the Editor)
  const ch = ss.getSheetByName('Charts');
  if (ch.getLastRow() < 2) ['gentle', 'groove', 'fire'].forEach(d => ch.appendRow(['buds-of-a-heartbeat', d, '', DEFAULT_MAX_SCORE]));
  // hourly norms trigger
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'hourlyNorms').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('hourlyNorms').timeBased().everyHours(1).create();
  PropertiesService.getScriptProperties().setProperty('version', PropertiesService.getScriptProperties().getProperty('version') || '0');
  Logger.log('Setup complete.');
}
function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }

// ---------------------------------------------------------------- helpers
function table_(name) {
  const sh = SS_().getSheetByName(name);
  if (!sh) throw 'Missing tab ' + name + ' (run setup())';
  const v = sh.getDataRange().getValues();
  const head = v[0] || TABS[name];
  const rows = v.slice(1).map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i]); return o; });
  return { sh: sh, head: head, rows: rows };
}
function cfg_(key) {
  const t = table_('Config'); const r = t.rows.filter(x => x.key === key)[0]; return r ? String(r.value) : '';
}
function ver_() { return Number(PropertiesService.getScriptProperties().getProperty('version') || 0); }
function bumpVersion_() { PropertiesService.getScriptProperties().setProperty('version', String(ver_() + 1)); }
function log_(body, reason) {
  try { SS_().getSheetByName('Log').appendRow([new Date(), String(reason), JSON.stringify(body).slice(0, 2000)]); } catch (e) {}
}
const num_ = (v, lo, hi, d) => { v = Number(v); if (!isFinite(v)) return d; return Math.min(hi, Math.max(lo, v)); };
const str_ = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

function cleanNick_(n) {
  n = str_(n, 16);
  if (n.length < 2) return null;
  const bad = cfg_('profanityList').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const low = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const b of bad) if (low.indexOf(b) >= 0) return null;
  return n;
}

// ---------------------------------------------------------------- validation
function validate_(e) {
  if (!e || typeof e !== 'object') return { ok: false, reason: 'no entry' };
  const nick = cleanNick_(e.nickname);
  if (!nick) return { ok: false, reason: 'bad nickname' };
  const sid = str_(e.sessionId, 64), pid = str_(e.playerId, 64);
  if (sid.length < 8 || pid.length < 8) return { ok: false, reason: 'bad ids' };
  const ageBand = AGE_BANDS.indexOf(e.ageBand) >= 0 ? e.ageBand : '';
  const out = {
    ts: new Date(), sessionId: sid, playerId: pid, nickname: nick,
    avatarColor: /^#[0-9a-fA-F]{6}$/.test(e.avatarColor) ? e.avatarColor : '#3D8BFF',
    ageBand: ageBand, gender: ['M', 'F', 'O', 'NA'].indexOf(e.gender) >= 0 ? e.gender : 'NA',
    showGender: e.showGender === true, songId: str_(e.songId || 'buds-of-a-heartbeat', 64),
    difficulty: ['gentle', 'groove', 'fire', 'reflex', 'beatsync'].indexOf(e.difficulty) >= 0 ? e.difficulty : '',
    season: cfg_('currentSeason'),
    score: num_(e.score, 0, 1e9, 0), accuracy: num_(e.accuracy, 0, 100, 0), maxCombo: num_(e.maxCombo, 0, 100000, 0),
    srtMedian: num_(e.srtMedian, 0, 3000, 0), crtMedian: num_(e.crtMedian, 0, 4000, 0), rhythmIndex: num_(e.rhythmIndex, 0, 100, 0)
  };
  if (out.srtMedian && out.srtMedian < 100) return { ok: false, reason: 'srt out of range' };
  if (out.crtMedian && out.crtMedian < 150) return { ok: false, reason: 'crt out of range' };
  // max score from Charts tab
  if (out.score > 0) {
    const row = table_('Charts').rows.filter(r => r.songId === out.songId && r.difficulty === out.difficulty)[0];
    const max = row && Number(row.maxScore) > 0 ? Number(row.maxScore) : DEFAULT_MAX_SCORE;
    // Heartbeat Mode can double points, so allow 2x the no-heartbeat maximum.
    if (out.score > max * 2) return { ok: false, reason: 'score exceeds chart maximum' };
  }
  // rate limit
  const pl = table_('Players');
  const idx = pl.rows.findIndex(r => r.playerId === pid);
  const now = new Date(), today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (idx >= 0) {
    const r = pl.rows[idx];
    const last = Number(r.lastSubmitTs) || 0;
    if (now.getTime() - last < RATE_SECONDS * 1000) return { ok: false, reason: 'rate limit (20 s)' };
    const sameDay = String(r.dailyCount).indexOf(today) === 0;
    const cnt = sameDay ? Number(String(r.dailyCount).split('|')[1]) || 0 : 0;
    if (cnt >= RATE_PER_DAY) return { ok: false, reason: 'daily limit' };
  }
  out._playerRowIdx = idx; out._today = today;
  return { ok: true, entry: out };
}
function touchPlayer_(en) {
  const pl = SS_().getSheetByName('Players');
  const now = new Date();
  const t = table_('Players');
  const idx = t.rows.findIndex(r => r.playerId === en.playerId);
  if (idx < 0) {
    pl.appendRow([en.playerId, en.nickname, now, now, 1, en._today + '|1', now.getTime()]);
  } else {
    const r = t.rows[idx], row = idx + 2;
    const same = String(r.dailyCount).indexOf(en._today) === 0;
    const cnt = (same ? Number(String(r.dailyCount).split('|')[1]) || 0 : 0) + 1;
    pl.getRange(row, 2, 1, 6).setValues([[en.nickname, r.firstSeen, now, (Number(r.sessions) || 0) + 1, en._today + '|' + cnt, now.getTime()]]);
  }
}
function seen_(sid) {
  const sh = SS_().getSheetByName('Leaderboard');
  if (sh.getLastRow() < 2) return false;
  const col = TABS.Leaderboard.indexOf('sessionId') + 1;
  return sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues().some(r => r[0] === sid);
}
function append_(name, obj) {
  const sh = SS_().getSheetByName(name);
  sh.appendRow(TABS[name].map(h => obj[h] === undefined ? '' : obj[h]));
}
function appendSession_(r) {
  if (!r || typeof r !== 'object') return;
  const c = r.counts || {}, t = r.timing || {}, co = r.coordination || {}, rf = r.reflex || {}, bs = r.beatsync || {};
  const o = {
    ts: new Date(), sessionId: str_(r.sessionId, 64), playerId: str_(r.playerId, 64), nickname: str_(r.nickname, 16),
    age: num_(r.age, 0, 120, ''), ageBand: str_(r.ageBand, 8), gender: str_(r.gender, 3), hand: str_(r.hand, 2),
    musicExp: str_(r.musicExp, 6), mode: str_(r.mode, 10), songId: str_(r.songId, 64), difficulty: str_(r.difficulty, 10),
    score: num_(r.score, 0, 1e9, 0), grade: str_(r.grade, 2), accuracy: num_(r.accuracy, 0, 100, 0),
    maxCombo: num_(r.maxCombo, 0, 1e5, 0), fullCombo: r.fullCombo === true,
    perfect: num_(c.PERFECT, 0, 1e5, 0), great: num_(c.GREAT, 0, 1e5, 0), good: num_(c.GOOD, 0, 1e5, 0),
    miss: num_(c.MISS, 0, 1e5, 0), wrong: num_(c.WRONG, 0, 1e5, 0), stray: num_(c.STRAY, 0, 1e5, 0),
    meanAsyncMs: num_(t.meanAsyncMs, -2000, 2000, ''), sdAsyncMs: num_(t.sdAsyncMs, 0, 2000, ''), R: num_(t.R, 0, 1, ''),
    chordSimulMs: num_(co.chordSimulMs, 0, 2000, ''), limbIndependence: num_(co.limbIndependence, 0, 5, ''),
    srtMedian: num_(rf.srt && rf.srt.median, 0, 3000, ''), crtMedian: num_(rf.crt && rf.crt.median, 0, 4000, ''),
    crtErr: num_(rf.crt && rf.crt.errRate, 0, 1, ''),
    beatsyncSd600: num_(bs.ioi600 && bs.ioi600.sd, 0, 1000, ''),
    rhythmIndex: num_(r.rhythmIndex, 0, 100, ''), coordinationIndex: num_(r.coordinationIndex, 0, 100, ''),
    perPadJSON: JSON.stringify(r.perPad || {}).slice(0, 4000), confusionJSON: JSON.stringify(r.confusion || {}).slice(0, 4000),
    appVersion: str_(r.appVersion, 12), userAgent: str_(r.userAgent, 200)
  };
  append_('Sessions', o);
}

// ---------------------------------------------------------------- boards
function periodOk_(row, period, season) {
  if (period === 'season') return String(row.season) === season;
  const ts = new Date(row.ts).getTime(), now = Date.now();
  if (period === 'week') return now - ts < 7 * 864e5;
  if (period === 'today') {
    const tz = Session.getScriptTimeZone();
    return Utilities.formatDate(new Date(row.ts), tz, 'yyyyMMdd') === Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  }
  return true;
}
/** Best value per player for a board after filters; returns sorted array of row copies. */
function boardRows_(p) {
  const b = BOARDS[p.board || 'score'] || BOARDS.score;
  const col = b[0], lower = b[1], season = cfg_('currentSeason');
  const isReflex = (p.board === 'srt' || p.board === 'crt' || p.board === 'rhythm');
  const best = {};
  table_('Leaderboard').rows.forEach(r => {
    if (r.hidden === true || String(r.hidden).toLowerCase() === 'true') return;
    if (r.songId !== (p.song || 'buds-of-a-heartbeat') && !isReflex) return;
    if (!isReflex && p.difficulty && r.difficulty !== p.difficulty) return;
    if (p.board === 'rhythm' && !(Number(r.rhythmIndex) > 0)) return;
    const v = Number(r[col]); if (!(v > 0)) return;
    if (!periodOk_(r, p.period || 'all', season)) return;
    if (p.ageBand && r.ageBand !== p.ageBand) return;
    if (p.gender && !(r.gender === p.gender && (r.showGender === true || String(r.showGender).toLowerCase() === 'true'))) return;
    const cur = best[r.playerId];
    if (!cur || (lower ? v < cur.value : v > cur.value)) best[r.playerId] = { row: r, value: v };
  });
  const arr = Object.keys(best).map(k => best[k]);
  arr.sort((a, b2) => lower ? a.value - b2.value : b2.value - a.value);
  return arr;
}
function getBoard_(p) {
  const key = ['b', ver_(), p.board, p.song, p.difficulty, p.period, p.ageBand, p.gender, p.limit].join('|');
  const cache = CacheService.getScriptCache();
  let base = cache.get(key), res;
  const limit = num_(p.limit, 1, 50, 10);
  if (base) res = JSON.parse(base);
  else {
    const arr = boardRows_(p);
    const showG = r => r.showGender === true || String(r.showGender).toLowerCase() === 'true';
    res = { ok: true, updated: new Date().toISOString(), version: ver_(), n: arr.length,
      all: arr.map((x, i) => ({ rank: i + 1, pid: x.row.playerId, nickname: x.row.nickname, avatarColor: x.row.avatarColor,
        ageBand: x.row.ageBand, gender: showG(x.row) ? x.row.gender : undefined, value: x.value,
        date: Utilities.formatDate(new Date(x.row.ts), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        isNew: Date.now() - new Date(x.row.ts).getTime() < 60000, sid: x.row.sessionId })) };
    try { cache.put(key, JSON.stringify(res), 15); } catch (e) {}
  }
  const out = { ok: true, updated: res.updated, version: res.version, n: res.n,
    rows: res.all.slice(0, limit).map(r => { const c = Object.assign({}, r); delete c.pid; return c; }), me: null };
  if (p.playerId) { const m = res.all.filter(r => r.pid === p.playerId)[0]; if (m) out.me = { rank: m.rank, value: m.value }; }
  return out;
}
function ranks_(en) {
  const out = {};
  Object.keys(BOARDS).forEach(b => {
    const col = BOARDS[b][0];
    if (!(Number(en[col]) > 0)) return;
    const base = { board: b, song: en.songId, difficulty: (b === 'score' || b === 'accuracy' || b === 'combo') ? en.difficulty : '', period: 'all' };
    const all = boardRows_(base);
    const mine = all.findIndex(x => x.row.playerId === en.playerId);
    if (mine < 0) return;
    const band = all.filter(x => x.row.ageBand === en.ageBand);
    const bi = band.findIndex(x => x.row.playerId === en.playerId);
    out[b] = { global: mine + 1, n: all.length, pct: Math.round((1 - mine / Math.max(1, all.length)) * 100),
               band: en.ageBand, bandRank: bi + 1, bandN: band.length };
  });
  return out;
}

// ---------------------------------------------------------------- norms
function hourlyNorms() {
  const rows = table_('Sessions').rows;
  const sh = SS_().getSheetByName('NormsAgg');
  const out = [];
  const lowerBetter = { srtMedian: 1, crtMedian: 1, beatsyncSd600: 1 };
  Object.keys(NORM_METRICS).forEach(m => {
    const col = NORM_METRICS[m];
    const best = {};
    rows.forEach(r => {
      const v = Number(r[col]); if (!(v > 0) || !r.ageBand) return;
      const k = r.playerId, cur = best[k];
      if (!cur || (lowerBetter[col] ? v < cur.v : v > cur.v)) best[k] = { v: v, ageBand: r.ageBand, gender: r.gender };
    });
    const list = Object.keys(best).map(k => best[k]);
    const cells = {};
    list.forEach(x => {
      [[x.ageBand, x.gender], [x.ageBand, 'ALL']].forEach(c => { const k = c.join('|'); (cells[k] = cells[k] || []).push(x.v); });
    });
    Object.keys(cells).forEach(k => {
      const v = cells[k].sort((a, b) => a - b); if (v.length < 30) return;
      const q = f => v[Math.min(v.length - 1, Math.floor(f * v.length))];
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (v.length - 1));
      const parts = k.split('|');
      out.push([m, parts[0], parts[1], v.length, q(.1), q(.2), q(.3), q(.4), q(.5), q(.6), q(.7), q(.8), q(.9), +mean.toFixed(2), +sd.toFixed(2), new Date()]);
    });
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, TABS.NormsAgg.length).clearContent();
  if (out.length) sh.getRange(2, 1, out.length, TABS.NormsAgg.length).setValues(out);
  bumpVersion_();
}
function getNorms_(p) {
  const rows = table_('NormsAgg').rows.filter(r => r.metric === p.metric &&
    (!p.ageBand || r.ageBand === p.ageBand) && (!p.gender || r.gender === p.gender));
  return { ok: true, updated: new Date().toISOString(),
    cells: rows.map(r => ({ ageBand: r.ageBand, gender: r.gender, n: r.n, mean: r.mean, sd: r.sd,
      deciles: [r.p10, r.p20, r.p30, r.p40, r.p50, r.p60, r.p70, r.p80, r.p90] })) };
}

// ---------------------------------------------------------------- web app entry points
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'leaderboard') return json_(getBoard_(p));
    if (p.action === 'norms') return json_(getNorms_(p));
    return json_({ ok: true, version: ver_(), season: cfg_('currentSeason'), server: APP_VERSION_SERVER });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  let body = null;
  try {
    body = JSON.parse(e.postData.contents);
    if (body.action !== 'submit') throw 'bad action';
    lock.waitLock(10000);
    const v = validate_(body.entry);
    if (!v.ok) { log_(body, v.reason); return json_({ ok: false, error: v.reason }); }
    const en = v.entry;
    if (seen_(en.sessionId)) return json_({ ok: true, dedup: true, ranks: ranks_(en) });
    if (body.record) { body.record.sessionId = en.sessionId; body.record.playerId = en.playerId; body.record.nickname = en.nickname; appendSession_(body.record); }
    touchPlayer_(en);
    append_('Leaderboard', Object.assign({}, en, { hidden: false }));
    bumpVersion_();
    return json_({ ok: true, ranks: ranks_(en) });
  } catch (err) {
    try { log_(body || {}, 'exception: ' + err); } catch (x) {}
    return json_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
