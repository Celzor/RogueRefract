import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, startRound, applyAction, tickGame, getSolarWindow, SOLAR_TAP_POINTS, packGameState, unpackGameState, MOVE_CATALOG, ORB_UPGRADE_CATALOG, UPGRADE_CATALOG, getMoveStats } from '../src/game.js';

function fixture({ count = 1, bots = false, mode = 'orbit', style = 'turn-based', ...options } = {}) {
  const state = createGame({ seed: 42, now: 1000, ...options });
  for (let index = 0; index < count; index++) addPlayer(state, { id: `pilot-${index}`, name: `Pilot ${index}`, bot: bots });
  if (mode === 'battle') applyAction(state, state.players[0].id, { type: 'mode', mode });
  applyAction(state, state.players[0].id, { type: 'combat-style', style });
  state.rays = [];
  startRound(state, state.now);
  state.nextPickupAt = state.phaseEndsAt + 1;
  // Isolate the minigame from orbit scoring, pickups and bot movement.
  for (const player of state.players) player.frozenUntil = state.phaseEndsAt + 1;
  return state;
}
const roundStart = (state) => state.phaseEndsAt - state.roundDuration * 1000;
const tap = (state, at, player = state.players[0], extra = {}) => applyAction(state, player.id, { type: 'solar-tap', round: state.round, ...extra }, at);

test('Solar scheduling exposes exactly two eight-second windows with inclusive starts and exclusive ends', () => {
  const state = fixture();
  const start = roundStart(state);
  assert.deepEqual(getSolarWindow(state, start + 14999), { active: false, startsAt: 0, endsAt: 0, nextAt: start + 15000, index: 0 });
  assert.deepEqual(getSolarWindow(state, start + 15000), { active: true, startsAt: start + 15000, endsAt: start + 23000, nextAt: start + 40000, index: 1 });
  assert.equal(getSolarWindow(state, start + 22999).active, true);
  assert.equal(getSolarWindow(state, start + 23000).active, false);
  assert.equal(getSolarWindow(state, start + 39999).active, false);
  assert.equal(getSolarWindow(state, start + 40000).active, true);
  assert.equal(getSolarWindow(state, start + 47999).active, true);
  assert.equal(getSolarWindow(state, start + 48000).active, false);
  assert.equal(getSolarWindow(state, start + 55000).nextAt, state.phaseEndsAt);
  assert.equal(getSolarWindow(state, state.phaseEndsAt).active, false);
  assert.equal(getSolarWindow(state, state.phaseEndsAt + 60000).active, false, 'Long rounds never invent a third surge');
});

test('taps use scheduled boundaries before ticks and reject a stale active snapshot after each window', () => {
  const state = fixture();
  const start = roundStart(state);
  const player = state.players[0];
  assert.equal(state.surge.active, false);
  assert.equal(tap(state, start + 14999).ok, false);
  assert.equal(tap(state, start + 15000).ok, true, 'First exact-start press works before a simulation frame');
  assert.equal(player.score, 10);
  assert.equal(state.events.filter((event) => event.type === 'surge-start').length, 1);
  assert.equal(tap(state, start + 22999).ok, true);
  assert.equal(tap(state, start + 23000).ok, false);
  state.surge.active = true;
  assert.equal(tap(state, start + 39000).ok, false, 'Stale snapshot active flag cannot authorize a tap');
  assert.equal(tap(state, start + 40000).ok, true);
  assert.equal(player.solarTaps, 1);
  assert.equal(player.solarScore, 10);
  assert.equal(player.score, 30, 'Overall score keeps points from both events');
  assert.equal(tap(state, start + 48000).ok, false);
  assert.equal(tap(state, state.phaseEndsAt).ok, false);
});

