import { createGame, addPlayer, removePlayer, applyAction, tickGame, getStats, getPlayerSpeed, getRaySpeedMultiplier, packGameState, unpackGameState, xpForLevel, getUpgradeCost, UPGRADE_CATALOG, ORB_CATALOG, LANE_COUNT } from './game.js';
import { OrbitArena } from './arena.js';
import { createActivityBridge } from './activity.js';
import { GameAudio } from './audio.js';
import { VoiceMeter } from './microphone.js';
import { MOVE_CATALOG, ORB_UPGRADE_CATALOG, getMoveStats, getMoveCost, getMoveUnlockRound, getOrbUpgradeCost, getOrbUpgradeUnlockRound, getLightCapacity } from './game.js';

const paths = {
  orbit:'<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="7" r="1.5" fill="currentColor"/>',
  prism:'<path d="m12 3 10 18H2L12 3Z"/><path d="m12 3 3 18M12 12 2 21m10-9 10 9M4 9h4m9 0h4"/>',
  zap:'<path d="m13 2-9 12h7l-1 8L21 9h-8l0-7Z"/>',
  sparkles:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/><path d="m20 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/>',
  gem:'<path d="m6 3-4 6 10 12L22 9l-4-6H6Z"/><path d="M2 9h20M8 3l4 18 4-18"/>',
  trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-5 2h10m-8-2h6"/>',
  sound:'<path d="M11 4 6 8H2v8h4l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="M11 4 6 8H2v8h4l5 4V4Zm5 5 6 6m0-6-6 6"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  settings:'<path d="m9 3-1 3-3 1 1 4-1 3 3 2 1 5h6l1-5 3-2-1-3 1-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  book:'<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1V5Z"/>',
  swords:'<path d="m4 3 6 3 10 12-2 2L6 10 4 3Zm16 0-6 3-3 4m-2 3-5 5 2 2 5-5M3 21l3-3m15 3-3-3"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 7a7 7 0 0 1 11.6-2L20 8M4 16l2.8 3A7 7 0 0 0 18.4 17"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/>',
  collision:'<path d="m12 2 2 6 6-2-3 6 5 3-7 1-3 6-3-6-7-1 5-3-3-6 6 2 2-6Z"/>',
  chart:'<path d="M3 3v18h18M7 16l4-6 4 3 5-8"/>',
  star:'<path d="m12 2 3.1 6.4 7 1-5 5 1.2 7L12 18l-6.3 3.4 1.2-7-5-5 7-1L12 2Z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
};
const icon = (name, cls = '') => `<svg ${cls ? `class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (v) => Math.floor(v || 0).toLocaleString('en');
const rarityColors = { common:'#b5c7b9', rare:'#a7bdf2', epic:'#c3a0e7', legendary:'#e7cc8a' };
const catalog = new Map(UPGRADE_CATALOG.map((u) => [u.id, u]));
const $ = (id) => document.getElementById(id);
const put = (id, text) => { const e = $(id); if (e && e.textContent !== String(text)) e.textContent = text; };
function readProfile() { try { return JSON.parse(localStorage.getItem('rogue-refract:profile:v1')) || {}; } catch { return {}; } }
const profile = { best:0, bestHeat:0, completed:0, sound:true, name:'You', ...readProfile() };
if (window.parent !== window) document.documentElement.dataset.embedded = 'true';
function saveProfile() { try { localStorage.setItem('rogue-refract:profile:v1', JSON.stringify(profile)); } catch { /* Private browsing still supports a complete run. */ } }

document.getElementById('app').innerHTML = `
<div class="app-shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark">${icon('prism')}</span><span class="brand-name">rogue<span>refract</span></span><span class="brand-version">EARLY ORBIT</span></div>
    <div class="top-actions"><span class="connection-pill"><i class="status-dot"></i><span id="connection-label">SOLO PRACTICE</span></span><button id="lobby-button" class="secondary-button" aria-label="Back to lobby" hidden>${icon('arrow')}<span>Back to lobby</span></button><button id="details-button" class="secondary-button details-button">${icon('chart')}<span>Run details</span></button><button id="sound-button" class="icon-button" aria-label="Mute sound effects" title="Toggle sound">${icon(profile.sound ? 'sound' : 'mute')}</button><button id="fullscreen-button" class="icon-button" aria-label="Toggle fullscreen" title="Fullscreen (F)">${icon('expand')}</button><button id="settings-button" class="icon-button" aria-label="Settings" title="Settings">${icon('settings')}</button></div>
  </header>
  <main class="play-layout">
    <section class="intro"><div><div class="eyebrow">FIVE RINGS. NO BRAKES.</div><h1>A little chaos. <em>A lot of orbit.</em></h1></div><div class="round-summary"><div><div class="mini-label">HEAT</div><div class="round-number"><b id="round-number">01</b></div></div><div class="timer-box"><div class="mini-label" id="timer-label">ROUND TIME</div><div id="timer" class="timer">01:00</div></div></div></section>
    <section class="panel pilot-panel run-hud" aria-label="Your pilot">
      <div class="pilot"><div class="avatar" id="pilot-avatar">Y</div><div><div class="pilot-name" id="pilot-name">You</div><span class="level-badge" id="level-badge">LV. 1</span></div></div>
      <div class="score-block"><div class="score-label">TOTAL SCORE</div><div class="score-value" id="score">0</div><div class="score-caption"><span id="heat-score">+0</span> this heat</div></div>
      <div class="xp-block"><div class="xp-label"><strong id="xp-level">LEVEL 1</strong><span id="xp-number">0 / 75 XP</span></div><div class="xp-track" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="xp-track"><div class="xp-fill" id="xp-fill"></div></div><div class="xp-caption" id="banked-upgrades">Level up for a free upgrade.</div></div>
      <div class="wallet"><span class="wallet-label">${icon('gem')}<span>SHARDS</span></span><strong class="wallet-value" id="credits">60</strong></div>
    </section>
    <section class="center-column" aria-label="Orbit arena">
      <div class="panel arena-panel">
        <div class="arena-top"><h2 class="arena-title">${icon('orbit')} The refraction field</h2><div class="field-effects" id="field-effects" aria-live="off"><span id="beam-count">3 BEAMS</span><span id="ray-speed">1.00x RAY SPEED</span><span id="pilot-effect" hidden></span></div><span class="arena-status"><i class="status-dot"></i><span id="arena-status">PRACTICE LOBBY</span></span></div>
        <div class="arena-stage">
          <canvas id="arena" class="arena-canvas" tabindex="0" aria-label="Five orbit rings. Use A and D or 1 through 5 to change rings, Space to burst. Absorb power-up orbs by touching them with your avatar.">Your browser needs canvas support to display the orbit.</canvas>
          <div class="arena-coordinate">FIELD <span>R-01</span><br><span id="field-phase">AWAITING LAUNCH</span></div><div class="arena-coordinate right"><span id="pilot-count">06</span> PILOTS<br>MOVE TO ABSORB ORBS</div>
          <div class="battle-roster" id="battle-roster" aria-label="Player health" hidden></div>
          <div class="levelup-banner" id="levelup-banner" role="status" aria-live="polite" hidden><span class="levelup-emblem">${icon('sparkles')}</span><span><strong id="levelup-title">LEVEL UP</strong><small>FREE UPGRADE BANKED</small></span><b id="levelup-number">02</b></div>
          <div class="arena-overlay"><span class="arena-message" id="arena-message">${icon('sparkles')} Find your ring. Catch the chaos.</span></div>
          <section class="upgrade-section" id="shop" aria-labelledby="shop-title" tabindex="-1" hidden>
            <div class="upgrade-header"><div><div class="eyebrow" id="shop-tag">BUY ROUND</div><div class="upgrade-heading"><h2 id="shop-title">Build something ridiculous.</h2></div><p id="shop-subtitle">Choose your next advantage.</p></div><div class="shop-actions"><span class="free-token" id="free-tokens" hidden></span><button class="secondary-button" id="reroll-button">${icon('refresh')}<span id="reroll-label">Reroll / 35</span></button></div></div>
            <div class="shop-tabs" id="shop-tabs" role="group" aria-label="Shop category" hidden><button data-shop-tab="moves" aria-pressed="false">Battle moves</button><button data-shop-tab="orbs" aria-pressed="false">Light orbs</button><button data-shop-tab="orbit" aria-pressed="true">Orbit upgrades</button></div>
            <div class="upgrade-grid" id="upgrade-grid"></div>
            <div class="shop-bottom"><span class="shop-locked-note" id="shop-note">${icon('gem')} +35 END-OF-HEAT SHARDS</span><div><button class="text-button" id="results-button">Heat results ${icon('chart')}</button><button class="text-button" id="library-button">Upgrade index ${icon('arrow')}</button></div></div>
          </section>
        </div>
        <div class="arena-controls"><div class="lane-controls"><span class="lane-caption">RING <b id="current-ring">1</b></span><div class="lane-group" role="group" aria-label="Orbit ring">${Array.from({length:5},(_,i)=>`<button data-lane="${i}" aria-label="Ring ${i+1}" aria-pressed="${i===0}" title="Ring ${i+1} (press ${i+1})"><span>${i+1}</span></button>`).join('')}</div><span class="lane-hint">A / D to shift</span></div><button class="boost-button" id="boost-button">${icon('zap')}<span id="boost-label">Orbit burst</span><kbd class="keycap">SPACE</kbd></button></div>
        <section class="battle-console" id="battle-console" aria-label="Battle controls" hidden>
          <div class="battle-status-row"><div class="health-meter"><span>YOUR HEALTH <strong id="health-value">100 / 100</strong></span><div class="health-track" role="progressbar" aria-label="Your health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" id="health-track"><i id="health-fill"></i></div></div><div class="light-meter"><small>LIGHT POINTS</small><strong id="light-points">0 / 20 LP</strong></div><span id="turn-status"></span></div>
          <div class="battle-action-row"><label class="target-picker"><span>1. Choose a target</span><select id="battle-target" aria-label="Choose a battle target"><option value="">Choose before every cast</option></select></label><p id="battle-hint">2. Choose a move. Collect glowing orbs for LP.</p><button id="pass-turn-button" class="secondary-button" hidden>Pass turn</button></div>
          <div class="battle-moves" id="battle-moves">${MOVE_CATALOG.map((move)=>`<button class="move-button" data-cast="${move.id}" style="--move-color:${move.color}" disabled><strong>${escape(move.name)}</strong><span></span><small>Buy in the shop</small></button>`).join('')}</div>
          <p class="battle-feedback" id="battle-feedback" role="status" aria-live="polite">Touch Light orbs to fuel your moves.</p>
        </section>
        <div class="arena-tip"><span>${icon('info')} <b>Move to an orb to absorb it.</b> Stack beams. Ice your rivals. Steal time.</span><span>1-5 select a ring</span></div>
      </div>
      <div class="play-bar"><div><h3 class="play-bar-title" id="play-title">Your next obsession starts here.</h3><p id="play-description">60-second heats. Temporary power-ups. Absolute chaos.</p><div class="mode-picker" id="mode-picker" role="group" aria-label="Game mode"><button data-mode="orbit" aria-pressed="true">${icon('orbit')} Orbit</button><button data-mode="battle" aria-pressed="false">${icon('swords')} Battle</button><button id="battle-guide-button" class="text-button" aria-label="Battle guide">${icon('info')}</button></div><div class="combat-style-picker" id="combat-style-picker" role="group" aria-label="Combat style" hidden><button data-combat-style="turn-based" aria-pressed="true">Turn based · LP + PP</button><button data-combat-style="no-limits" aria-pressed="false">No limits · cooldowns</button></div></div><button id="play-button" class="primary-button"><span id="play-label">Enter the orbit</span>${icon('arrow')}</button></div>
    </section>
  </main>
  <footer class="footer"><span>NO FINISH LINE. JUST ONE MORE REVOLUTION.</span><span class="footer-refract"><img src="./assets/refract-icon.png" alt="" /> MADE FOR <a href="https://refract.chat" target="_blank" rel="noreferrer">REFRACT.CHAT</a><button class="text-button" id="help-button">How to play ${icon('info')}</button></span></footer>
</div>
<dialog id="run-details" aria-labelledby="details-title"><div class="dialog-header"><div><div class="eyebrow">YOUR RUN, AT A GLANCE</div><h2 id="details-title">Behind the chaos.</h2></div><button id="details-close" class="icon-button" aria-label="Close run details">${icon('close')}</button></div><div class="dialog-body details-grid">
  <section class="panel"><div class="leaderboard-heading"><div class="section-label">THE LEADERBOARD <span id="leaderboard-type">THIS RUN</span></div></div><div id="leaderboard" class="leaderboard-list"></div><div class="leaderboard-footer"><span id="roster-caption">YOU + 5 PRACTICE BOTS</span><span class="live-label" id="sync-label">LOCAL</span></div></section>
  <div class="column"><section class="panel panel-padding"><div class="section-label">PILOT STATS ${icon('orbit')}</div><div class="stat-grid"><div><div class="stat-label">${icon('zap')} Spin speed</div><div class="stat-value"><span id="stat-speed">1.00</span><small>x</small></div></div><div><div class="stat-label">${icon('sparkles')} Crit chance</div><div class="stat-value" id="stat-crit">8%</div></div><div><div class="stat-label">${icon('sun')} Ray hits</div><div class="stat-value" id="stat-hits">0</div></div><div><div class="stat-label">${icon('orbit')} Revolutions</div><div class="stat-value" id="stat-laps">0</div></div></div></section><section class="panel panel-padding build-panel"><div class="section-label">YOUR BUILD <span id="build-count">00</span></div><div class="run-build" id="run-build"><p class="empty-build">Your next build starts in the buy round.</p></div></section><div class="personal-best">${icon('trophy')}<div><span>YOUR PERSONAL BEST</span><strong id="personal-best">0 points</strong></div></div></div>
  <section class="panel panel-padding mic-card"><div class="mic-icon">${icon('mic')}</div><h3 id="mic-title">Make some noise.</h3><p id="mic-description">Solar Surges turn your voice into bonus points. Opt in, then keep an eye on the countdown.</p><div class="mic-meter" id="mic-meter" aria-label="Microphone level" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden>${'<i></i>'.repeat(24)}</div><button class="secondary-button" id="mic-button">${icon('mic')} <span id="mic-button-label">Enable microphone</span></button><div class="mic-privacy" id="mic-note">OPT-IN / NORMAL SPEAKING IS ENOUGH</div></section>
</div></dialog>
<div class="toast-stack" id="toasts" role="status" aria-live="polite"></div>
<dialog id="modal" aria-labelledby="modal-title"><div class="dialog-header"><div><div class="eyebrow" id="modal-eyebrow">ORBITAL FIELD GUIDE</div><h2 id="modal-title">How to play</h2></div><button class="icon-button" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body" id="modal-body"></div></dialog>`;

const audio = new GameAudio();
audio.setEnabled(profile.sound);
let state = createGame();
let selfId = 'you';
let bridge;
let mode = 'solo';
let snapshotReady = window.parent === window;
let lastTick = Date.now();
let lastSnapshotAt = performance.now();
let clockOffset = 0;
let seenEvent = 0;
let shopSignature = '';
let buildSignature = '';
let leaderboardSignature = '';
let avatarSignature = '';
let countdownSecond = -1;
let modalKind = '';
let errorAt = 0;
let nextVoiceAt = 0;
let micBusy = false;
let levelupTimer;
let shopTab = 'orbit';
let selectedTarget = '';
let targetSignature = '';
let battleRosterSignature = '';