test('fixed-step catch-up cannot reset a tap already counted by a newer wall-clock command', () => {
  const state = fixture({ count: 2 });
  const player = state.players[0];
  const at = roundStart(state) + 15000;
  assert.equal(tap(state, at + 20).ok, true);
  tickGame(state, 0.05, at - 50);
  tickGame(state, 0.05, at);
  assert.equal(player.solarTaps, 1);
  assert.equal(player.solarScore, 10);
  assert.equal(player.score, 10);
  assert.equal(state.events.filter((event) => event.type === 'surge-start').length, 1);
  assert.equal(tap(state, at + 50).ok, true);
  assert.equal(player.solarTaps, 2);
  const secondStart = roundStart(state) + 40000;
  assert.equal(tap(state, secondStart + 20).ok, true);
  tickGame(state, 0.05, at + 100);
  assert.equal(tap(state, at + 150, state.players[1]).ok, false, 'Old-window catch-up cannot append to a newer event tally');
  tickGame(state, 0.05, secondStart);
  assert.equal(player.solarTaps, 1);
  assert.equal(player.solarScore, 10);
  assert.equal(player.score, 30);
});

test('only duplicate-speed bursts are rejected; fast presses continue earning fixed points without a per-second cap', () => {
  const state = fixture();
  const player = state.players[0];
  const at = roundStart(state) + 15000;
  player.upgrades = { 'event-horizon': 5, 'prismatic-core': 3, afterburner: 4 };
  player.boostUntil = at + 4000;
  player.starlightUntil = at + 6000;
  assert.equal(tap(state, at).ok, true);
  assert.equal(tap(state, at).ok, false);
  assert.equal(tap(state, at + 24).ok, false);
  assert.equal(tap(state, at + 25).ok, true);
  for (let index = 2; index < 100; index++) assert.equal(tap(state, at + index * 25).ok, true);
  assert.equal(player.solarTaps, 100);
  assert.equal(player.solarScore, 100 * SOLAR_TAP_POINTS);
  assert.equal(player.score, 1000, 'Critical, burst and global multipliers never alter tap value');
  assert.equal(player.roundScore, 1000);
  assert.equal(state.events.findLast((event) => event.type === 'surge').amount, 10);
  assert.ok(state.events.length <= 12, 'Tap spam cannot expand the relay event buffer');
});

test('no new press means no idle Solar scoring, and microphone actions no longer exist', () => {
  const state = fixture();
  const player = state.players[0];
  const at = roundStart(state) + 15000;
  assert.equal(tap(state, at).ok, true);
  assert.equal(applyAction(state, player.id, { type: 'voice', intensity: 1 }, at + 100).ok, false);
  for (let index = 1; index <= 160; index++) tickGame(state, 0.05, at + index * 50);
  assert.equal(player.score, 10);
  assert.equal(player.solarTaps, 1);
  assert.equal(player.solarScore, 10);
  for (const key of ['voiceIntensity', 'voiceUntil', 'lastVoiceAt', 'voiceCarry', 'voiceEventAt']) assert.equal(Object.hasOwn(player, key), false);
});

test('elimination blocks Solar taps while turns, stun, freeze and combat cooldown never prevent them', () => {
  for (const style of ['turn-based', 'no-limits']) {
    const state = fixture({ count: 3, mode: 'battle', style });
    const player = state.players[1];
    const at = roundStart(state) + 15000;
    assert.notEqual(state.turnPlayerId, player.id);
    player.stunUntil = at + 5000;
    player.castReadyAt = at + 5000;
    assert.equal(tap(state, at, player).ok, true);
    assert.equal(player.score, 10);
    player.health = 0;
    assert.equal(tap(state, at + 100, player).ok, false);
    assert.equal(player.score, 10);
    assert.equal(player.solarTaps, 1);
  }
});