function addPracticeRoster() {
  addPlayer(state, { id:'you', name:profile.name, color:'#bcf6cf' });
  ['Nova','Echo','Sol','Glitch','Vesper'].forEach((name, i) => addPlayer(state, { id:`bot-${i}`, name, bot:true }));
}
addPracticeRoster();
const me = () => state.players.find((p) => p.id === selfId);
const gameNow = () => Date.now() + clockOffset;
function toast(text, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`; node.textContent = text;
  $('toasts').append(node);
  while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove();
  setTimeout(() => node.remove(), 4200);
}

const mic = new VoiceMeter({
  onLevel(level) {
    $('mic-meter').setAttribute('aria-valuenow', String(Math.round(level * 100)));
    [...$('mic-meter').children].forEach((bar, i) => { const lit = i < level * 24; bar.classList.toggle('lit', lit); bar.style.height = `${lit ? 8 + Math.sin(i * 0.8) * 5 + level * 11 : 4}px`; });
  },
  onError(message) { toast(message, 'error'); put('mic-note', message); $('mic-meter').hidden = true; put('mic-button-label','Enable microphone'); },
});
const arena = new OrbitArena($('arena'));

function showLevelUp(level) {
  clearTimeout(levelupTimer);
  const banner = $('levelup-banner');
  put('levelup-title', `LEVEL ${level} UNLOCKED`);
  put('levelup-number', String(level).padStart(2, '0'));
  banner.hidden = false;
  const reduced = arena.reducedMotion;
  banner.classList.toggle('reduced-effects', reduced);
  if (!reduced) {
    banner.getAnimations().forEach((animation) => animation.cancel());
    banner.animate([{ opacity:0, transform:'translate(-50%, -10px) scale(.94)' }, { opacity:1, transform:'translate(-50%, 0) scale(1)' }], { duration:280, easing:'ease-out' });
    $('level-badge').animate([{ boxShadow:'0 0 0 0 #bcf6cf00' }, { boxShadow:'0 0 22px 6px #bcf6cf66', color:'#fff' }, { boxShadow:'0 0 0 0 #bcf6cf00' }], { duration:1000 });
  }
  levelupTimer = setTimeout(() => { banner.hidden = true; }, 2400);
}

function validateState(s) {
  try { s = unpackGameState(s); } catch { return false; }
  return s?.version === 1 && ['lobby','playing','shop'].includes(s.phase) && Number.isFinite(s.now) && Number.isFinite(s.phaseEndsAt)
    && Number.isSafeInteger(s.eventSeq) && Array.isArray(s.players) && s.players.length <= 8
    && s.players.every((p) => typeof p.id === 'string' && typeof p.name === 'string' && /^#[\da-f]{6}$/i.test(p.color) && Number.isFinite(p.score) && Number.isFinite(p.angle) && p.upgrades && typeof p.upgrades === 'object')
    && Array.isArray(s.events) && Array.isArray(s.rays) && Array.isArray(s.pickups) && s.surge;
}

function reconcileRoster(people) {
  const active = people.slice(0, 8);
  const ids = new Set(active.map((p) => String(p.id)));
  for (const p of [...state.players]) if (!ids.has(p.id)) removePlayer(state, p.id);
  for (const person of active) {
    const p = addPlayer(state, { ...person, id:String(person.id) });
    if (p) { p.name = String(person.name).slice(0, 32); p.avatarUrl = person.avatarUrl || null; }
  }
}

function publish() {
  if (!bridge?.isHost) return;
  // Avatars come from the authenticated roster and need not use relay payload space.
  const snapshot = { ...state, players:state.players.map((p) => ({...p,avatarUrl:null})) };
  bridge.publishState(packGameState(snapshot));
}

function processEvents() {
  const fresh = state.events.filter((e) => e.id > seenEvent);
  seenEvent = Math.max(seenEvent, state.eventSeq);
  for (const event of fresh) {
    const recent = gameNow() - event.at < 1500;
    if (recent) arena.emit(event, state, selfId);
    if (event.playerId === selfId && recent) {
      const sound = event.type === 'ray' && event.critical ? 'critical' : event.type === 'surge' ? 'voice' : event.type;
      audio.play(sound);
      if (event.type === 'levelup') showLevelUp(event.amount);
      if (event.type === 'purchase' || event.type === 'collect') toast(event.text, 'success');
    }
    if (event.type === 'round-start') { if (recent) audio.play('start'); if (['results', 'library'].includes(modalKind)) closeModal(); }
    if (event.type === 'surge-start' && recent) toast(mic.enabled ? 'Solar Surge! Speak to turn your voice into points.' : 'Solar Surge! Your mic can score for the next 8 seconds.');
    if (event.type === 'round-end') {
      if (recent) audio.play('roundend');
      const p = me();
      if (p) { profile.completed++; profile.bestHeat = Math.max(profile.bestHeat, p.roundScore); profile.best = Math.max(profile.best, p.score); saveProfile(); }
      $('levelup-banner').hidden = true;
    }
    if (event.type === 'cast' && recent) {
      const caster = state.players.find((pilot)=>pilot.id===event.playerId);
      const target = state.players.find((pilot)=>pilot.id===event.otherId);
      put('battle-feedback', event.text || `${caster?.name || 'Pilot'} used ${MOVE_CATALOG.find((move)=>move.id===event.moveId)?.name || 'a move'} on ${target?.name || 'a pilot'}.`);
      if (event.playerId===selfId) { selectedTarget=''; $('battle-target').value=''; }
      if (event.playerId===selfId || event.otherId===selfId) audio.play('collision');
    }
    if (event.type === 'knockout' && recent) toast(event.text || 'A pilot has been eliminated.');
    if (event.type === 'winner' && recent) { audio.play('roundend'); toast(`${state.players.find((pilot)=>pilot.id===event.playerId)?.name || 'Last pilot'}: Winner winner chicken dinner!`, 'success'); }
    if (event.type === 'round-start' || event.type === 'lobby') { selectedTarget=''; targetSignature=''; put('battle-feedback','Touch Light orbs to fuel your moves.'); }
    if (event.type === 'lobby') { clearTimeout(levelupTimer); $('levelup-banner').hidden=true; }
    if (event.type === 'reset') { clearTimeout(levelupTimer); $('levelup-banner').hidden = true; saveProfile(); toast('Fresh run. A new orbit awaits.'); }
  }
}

function rebaseClock(value, delta) {
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && item > 0 && (key === 'now' || /(At|Until)$/.test(key))) value[key] += delta;
    else if (item && typeof item === 'object') rebaseClock(item, delta);
  }
}

bridge = createActivityBridge({
  validateState:(s) => Boolean(validateState(s)),
  onConnection(next) { mode = next; put('connection-label', next === 'refract' ? 'REFRACT CONNECTED' : next === 'connecting' ? 'CONNECTING TO REFRACT' : 'SOLO PRACTICE'); },
  onReady(info) {
    selfId = String(info.self.id);
    if (info.mode === 'solo') { snapshotReady = true; }
    else if (info.isHost) { state = createGame(); reconcileRoster(info.participants); snapshotReady = true; seenEvent = 0; }
    else { state = createGame(); reconcileRoster(info.participants); snapshotReady = false; }
    lastTick = Date.now(); lastSnapshotAt = performance.now();
    if (info.isHost) publish();
    renderUI();
  },
  onParticipants(people, metadata) {
    if (metadata.isHost) {
      if (metadata.hostChanged) {
        const delta = Date.now() - state.now;
        rebaseClock(state, delta); clockOffset = 0; lastTick = Date.now();
        toast('You are coordinating the orbit. The run continues.');
      }
      reconcileRoster(people); snapshotReady = true; publish();
    }
    renderUI();
  },
  onState(snapshot) {
    state = unpackGameState(snapshot);
    for (const p of state.players) p.avatarUrl = bridge.participants.find((person) => String(person.id) === p.id)?.avatarUrl || null;
    clockOffset = state.now - Date.now(); lastSnapshotAt = performance.now(); snapshotReady = true;
    processEvents(); renderUI();
  },
  onAction(fromId, action) {
    const id = String(fromId);
    if (['start','reset','mode','combat-style','lobby'].includes(action.type) && id !== String(bridge.participants[0]?.id)) return;
    const result = applyAction(state, id, action, Date.now());
    if (!result.ok && id === selfId && action.type !== 'voice') { audio.play('error'); toast(result.error, 'error'); }
    if (result.ok && action.type !== 'voice') { processEvents(); publish(); renderUI(); }
  },
  onError(error) { if (Date.now() - errorAt > 6000) { toast(error.message, 'error'); errorAt = Date.now(); } },
});

function send(action) {
  audio.unlock();
  if (!snapshotReady || !bridge.sendAction(action)) toast('Waiting for the orbit coordinator. Try again in a moment.');
}

function upgradeCard(item, p, library = false) {
  const level = p?.upgrades[item.id] || 0;
  const free = (p?.upgradeTokens || 0) > 0;
  const price = p ? getUpgradeCost(p, item.id) : item.cost;
  const available = state.phase === 'shop' && !library && snapshotReady;
  const affordable = free || (p?.credits || 0) >= price;
  return `<article class="upgrade-card ${available ? 'available' : ''}" style="--rarity:${rarityColors[item.rarity]}"><div class="upgrade-card-top"><span class="upgrade-icon">${icon(item.icon)}</span><span class="rarity">${item.rarity.toUpperCase()}</span></div><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p>${library ? `<div class="upgrade-card-footer"><span>${escape(item.category)} · MAX ${item.maxLevel}</span><span>${item.cost} SHARDS</span></div>` : `<div class="upgrade-card-footer"><span>${available ? `${level ? `LV ${level} → ${level + 1}` : 'ADD TO YOUR BUILD'}` : `${icon('lock')} BETWEEN ROUNDS`}</span><button class="buy-button ${available && free ? 'free' : ''}" data-buy="${item.id}" ${!available || !affordable ? 'disabled' : ''} aria-label="${free && available ? 'Claim' : 'Buy'} ${escape(item.name)}">${available && free ? icon('sparkles') + 'Free choice' : icon('gem') + format(price)}</button></div>`}</article>`;
}

function moveShopCard(move, p) {
  const level = p.moves?.[move.id] || 0;
  const next = getMoveStats(p, move.id, Math.min(move.maxLevel,level+1));
  const maxed = level >= move.maxLevel;
  const unlock = getMoveUnlockRound(p, move.id);
  const locked = unlock > Math.max(1, state.round + 1);
  const free = p.upgradeTokens > 0;
  const price = getMoveCost(p, move.id);
  const allowed = snapshotReady && !maxed && !locked && (free || p.credits >= price);
  const effect = move.type === 'attack' ? `${next.power} damage` : move.type === 'heal' ? `${next.power} HP heal` : move.type === 'shield' ? `${next.power} shield / ${next.duration}s` : move.type === 'reflect' ? `Reflect next hit / ${next.duration}s` : `${next.power} damage / ${next.duration}s stun`;
  const resources=state.combatStyle==='no-limits' ? '2.5s cooldown' : `${next.lightCost} LP · ${next.maxPP} PP / heat`;
  return `<article class="upgrade-card move-shop-card" style="--rarity:${move.color}"><div class="upgrade-card-top"><span class="upgrade-icon">${icon(move.icon)}</span><span class="rarity">${escape(move.type.toUpperCase())} · RANK ${level}/${move.maxLevel}</span></div><h3>${escape(move.name)} ${level ? `<small>R${level}</small>` : ''}</h3><p>${escape(move.description)} <span class="move-detail">${level && !maxed ? `Next rank: ` : ''}${effect} · ${resources}</span></p><div class="upgrade-card-footer"><span>${maxed ? 'MAX RANK' : locked ? `UNLOCKS FOR HEAT ${unlock}` : level ? `RANK ${level} → ${level+1}` : 'LEARN RANK 1'}</span><button class="buy-button ${free ? 'free' : ''}" data-buy-move="${move.id}" ${allowed ? '' : 'disabled'} aria-label="${level ? 'Upgrade' : 'Buy'} ${escape(move.name)}">${maxed ? 'Max' : locked ? `Heat ${unlock}` : free ? 'Free choice' : `${icon('gem')}${format(price)}`}</button></div></article>`;
}

function orbShopCard(item, p) {
  const level = p.orbUpgrades?.[item.id] || 0;
  const maxed = level >= item.maxLevel;
  const unlock=getOrbUpgradeUnlockRound(p,item.id);
  const locked = unlock > Math.max(1,state.round+1);
  const price = getOrbUpgradeCost(p, item.id);
  const free = p.upgradeTokens > 0;
  const allowed = snapshotReady && !maxed && !locked && (free || p.credits >= price);
  return `<article class="upgrade-card" style="--rarity:#f5d584"><div class="upgrade-card-top"><span class="upgrade-icon">${icon('sun')}</span><span class="rarity">LIGHT ORBS · RANK ${level}/${item.maxLevel}</span></div><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><div class="upgrade-card-footer"><span>${maxed ? 'MAX RANK' : locked ? `UNLOCKS FOR HEAT ${level+1}` : `RANK ${level} → ${level+1}`}</span><button class="buy-button ${free ? 'free' : ''}" data-buy-orb="${item.id}" ${allowed ? '' : 'disabled'} aria-label="Buy ${escape(item.name)}">${maxed ? 'Max' : locked ? `Heat ${level+1}` : free ? 'Free choice' : `${icon('gem')}${format(price)}`}</button></div></article>`;
}

function renderBattle(p, now, spectator) {
  const active = state.gameMode === 'battle' && state.phase === 'playing';
  $('battle-console').hidden = !active;
  $('battle-roster').hidden = !active;
  if (!active) return;
  const health = Math.max(0, p.health ?? 100);
  put('health-value', `${health} / 100${p.shieldHealth > 0 && p.barrierUntil > now ? ` +${p.shieldHealth} shield` : ''}`);
  $('health-fill').style.width=`${health}%`;
  $('health-fill').style.background=health>50 ? '#bcf6cf' : health>25 ? '#f5d584' : '#ff8e91';
  $('health-track').setAttribute('aria-valuenow',String(health));
  const unlimited=state.combatStyle==='no-limits';
  const myTurn=unlimited || state.turnPlayerId===selfId;
  put('light-points', unlimited ? 'Cooldown only' : `${p.lightPoints || 0} / ${getLightCapacity(p)} LP`);
  const turnPlayer=state.players.find((pilot)=>pilot.id===state.turnPlayerId);
  put('turn-status',unlimited ? 'NO LIMITS · 2.5s COOLDOWN' : `${myTurn ? 'YOUR TURN' : `${turnPlayer?.name || 'Next pilot'} acts`} · ${Math.max(0,Math.ceil((state.turnEndsAt-now)/1000))}s`);
  const rosterSignature = JSON.stringify(state.players.map((pilot)=>[pilot.id,pilot.name,pilot.health,pilot.shieldHealth,pilot.barrierUntil > now]));
  if (rosterSignature !== battleRosterSignature) {
    battleRosterSignature=rosterSignature;
    $('battle-roster').innerHTML=state.players.map((pilot)=>`<div class="battle-pilot ${pilot.health <= 0 ? 'eliminated' : ''} ${pilot.id===selfId ? 'self' : ''}"><span class="battle-pilot-name">${escape(pilot.name)}${pilot.id===selfId ? ' (you)' : ''}</span><strong>${pilot.health <= 0 ? 'OUT' : `${pilot.health} HP`}${pilot.shieldHealth > 0 && pilot.barrierUntil > now ? ` +${pilot.shieldHealth}` : ''}</strong><div class="battle-pilot-track" role="progressbar" aria-label="${escape(pilot.name)} health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0,pilot.health)}"><i style="width:${Math.max(0,pilot.health)}%;background:${pilot.color}"></i></div></div>`).join('');
  }
  const alive=state.players.filter((pilot)=>pilot.health>0);
  if (!alive.some((pilot)=>pilot.id===selectedTarget)) selectedTarget='';
  const nextTargets = JSON.stringify(alive.map((pilot)=>pilot.id));
  if (nextTargets!==targetSignature) {
    targetSignature=nextTargets;
    $('battle-target').innerHTML='<option value="">Choose before every cast</option>'+alive.map((pilot)=>`<option value="${escape(pilot.id)}">${escape(pilot.name)}${pilot.id===selfId ? ' (self: heal / reflect / shield)' : ''}</option>`).join('');
    $('battle-target').value=selectedTarget;
  }
  for (const option of $('battle-target').options) {
    const pilot=alive.find((entry)=>entry.id===option.value);
    if (pilot) option.textContent=`${pilot.name} · ${pilot.health} HP${pilot.id===selfId ? ' (self)' : ''}`;
  }
  const disabled=spectator || !snapshotReady || health<=0 || p.stunUntil>now || p.frozenUntil>now;
  $('battle-target').disabled=disabled;
  $('pass-turn-button').hidden=unlimited;
  $('pass-turn-button').disabled=disabled || !myTurn;
  const cooldown=Math.max(0,(p.castReadyAt-now)/1000);
  put('battle-hint',health<=0 ? 'Eliminated. Watch the last pilots battle it out.' : p.stunUntil>now ? `Stunned for ${Math.ceil((p.stunUntil-now)/1000)}s` : cooldown>0 ? `Next cast in ${cooldown.toFixed(1)}s. Pick your next target.` : selectedTarget ? '2. Choose a move for this target.' : '1. Choose a target. 2. Cast a move. Orbs refill LP.');
  for (const button of $('battle-moves').children) {
    const move=MOVE_CATALOG.find((entry)=>entry.id===button.dataset.cast);
    const stats=getMoveStats(p,move.id);
    const owned=(p.moves?.[move.id] || 0)>0;
    const pp=p.movePP?.[move.id] || 0;
    const correctTarget=selectedTarget && (stats.target==='self' ? selectedTarget===selfId : selectedTarget!==selfId);
    const redundant=move.type==='heal' && health>=100 || move.type==='reflect' && p.reflectUntil>now || move.type==='shield' && p.barrierUntil>now && p.shieldHealth>0;
    const status=!owned ? 'Buy in the shop' : redundant ? move.type==='heal' ? 'Health is full' : 'Already active' : !myTurn ? 'Wait for your turn' : !unlimited && !pp ? 'No PP until buy round' : !unlimited && (p.lightPoints || 0)<stats.lightCost ? 'Collect more LP' : !selectedTarget ? 'Choose a target' : !correctTarget ? stats.target==='self' ? 'Select yourself' : 'Select an opponent' : cooldown>0 ? 'Recharging' : 'Cast';
    button.disabled=disabled || !myTurn || !owned || redundant || (!unlimited && (!pp || (p.lightPoints || 0)<stats.lightCost)) || !correctTarget || cooldown>0;
    button.querySelector('span').textContent=unlimited ? `${owned ? `R${stats.level} · ` : ''}2.5s cooldown` : owned ? `R${stats.level} · ${stats.lightCost} LP · ${pp}/${stats.maxPP} PP` : `${stats.lightCost} LP · ${stats.maxPP} PP`;
    button.querySelector('small').textContent=status;
    button.setAttribute('aria-label',`${move.name}, ${button.querySelector('span').textContent}, ${status}`);
  }
}

function renderUI() {
  const spectator = !me();
  const p = me() || addPlayer(createGame(), {id:selfId,name:bridge.self?.name || 'Spectator'});
  const now = gameNow();
  const playing = state.phase === 'playing', shopping = state.phase === 'shop';
  const battle=state.gameMode==='battle';
  const wasShopping = document.documentElement.dataset.phase === 'shop';
  document.documentElement.dataset.phase = state.phase;
  document.documentElement.dataset.gameMode = state.gameMode || 'orbit';
  if (shopping && !wasShopping) shopTab=battle ? 'moves' : 'orbit';
  if (!battle) shopTab='orbit';
  $('mode-picker').hidden=state.phase!=='lobby';
  $('combat-style-picker').hidden=state.phase!=='lobby' || !battle;
  document.querySelectorAll('[data-mode]').forEach((button)=>{button.classList.toggle('active',button.dataset.mode===(state.gameMode || 'orbit'));button.setAttribute('aria-pressed',String(button.dataset.mode===(state.gameMode || 'orbit')));button.disabled=!bridge.isHost || !snapshotReady;});
  document.querySelectorAll('[data-combat-style]').forEach((button)=>{button.classList.toggle('active',button.dataset.combatStyle===(state.combatStyle || 'turn-based'));button.setAttribute('aria-pressed',String(button.dataset.combatStyle===(state.combatStyle || 'turn-based')));button.disabled=!bridge.isHost || !snapshotReady;});
  $('lobby-button').hidden=state.phase==='lobby';
  $('lobby-button').disabled=!snapshotReady || !bridge.isHost;
  $('lobby-button').title=bridge.isHost ? 'Return everyone to the lobby. Keep builds and scores.' : 'The host can return the group to the lobby.';
  document.documentElement.classList.toggle('reduced-effects', arena.reducedMotion);
  $('shop').hidden = !shopping;
  if (wasShopping && !shopping && $('shop').contains(document.activeElement)) $('arena').focus({preventScroll:true});
  const stats = getStats(p, now);
  const seconds = state.phase === 'lobby' ? 60 : Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000));
  put('timer', `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`);
  $('timer').classList.toggle('urgent', playing && seconds <= 10);
  put('timer-label', shopping ? 'SHOP CLOSES IN' : 'ROUND TIME');
  put('round-number',String(Math.max(1,state.round)).padStart(2,'0'));
  if (playing && seconds <= 5 && seconds > 0 && countdownSecond !== seconds) { audio.play('countdown'); countdownSecond = seconds; }
  if (!playing) countdownSecond = -1;
  put('pilot-name',p.name); put('level-badge',`LV. ${p.level}`); put('score',format(p.score)); put('heat-score',`+${format(p.roundScore)}`);
  const xpPercent = Math.min(100, p.xp / xpForLevel(p.level) * 100);
  put('xp-level',`LEVEL ${p.level}`); put('xp-number',`${format(p.xp)} / ${xpForLevel(p.level)} XP`);
  $('xp-fill').style.width = `${xpPercent}%`; $('xp-track').setAttribute('aria-valuenow',String(Math.round(xpPercent)));
  put('banked-upgrades', p.upgradeTokens ? `${p.upgradeTokens} free upgrade${p.upgradeTokens === 1 ? '' : 's'} banked` : 'Level up for a free upgrade.');
  const burst = playing && p.boostUntil > now;
  put('stat-speed',(getPlayerSpeed(p, now) / 1.05).toFixed(2)); put('stat-crit',`${Math.round(stats.critChance * 100)}%`); put('stat-hits',format(p.hits)); put('stat-laps',format(p.revolutions)); put('credits',format(p.credits));
  put('current-ring', p.lane + 1);
  put('beam-count', `${state.rays.length || 3} BEAMS`);
  put('ray-speed', `${getRaySpeedMultiplier(state, now).toFixed(2)}× RAY SPEED`);
  const effectLabels = [['frozenUntil','FROZEN'],['gravityUntil','GRAVITY'],['slowUntil','ICED'],['shieldUntil','SHIELD'],['overdriveUntil','OVERDRIVE'],['echoUntil','ECHO'],['starlightUntil','STARLIGHT'],['chipUntil','SPEED']]
    .filter(([key]) => playing && p[key] > now).map(([key,label]) => `${label} ${Math.ceil((p[key]-now)/1000)}s`);
  put('pilot-effect', effectLabels.slice(0, 2).join(' · ') + (effectLabels.length > 2 ? ` +${effectLabels.length-2}` : ''));
  $('pilot-effect').hidden = effectLabels.length === 0;
  $('pilot-effect').title = effectLabels.join(' · ');
  $('pilot-effect').classList.toggle('hostile-effect', playing && (p.frozenUntil > now || p.slowUntil > now || p.gravityUntil > now));
  profile.best = Math.max(profile.best,p.score);
  put('personal-best',`${format(profile.best)} points`);
  const nextAvatarSignature = `${p.id}|${p.avatarUrl}|${p.name}`;
  if (nextAvatarSignature !== avatarSignature) {
    const avatar = $('pilot-avatar'); avatar.replaceChildren();
    if (p.avatarUrl && /^https?:\/\//.test(p.avatarUrl)) { const img = document.createElement('img'); img.src = p.avatarUrl; img.alt = ''; img.referrerPolicy = 'no-referrer'; avatar.append(img); }
    else avatar.textContent = p.name.charAt(0).toUpperCase();
    avatarSignature = nextAvatarSignature;
  }
  const nextBuildSignature = JSON.stringify([p.upgrades,p.moves,p.orbUpgrades]);
  if (nextBuildSignature !== buildSignature) {
    buildSignature = nextBuildSignature;
    $('run-build').innerHTML = [...Object.entries(p.upgrades).map(([id,level]) => `<span class="build-chip" title="${escape(catalog.get(id)?.description)}">${escape(catalog.get(id)?.name || id)} <b>×${level}</b></span>`), ...[...MOVE_CATALOG,...ORB_UPGRADE_CATALOG].filter((item)=>(p.moves?.[item.id] || p.orbUpgrades?.[item.id] || 0)>0).map((item)=>`<span class="build-chip">${escape(item.name)} <b>R${p.moves?.[item.id] || p.orbUpgrades?.[item.id]}</b></span>`)].join('') || '<p class="empty-build">A blank canvas. A dangerous amount of potential.</p>';
    put('build-count', String([...Object.values(p.upgrades),...Object.values(p.moves || {}),...Object.values(p.orbUpgrades || {})].reduce((a,b)=>a+b,0)).padStart(2,'0'));
  }
  const sorted = [...state.players].sort((a,b) => b.score - a.score);
  const nextLeaderboardSignature = sorted.map((p) => `${p.id}:${p.name}:${p.avatarUrl}:${p.score}:${p.level}`).join('|');
  if (nextLeaderboardSignature !== leaderboardSignature) {
    leaderboardSignature = nextLeaderboardSignature;
    $('leaderboard').innerHTML = sorted.map((pilot,index) => `<div class="leader-row ${pilot.id === selfId ? 'self' : ''}"><span class="rank">${String(index+1).padStart(2,'0')}</span><span class="mini-avatar" style="--color:${pilot.color}">${pilot.avatarUrl && /^https?:\/\//.test(pilot.avatarUrl) ? `<img src="${escape(pilot.avatarUrl)}" alt="" referrerpolicy="no-referrer" />` : escape(pilot.name.charAt(0).toUpperCase())}</span><div><div class="leader-name">${escape(pilot.name)}${pilot.bot ? '<small>BOT</small>' : pilot.id === selfId ? '<small>YOU</small>' : ''}</div><div class="leader-level">LEVEL ${pilot.level}</div></div><span class="leader-score">${format(pilot.score)}</span></div>`).join('');
  }
  const humans = state.players.filter((p) => !p.bot).length;
  put('pilot-count',String(state.players.length).padStart(2,'0'));
  put('roster-caption',mode === 'refract' ? `${humans} REAL PILOT${humans === 1 ? '' : 'S'} · MAX 8` : 'YOU + 5 PRACTICE BOTS');
  put('sync-label',mode === 'refract' ? 'SYNCED' : 'LOCAL');
  put('arena-status',!snapshotReady ? 'SYNCING ACTIVITY' : shopping ? 'UPGRADE INTERMISSION' : playing ? 'HEAT IN PROGRESS' : mode === 'refract' ? 'REFRACT LOBBY' : 'PRACTICE LOBBY');
  put('field-phase',playing ? (state.surge.active ? 'SOLAR SURGE' : 'PHOTONS ACTIVE') : shopping ? 'RECALIBRATING' : 'AWAITING LAUNCH');
  let message = `${icon('sparkles')} Sixty seconds. Infinite ways around.`;
  if (playing) {
    if (state.surge.active) message = `${icon('mic')} SOLAR SURGE · ${Math.max(0,Math.ceil((state.surge.endsAt - now)/1000))}s · ${mic.enabled ? 'Make some noise!' : 'Voice earns bonus points'}`;
    else if (p.starlightUntil > now) message = `${icon('star')} STARLIGHT · 1.5× points · ${Math.ceil((p.starlightUntil-now)/1000)}s`;
    else if (p.chipUntil > now) message = `${icon('gem')} REFRACT CHIP · +25% speed · ${Math.ceil((p.chipUntil-now)/1000)}s`;
    else message = `${icon('star')} Touch an orb to absorb it · ${state.surge.nextAt < state.phaseEndsAt ? `Solar Surge in ${Math.max(0,Math.ceil((state.surge.nextAt-now)/1000))}s` : 'Bring it home.'}`;
  } else if (shopping) message = `${icon('gem')} Bank the shards. Break the next round.`;
  if ($('arena-message').innerHTML !== message) $('arena-message').innerHTML = message;
  $('arena-message').classList.toggle('surge-live',playing && state.surge.active);
  document.querySelectorAll('[data-lane]').forEach((b) => { const selected = !spectator && Number(b.dataset.lane) === p.lane; b.classList.toggle('active',selected); b.setAttribute('aria-pressed',String(selected)); b.disabled = shopping || !snapshotReady || spectator || (battle && playing && (p.health<=0 || p.stunUntil>now)); });
  const cooldown = Math.max(0,Math.ceil((p.boostReadyAt-now)/1000));
  $('boost-button').disabled = !playing || cooldown > 0 || !snapshotReady || spectator || (battle && (p.health<=0 || p.stunUntil>now));
  put('boost-label',burst ? `Bursting · ${Math.ceil((p.boostUntil-now)/1000)}s` : cooldown ? `Recharge · ${cooldown}s` : 'Orbit burst');
  if (shopping) {
    put('play-title',`Heat ${state.round} complete. Make it unfair.`); put('play-description',`${state.players.filter((p)=>!p.bot && p.ready).length}/${humans} pilots ready. Choose upgrades, then spin again.`); put('play-label',p.ready ? 'Ready ✓' : 'Ready for next heat');
    $('play-button').disabled = p.ready || !snapshotReady;
    if (battle) {
      const winner=state.players.find((pilot)=>pilot.id===state.battleWinnerId);
      put('play-title',state.battlePreparation ? 'Buy your opening move.' : winner ? `${winner.name} wins. Winner winner chicken dinner!` : `Heat ${state.round} complete. Rebuild for the next battle.`);
      put('play-description',`${state.players.filter((pilot)=>!pilot.bot && pilot.ready).length}/${humans} ready · ${state.combatStyle==='no-limits' ? 'Cooldowns only.' : 'PP refills each heat.'} Move ranks unlock each round.`);
      if (state.battlePreparation) put('play-label',p.ready ? 'Ready ✓' : 'Ready for battle');
    }
  } else if (playing) {
    const rank = sorted.findIndex((v)=>v.id === selfId)+1;
    put('play-title',`${rank === 1 ? 'You are setting the pace.' : `You're #${rank}. The light is on your side.`}`); put('play-description','Shift rings to absorb orbs. Stack beams. Unleash the chaos.'); put('play-label','Heat in progress'); $('play-button').disabled = true;
  } else {
    put('play-title',snapshotReady ? 'Your next obsession starts here.' : 'Finding your place in the orbit…');
    put('play-description',mode === 'refract' ? 'Everyone in this activity shares the same orbit and score table.' : '60-second heats. Wild upgrades. Just one more spin.');
    put('play-label',!snapshotReady ? 'Syncing…' : bridge.isHost ? 'Enter the orbit' : 'Waiting for host'); $('play-button').disabled = !bridge.isHost || !snapshotReady;
    if (battle) {put('play-title','Last pilot orbiting wins.');put('play-description',state.combatStyle==='no-limits' ? 'Buy moves. Cast with cooldowns. Rays and collisions still score.' : 'Take turns to cast. Catch LP orbs. Outlast every rival.');if(snapshotReady && bridge.isHost)put('play-label','Open battle shop');}
  }
  if (battle && playing) {put('play-title',p.health<=0 ? 'Eliminated. The battle continues.' : `${state.players.filter((pilot)=>pilot.health>0).length} pilots left in the orbit.`);put('play-description','Rays and collisions earn points and shards. Last pilot standing wins.');}
  $('free-tokens').hidden = !shopping || !p.upgradeTokens;
  put('free-tokens',`${p.upgradeTokens} FREE CHOICE${p.upgradeTokens === 1 ? '' : 'S'}`);
  $('reroll-button').disabled = p.credits < p.rerollCost || !snapshotReady || spectator;
  put('reroll-label',`Reroll / ${p.rerollCost}`);
  put('shop-subtitle',p.upgradeTokens ? 'Your level-up choices are free. Spend shards for more.' : 'Spend your shards. Make the next heat yours.');
  $('shop-tabs').hidden=!battle || !shopping;
  $('results-button').disabled=battle && state.battlePreparation;
  document.querySelector('[data-shop-tab="orbs"]').hidden=state.combatStyle==='no-limits';
  $('reroll-button').hidden=battle && shopTab!=='orbit';
  document.querySelectorAll('[data-shop-tab]').forEach((button)=>{button.setAttribute('aria-pressed',String(button.dataset.shopTab===shopTab));button.classList.toggle('active',button.dataset.shopTab===shopTab);});
  $('upgrade-grid').dataset.tab=shopTab;
  const winner=battle && state.players.find((pilot)=>pilot.id===state.battleWinnerId);
  put('shop-title',battle ? state.battlePreparation ? 'Choose your opening moves.' : winner ? 'Winner winner chicken dinner!' : 'Build your next battle.' : 'Build something ridiculous.');
  put('shop-tag',battle && state.battlePreparation ? 'OPENING BUY ROUND' : 'BUY ROUND');
  if (battle) put('shop-subtitle',shopTab==='moves' ? state.combatStyle==='no-limits' ? 'Every move uses a 2.5-second cooldown. Buy ranks for stronger effects.' : 'Orbs fuel LP. Each move has PP per heat. Higher ranks improve power and PP.' : shopTab==='orbs' ? 'Turn based: +2 / +4 / +6 LP orbs. Upgrade capacity and collection yield.' : 'Ray, collision and economy upgrades still power your build.');
  put('shop-note',battle && state.battlePreparation ? 'ALL MOVES ARE BOUGHT · KEEP YOUR BUILD' : '+35 END-OF-HEAT SHARDS');
  const offers = shopping && !spectator ? p.shopOffers : [];
  const nextShopSignature = JSON.stringify([state.phase,state.round,shopTab,offers,p.upgrades,p.moves,p.orbUpgrades,p.upgradeTokens,p.credits,snapshotReady]);
  if (nextShopSignature !== shopSignature) {
    shopSignature = nextShopSignature;
    $('upgrade-grid').innerHTML = shopping ? spectator ? '<p class="empty-build">The pilots are choosing their upgrades.</p>' : shopTab==='moves' ? MOVE_CATALOG.map((move)=>moveShopCard(move,p)).join('') : shopTab==='orbs' ? ORB_UPGRADE_CATALOG.map((item)=>orbShopCard(item,p)).join('') : offers.map((id) => catalog.get(id)).filter(Boolean).map((u)=>upgradeCard(u,p)).join('') || '<p class="empty-build">Every upgrade is maxed. This orbit belongs to you.</p>' : '';
  }
  put('mic-title',state.surge.active ? 'Your voice. Your points.' : 'Make some noise.');
  if (mic.enabled) put('mic-description',state.surge.active ? 'Solar Surge is live. Speaking earns up to 100 extra points per second.' : 'Mic ready. Your next Solar Surge is coming. Voice only scores during the window.');
  if (spectator) { put('play-title','The orbit is full. Enjoy the show.'); put('play-description','Eight pilots are spinning. A place opens when a pilot leaves.'); put('play-label','Spectating'); $('play-button').disabled = true; }
  renderBattle(p, now, spectator);
}

function openModal(kind, title, content, eyebrow = 'ORBITAL FIELD GUIDE') {
  if ($('run-details').open) $('run-details').close();
  modalKind = kind; put('modal-title',title); put('modal-eyebrow',eyebrow); $('modal-body').innerHTML = content;
  if (!$('modal').open) $('modal').showModal();
}
function closeModal() { $('modal').close(); modalKind = ''; }
function openHelp() {
  if (state.gameMode==='battle') { openBattle(); return; }
  openModal('help','A field guide to absolute chaos.',`<p>Keep orbiting, catch light rays, and collide with rivals for points. Temporary orbs live on the five rings: move your avatar into one to absorb it and collect its points bonus.</p><div class="help-steps"><div class="help-step">${icon('orbit')}<strong>Pick your ring</strong><p>A / D or the arrow keys move inward and outward. Keys 1-5 select a ring directly. On touchscreens, use the numbered ring buttons.</p></div><div class="help-step">${icon('zap')}<strong>Time your burst</strong><p>Space gives +65% speed and double scoring for four seconds. Chase an orb, set up a collision, or escape a rival.</p></div><div class="help-step">${icon('sun')}<strong>Stack the field</strong><p>Beam orbs add more rays from the core, up to 50 at once. Haste orbs make those rays spin faster. Each stack expires independently.</p></div><div class="help-step">${icon('gem')}<strong>Build between heats</strong><p>Every level banks a free upgrade. After a 60-second heat, the buy round opens right here for 30 seconds. Ready up to launch early.</p></div></div><h3 class="orb-guide-title">Know your orbs</h3><div class="orb-guide">${ORB_CATALOG.map((orb)=>`<div><span style="--orb-color:${orb.color}"></span><p><strong>${escape(orb.name)}</strong> ${escape(orb.description)} <small>+${orb.points} points</small></p></div>`).join('')}</div><p class="help-note">Temporary powers clear between heats. Levels, permanent upgrades, and total scores carry on.<br>Optional microphone bonuses: open Run details to enable Solar Surges.<br>F = FULLSCREEN / ESC = CLOSE DIALOG</p>`);
}
function openLibrary() {
  openModal('library','Find your next unfair advantage.',`<p>28 upgrades. Hundreds of combinations. Stack levels, create synergies, and see how far your orbit goes.</p><div class="library-toolbar"><input id="upgrade-search" type="search" placeholder="Search upgrades or effects…" aria-label="Search upgrades" /><select id="upgrade-filter" aria-label="Filter rarity"><option value="all">All rarities</option><option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option></select></div><div class="library-grid" id="library-grid"></div>`,'THE UPGRADE INDEX');
  filterLibrary(); $('upgrade-search').addEventListener('input',filterLibrary); $('upgrade-filter').addEventListener('change',filterLibrary);
}
function filterLibrary() {
  const query = $('upgrade-search').value.toLowerCase(), rarity = $('upgrade-filter').value;
  const items = UPGRADE_CATALOG.filter((u) => `${u.name} ${u.description} ${u.category}`.toLowerCase().includes(query) && (rarity === 'all' || u.rarity === rarity));
  $('library-grid').innerHTML = items.map((u)=>upgradeCard(u,me(),true)).join('') || '<p class="empty-build">No upgrades found. Try a different search.</p>';
}
function openSettings() {
  openModal('settings','Tune your orbit.',`<div class="settings-row"><div><strong>Sound effects</strong><p>Soft synth hits, refractions, and a little victory noise.</p></div><input id="setting-sound" type="checkbox" aria-label="Sound effects" ${audio.enabled ? 'checked' : ''} /></div><div class="settings-row"><div><strong>Reduced effects</strong><p>Keep the orbit moving with fewer particles and light pulses.</p></div><input id="setting-motion" type="checkbox" aria-label="Reduced visual effects" ${arena.reducedMotion ? 'checked' : ''} /></div><div class="settings-row"><div><strong>Microphone</strong><p>Optional, local volume analysis. Nothing is recorded.</p></div><button class="secondary-button" id="settings-mic">${mic.enabled ? 'Turn off' : 'Enable mic'}</button></div>${mode === 'solo' ? `<div class="settings-row"><div><strong>Pilot name</strong><p>Your name in solo practice.</p></div><input id="pilot-name-input" maxlength="24" value="${escape(profile.name)}" aria-label="Pilot name" style="width:120px;background:#100e16;border:1px solid #ffffff12;padding:8px;color:#c4b3d2;border-radius:5px" /></div>` : ''}<div class="settings-row"><div><strong>Fresh run</strong><p>Reset the build and scores for everyone in this orbit.</p></div><button class="secondary-button" id="reset-run" ${bridge.isHost ? '' : 'disabled'}>New run</button></div><p class="help-note">${mode === 'refract' ? 'Your Refract identity and call participants are used automatically. The first participant coordinates the simulation.' : 'To play with friends, add the deployed GitHub Pages URL to your Refract instance’s Activities catalog and open it in a call.'}</p>`,'FLIGHT CONTROLS');
  $('setting-sound').onchange = (e) => toggleSound(e.target.checked);
  $('setting-motion').onchange = (e) => {
    arena.reducedMotion = e.target.checked;
    document.documentElement.classList.toggle('reduced-effects', arena.reducedMotion);
    if (arena.reducedMotion) {
      $('levelup-banner').getAnimations().forEach((animation) => animation.cancel());
      $('level-badge').getAnimations().forEach((animation) => animation.cancel());
    }
  };
  $('settings-mic').onclick = () => { closeModal(); toggleMic(); };
  $('reset-run').onclick = () => { send({type:'reset'}); closeModal(); };
  if ($('pilot-name-input')) $('pilot-name-input').onchange = (e) => { profile.name = e.target.value.trim().slice(0,24) || 'You'; saveProfile(); const p = me(); if (p) p.name = profile.name; renderUI(); };
}
function openBattle() {
  const reference=addPlayer(createGame(),{id:'guide'});
  openModal('battle','Catch light. Choose your rival.',`<p class="battle-rules">Choose <strong>Battle</strong> in the lobby. Every pilot starts with 100 HP and 60 shards. Buy your first move before launching. Rays, revolutions, collisions and orbs still earn points, XP and shards. At 0 HP a pilot stops orbiting and is out for the heat. The last survivor gets <strong>Winner winner chicken dinner!</strong> If time runs out with several survivors, the heat ends without a last-survivor winner.</p><div class="move-reference"><div><strong>Turn based</strong><p>Everyone keeps orbiting. The active pilot has 10 seconds to choose a target and cast, or pass. Collect Light motes (+2 LP), clusters (+4 LP) and Nova orbs (+6 LP). Every cast spends LP and one move PP. Stun also skips the target's next turn. PP refills for each heat.</p></div><div><strong>No limits</strong><p>Cast whenever your 2.5-second cooldown is ready. Moves cost no LP or PP in this style. Light orbs still score points. Choose a fresh target before each cast; select yourself for heal, reflect and shield.</p></div></div><div class="move-reference">${MOVE_CATALOG.map((move)=>{const stats=getMoveStats(reference,move.id);return `<div style="--move-color:${move.color}"><strong>${escape(move.name)}</strong><p>${escape(move.description)}</p><small>Rank 1: ${move.cost} shards · ${stats.lightCost} LP · ${stats.maxPP} PP per heat</small></div>`;}).join('')}</div><p class="battle-rules"><strong>Buy-round progression:</strong> moves have five ranks. Rank 1 opens before heat 1, rank 2 after heat 1, and so on. Each rank costs 25 more shards, adds PP and improves its effect; some higher ranks need more LP. Level-up free choices can buy move or orb ranks too. Light reservoir adds 5 LP capacity per rank; Orb condenser adds 1 LP to every Light orb per rank, each up to rank 3. Both use the same heat gates. Health and PP reset each heat; LP, move ranks and your build carry forward.</p>`,'BATTLE FIELD GUIDE');
}
function openResults() {
  const p = me(); if (!p) return;
  const index = state.lastResults.findIndex((r)=>r.id === selfId);
  openModal('results',`Heat ${state.round}: that's a wrap.`,`<div class="results-summary"><div><div class="results-score">${format(p.roundScore)}</div><div class="results-caption">POINTS THIS HEAT · FINISHED #${index+1}</div></div><div class="level-badge">${p.upgradeTokens} FREE UPGRADE${p.upgradeTokens===1?'':'S'}</div></div>${state.lastResults.map((r,i)=>`<div class="results-row ${r.id===selfId?'self':''}"><span>${String(i+1).padStart(2,'0')} &nbsp; ${escape(r.name)}</span><span>${format(r.score)}</span></div>`).join('')}<p class="help-note">+35 END-OF-HEAT SHARDS. YOUR BUILD AND TOTAL SCORE CARRY ON.</p><div class="results-cta"><button id="results-shop" class="primary-button">Make your next upgrade ${icon('arrow')}</button></div>`,'A LITTLE MORE POWER. A LITTLE MORE CHAOS.');
  $('results-shop').onclick = () => { closeModal(); if (state.phase === 'shop') $('shop').focus({preventScroll:true}); };
}
function toggleSound(enabled = !audio.enabled) {
  audio.unlock(); audio.setEnabled(enabled); profile.sound = enabled; saveProfile();
  $('sound-button').innerHTML = icon(enabled ? 'sound' : 'mute'); $('sound-button').setAttribute('aria-label',enabled ? 'Mute sound effects' : 'Enable sound effects');
  if (enabled) audio.play('click');
}
async function toggleMic() {
  if (micBusy) return;
  if (mic.enabled) { mic.stop(); $('mic-meter').hidden = true; put('mic-button-label','Enable microphone'); put('mic-note','OPT-IN · NORMAL SPEAKING IS ENOUGH'); put('mic-description','Solar Surges turn your voice into bonus points. Keep an eye on the countdown.'); renderUI(); return; }
  micBusy = true; put('mic-button-label','Requesting microphone…');
  const success = await mic.start();
  micBusy = false; $('mic-meter').hidden = !success;
  put('mic-button-label',success ? 'Microphone on · Turn off' : 'Enable microphone');
  if (success) { put('mic-note','YOUR AUDIO STAYS ON THIS DEVICE'); toast('Microphone ready. Speak during Solar Surges for bonus points.','success'); }
  renderUI();
}

$('play-button').onclick = () => send({type:state.phase === 'shop' ? 'ready' : 'start'});
$('lobby-button').onclick=()=>{send({type:'lobby'});if($('modal').open)closeModal();if($('run-details').open)$('run-details').close();};
$('battle-guide-button').onclick=openBattle;
$('battle-target').onchange=(event)=>{selectedTarget=event.target.value;renderUI();};
$('battle-moves').onclick=(event)=>{const button=event.target.closest('[data-cast]');if(button && !button.disabled && selectedTarget){const targetId=selectedTarget;selectedTarget='';$('battle-target').value='';send({type:'cast',moveId:button.dataset.cast,targetId,round:state.round});renderUI();}};
$('pass-turn-button').onclick=()=>{selectedTarget='';$('battle-target').value='';send({type:'pass-turn',round:state.round});};
document.querySelectorAll('[data-mode]').forEach((button)=>button.onclick=()=>send({type:'mode',mode:button.dataset.mode}));
document.querySelectorAll('[data-combat-style]').forEach((button)=>button.onclick=()=>send({type:'combat-style',style:button.dataset.combatStyle}));
document.querySelectorAll('[data-shop-tab]').forEach((button)=>button.onclick=()=>{shopTab=button.dataset.shopTab;renderUI();});
$('boost-button').onclick = () => send({type:'boost'});
$('sound-button').onclick = () => toggleSound();
$('fullscreen-button').onclick = () => bridge.setFullscreen();
$('mic-button').onclick = toggleMic;
$('settings-button').onclick = openSettings;
$('help-button').onclick = openHelp;
$('details-button').onclick = () => $('run-details').showModal();
$('details-close').onclick = () => $('run-details').close();
$('results-button').onclick = openResults;
$('library-button').onclick = openLibrary;
$('reroll-button').onclick = () => { send({type:'reroll'}); audio.play('reroll'); };
$('modal-close').onclick = closeModal;
$('modal').addEventListener('close',()=>{modalKind='';});
$('modal').addEventListener('click',(e)=>{ if(e.target === $('modal')) {const r=$('modal').getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) closeModal();} });
document.querySelectorAll('[data-nav]').forEach((b)=>b.onclick=()=>{ if(b.dataset.nav==='library')openLibrary();else if(b.dataset.nav==='battle')openBattle();else $('arena').focus(); });
document.querySelectorAll('[data-lane]').forEach((b)=>b.onclick=()=>send({type:'lane',lane:Number(b.dataset.lane)}));
$('upgrade-grid').addEventListener('click',(event)=>{const button=event.target.closest('[data-buy],[data-buy-move],[data-buy-orb]');if(!button || button.disabled)return;if(button.dataset.buyMove)send({type:'buy-move',moveId:button.dataset.buyMove,round:state.round});else if(button.dataset.buyOrb)send({type:'buy-orb',upgradeId:button.dataset.buyOrb,round:state.round});else send({type:'buy',upgradeId:button.dataset.buy,round:state.round});});
document.addEventListener('pointerdown',()=>audio.unlock(),{once:true});
document.addEventListener('keydown',(e)=>{
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || ['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable || $('modal').open || $('run-details').open || !me()) return;
  if(e.code==='Space'){e.preventDefault();if(state.phase==='playing' && gameNow()>=me()?.boostReadyAt)send({type:'boost'});}
  if((state.phase==='lobby' || state.phase==='playing') && (e.code==='KeyA' || e.code==='ArrowLeft')){e.preventDefault();send({type:'lane',lane:Math.max(0,(me()?.lane||0)-1)});}
  if((state.phase==='lobby' || state.phase==='playing') && (e.code==='KeyD' || e.code==='ArrowRight')){e.preventDefault();send({type:'lane',lane:Math.min(LANE_COUNT-1,(me()?.lane||0)+1)});}
  if((state.phase==='lobby' || state.phase==='playing') && /^Digit[1-5]$/.test(e.code)){e.preventDefault();send({type:'lane',lane:Number(e.code.slice(-1))-1});}
  if(e.code==='KeyF')bridge.setFullscreen();
});

// Fixed 20Hz host simulation; catch-up keeps a backgrounded coordinator's clock fair.
const simulationTimer = setInterval(()=>{
  const now=Date.now();
  if(bridge.isHost && snapshotReady){
    let steps=0;
    while(now-lastTick>=50 && steps<1800){lastTick+=50;tickGame(state,.05,lastTick);steps++;processEvents();}
    if(now-lastTick>90000)lastTick=now;
    lastSnapshotAt=performance.now();
  }else lastTick=now;
  if(mic.enabled && state.phase==='playing' && state.surge.active && now>=nextVoiceAt){nextVoiceAt=now+220;bridge.sendAction({type:'voice',intensity:Math.round(mic.level*100)/100});}
},50);
const publishTimer=setInterval(()=>{if(bridge.isHost && state.phase!=='lobby')publish();},500);
const uiTimer=setInterval(renderUI,150);
let animation;
function animate(now){arena.render(state,selfId,now,state.phase==='playing' ? (now-lastSnapshotAt)/1000 : 0);animation=requestAnimationFrame(animate);}
renderUI(); animation=requestAnimationFrame(animate);
window.addEventListener('pagehide',()=>{const p=me();if(p){profile.best=Math.max(profile.best,p.score);saveProfile();}mic.stop();$('mic-meter').hidden=true;put('mic-button-label','Enable microphone');put('mic-note','OPT-IN · NORMAL SPEAKING IS ENOUGH');});
window.addEventListener('beforeunload',()=>{clearTimeout(levelupTimer);clearInterval(simulationTimer);clearInterval(publishTimer);clearInterval(uiTimer);cancelAnimationFrame(animation);mic.destroy();audio.destroy();arena.destroy();bridge.destroy();});