test('each event, shop, lobby and new heat resets the appropriate Solar counters and timers', () => {
  const state = fixture();
  const player = state.players[0];
  const start = roundStart(state);
  assert.equal(tap(state, start + 15000).ok, true);
  assert.equal(tap(state, start + 15100).ok, true);
  tickGame(state, 0.05, start + 40000);
  assert.equal(player.solarTaps, 0);
  assert.equal(player.solarScore, 0);
  assert.equal(player.lastSolarTapAt, -1);
  assert.equal(tap(state, state.now).ok, true);
  tickGame(state, 0.05, state.phaseEndsAt);
  assert.equal(state.phase, 'shop');
  assert.equal(player.solarScore, 10, 'Latest event result stays visible during buying');
  assert.equal(player.lastSolarTapAt, -1);
  assert.equal(player.nextSolarTapAt, 0);
  assert.deepEqual(state.surge, { active: false, startsAt: 0, endsAt: 0, nextAt: 0, index: 0 });
  assert.equal(tap(state, state.now).ok, false);
  applyAction(state, player.id, { type: 'ready', round: state.round });
  tickGame(state, 0.05, state.now + 50);
  assert.equal(state.phase, 'playing');
  assert.equal(player.solarScore, 0);
  assert.equal(player.solarTaps, 0);
  assert.equal(tap(state, roundStart(state) + 15000, player, { round: state.round - 1 }).ok, false);
  assert.equal(tap(state, roundStart(state) + 15000).ok, true);
  const score = player.score;
  applyAction(state, player.id, { type: 'lobby', round: state.round });
  assert.equal(player.solarScore, 0);
  assert.equal(player.solarTaps, 0);
  assert.equal(player.score, score);
  assert.equal(getSolarWindow(state).active, false);
  assert.equal(tap(state, state.now).ok, false);
});

test('bots press at a deterministic plausible cadence and never score outside the two windows', () => {
  const first = fixture({ count: 3, bots: true });
  const second = fixture({ count: 3, bots: true });
  let taps = 0;
  let firstWindowTaps = 0;
  const start = roundStart(first);
  for (let index = 0; index < 1000; index++) {
    const events = tickGame(first, 0.05, first.now + 50);
    tickGame(second, 0.05, second.now + 50);
    for (const event of events.filter((event) => event.type === 'surge')) {
      taps++;
      assert.ok(getSolarWindow(first, event.at).active);
      assert.equal(event.amount, 10);
    }
    if (first.now === start + 23000) firstWindowTaps = first.players[0].solarTaps;
  }
  assert.deepEqual(first, second);
  assert.ok(firstWindowTaps >= 20 && firstWindowTaps <= 50, `${firstWindowTaps} first-event bot presses`);
  assert.ok(first.players[0].solarTaps >= 20 && first.players[0].solarTaps <= 50);
  assert.ok(taps >= 120);
  assert.equal(first.players[0].score % 10, 0);
});

test('short heats truncate or omit scheduled windows and packed Solar state stays lossless with full battle builds', () => {
  const short = fixture({ roundDuration: 18 });
  const start = roundStart(short);
  assert.equal(getSolarWindow(short, start + 15000).endsAt, short.phaseEndsAt);
  assert.equal(tap(short, short.phaseEndsAt - 1).ok, true);
  assert.equal(tap(short, short.phaseEndsAt).ok, false);
  const tiny = fixture({ roundDuration: 12 });
  assert.equal(getSolarWindow(tiny, tiny.phaseEndsAt - 1).active, false);
  const state = fixture({ count: 8, mode: 'battle', now: 1800000000000 });
  for (const player of state.players) {
    player.upgrades = Object.fromEntries(UPGRADE_CATALOG.map((item) => [item.id, item.maxLevel]));
    player.moves = Object.fromEntries(MOVE_CATALOG.map((move) => [move.id, move.maxLevel]));
    player.movePP = Object.fromEntries(MOVE_CATALOG.map((move) => [move.id, getMoveStats(player, move.id).maxPP]));
    player.orbUpgrades = Object.fromEntries(ORB_UPGRADE_CATALOG.map((item) => [item.id, item.maxLevel]));
  }
  const at = roundStart(state) + 15000;
  for (let index = 0; index < 100; index++) for (const player of state.players) assert.equal(tap(state, at + index * 25, player).ok, true);
  const packed = packGameState(state);
  assert.deepEqual(unpackGameState(JSON.parse(JSON.stringify(packed))), state);
  assert.ok(new TextEncoder().encode(JSON.stringify(packed)).length < 16384);
});
