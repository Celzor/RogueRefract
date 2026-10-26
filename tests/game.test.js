import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, removePlayer, startRound, tickGame, applyAction, getStats, getUpgradeCost, UPGRADE_CATALOG, xpForLevel, MAX_PLAYERS } from '../src/game.js';

function fixture(options = {}) {
  const state = createGame({ seed: 42, now: 1000, ...options });
  addPlayer(state, { id: 'a', name: 'Pilot A' });
  addPlayer(state, { id: 'b', name: 'Pilot B', bot: true });
  return state;
}
function advance(state, seconds) {
  const steps = Math.round(seconds / 0.05);
  for (let index = 0; index < steps; index++) tickGame(state, 0.05, state.now + 50);
}

test('seeded simulation is deterministic and scores all three sources', () => {
  const first = fixture();
  const second = fixture();
  first.players[1].bot = second.players[1].bot = false;
  // Same starting lane and close pilots ensure a collision without bot randomness.
  for (const state of [first, second]) {
    state.players[1].lane = state.players[0].lane;
    state.players[1].angle = state.players[0].angle + 0.03;
    startRound(state, 1000);
    advance(state, 30);
  }
  assert.deepEqual(first, second);
  const pilot = first.players[0];
  assert.ok(pilot.hits > 0);
  assert.ok(pilot.collisions > 0);
  assert.ok(pilot.revolutions > 0);
  assert.ok(pilot.score > 0);
  assert.ok(pilot.level > 1);
  assert.ok(pilot.upgradeTokens > 0);
  assert.ok(pilot.xp < xpForLevel(pilot.level));
});

test('60-second rounds end in shop and keep XP, score, and purchased build next round', () => {
  const state = fixture();
  startRound(state, 1000);
  advance(state, 60);
  assert.equal(state.phase, 'shop');
  assert.equal(state.round, 1);
  assert.equal(state.lastResults.length, 2);
  const pilot = state.players[0];
  const earnedScore = pilot.score;
  const earnedLevel = pilot.level;
  assert.equal(pilot.shopOffers.length, 3);
  const upgradeId = pilot.shopOffers[0];
  assert.equal(applyAction(state, pilot.id, { type: 'buy', upgradeId }).ok, true);
  assert.equal(pilot.upgrades[upgradeId], 1);
  assert.equal(applyAction(state, pilot.id, { type: 'ready' }).ok, true);
  tickGame(state, 0.05, state.now + 50);
  assert.equal(state.phase, 'playing');
  assert.equal(state.round, 2);
  assert.equal(pilot.score, earnedScore);
  assert.equal(pilot.level, earnedLevel);
  assert.equal(pilot.upgrades[upgradeId], 1);
  assert.equal(pilot.roundScore, 0);
});

test('shop rejects forged, unavailable and unaffordable purchases without spending', () => {
  const state = fixture({ roundDuration: 1 });
  const pilot = state.players[0];
  assert.equal(applyAction(state, 'forged', { type: 'buy', upgradeId: 'kinetic-drive' }).ok, false);
  assert.equal(applyAction(state, pilot.id, { type: 'buy', upgradeId: 'kinetic-drive' }).ok, false);
  startRound(state, 1000);
  advance(state, 1);
  pilot.credits = 0;
  pilot.upgradeTokens = 0;
  const offer = pilot.shopOffers[0];
  assert.equal(applyAction(state, pilot.id, { type: 'buy', upgradeId: offer }).ok, false);
  assert.equal(pilot.credits, 0);
  assert.equal(applyAction(state, pilot.id, { type: 'buy', upgradeId: 'made-up' }).ok, false);
  pilot.upgradeTokens = 1;
  assert.equal(applyAction(state, pilot.id, { type: 'buy', upgradeId: offer }).ok, true);
  assert.equal(pilot.upgradeTokens, 0);
  assert.equal(pilot.credits, 0);
});

test('shard prices scale and rerolls are charged exactly once', () => {
  const state = fixture({ roundDuration: 1 });
  startRound(state, 1000);
  advance(state, 1);
  const pilot = state.players[0];
  const item = UPGRADE_CATALOG[0];
  pilot.upgradeTokens = 0;
  pilot.credits = 1000;
  pilot.shopOffers = [item.id, 'triple-prism', 'lap-reactor'];
  assert.equal(applyAction(state, pilot.id, { type: 'buy', upgradeId: item.id }).ok, true);
  assert.equal(pilot.credits, 1000 - item.cost);
  assert.equal(getUpgradeCost(pilot, item.id), Math.round(item.cost * 1.35));
  const before = pilot.credits;
  const price = pilot.rerollCost;
  assert.equal(applyAction(state, pilot.id, { type: 'reroll' }).ok, true);
  assert.equal(pilot.credits, before - price);
  assert.equal(pilot.rerollCost, price + 15);
  assert.equal(new Set(pilot.shopOffers).size, pilot.shopOffers.length);
});

test('burst has a cooldown and lane changes validate their inputs', () => {
  const state = fixture();
  startRound(state, 1000);
  assert.equal(applyAction(state, 'a', { type: 'boost' }, 1000).ok, true);
  assert.equal(state.players[0].boostUntil, 5000);
  assert.equal(applyAction(state, 'a', { type: 'boost' }, 1001).ok, false);
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: 3 }).ok, false);
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: 1.2 }).ok, false);
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: 2 }).ok, true);
  assert.equal(state.players[0].lane, 2);
  assert.equal(applyAction(state, 'a', { type: 'boost' }, 21000).ok, true);
});

test('all catalog upgrades alter derived stats or an actual event mechanic', () => {
  const state = fixture();
  const pilot = state.players[0];
  const base = getStats(pilot);
  for (const upgrade of UPGRADE_CATALOG) {
    pilot.upgrades = { [upgrade.id]: 1 };
    // Some mechanics activate only after revolutions accumulate.
    pilot.roundRevolutions = 4;
    assert.notDeepEqual(getStats(pilot), base, upgrade.id);
  }
  assert.equal(UPGRADE_CATALOG.length, 28);
  pilot.upgrades = { 'triple-prism': 999 };
  assert.ok(getStats(pilot).critChance <= 0.8);
});

test('passive income, burst and ray upgrades award their advertised effects', () => {
  const state = fixture();
  const pilot = state.players[0];
  state.players = [pilot];
  pilot.upgrades = { 'solar-cell': 1, starlight: 1 };
  state.rays = [];
  startRound(state, 1000);
  const oldCredits = pilot.credits;
  advance(state, 2);
  assert.equal(pilot.credits, oldCredits + 1);
  assert.equal(pilot.score, 3);
});

test('timer advances a hidden host into shop without scoring beyond round end', () => {
  const state = fixture();
  startRound(state, 1000);
  tickGame(state, 0.05, 70000);
  assert.equal(state.phase, 'shop');
  assert.equal(state.players[0].score, 0);
  assert.equal(state.phaseEndsAt, 100000);
});

test('12-player snapshots remain comfortably inside the Refract 16 KiB cap', () => {
  const state = fixture();
  for (let index = 2; index < MAX_PLAYERS; index++) addPlayer(state, { id: `p${index}`, name: `Test Pilot ${index}`, bot: true });
  assert.equal(addPlayer(state, { id: 'too-many' }), null);
  startRound(state, 1000);
  advance(state, 60);
  assert.ok(new TextEncoder().encode(JSON.stringify(state)).length < 16384);
  assert.ok(state.events.length <= 12);
  const serialized = JSON.parse(JSON.stringify(state));
  assert.deepEqual(serialized, state);
});

test('reset creates a fresh run, preserving roster and monotonic event IDs', () => {
  const state = fixture();
  startRound(state, 1000);
  advance(state, 5);
  const oldSeq = state.eventSeq;
  assert.equal(applyAction(state, 'a', { type: 'reset' }).ok, true);
  assert.equal(state.phase, 'lobby');
  assert.equal(state.round, 0);
  assert.equal(state.players.length, 2);
  assert.equal(state.players[0].score, 0);
  assert.ok(state.eventSeq > oldSeq);
  assert.equal(removePlayer(state, 'b'), true);
  assert.equal(removePlayer(state, 'b'), false);
});

test('pickups spawn, expire and can only be collected by one pilot', () => {
  const state = fixture();
  startRound(state, 1000);
  advance(state, 4);
  assert.equal(state.pickups.length, 1);
  const pickup = state.pickups[0];
  pickup.type = 'star';
  const pilot = state.players[0];
  const before = pilot.score;
  assert.equal(applyAction(state, 'a', { type: 'collect', pickupId: pickup.id }).ok, true);
  assert.equal(pilot.score, before + 60);
  assert.equal(getStats(pilot).multiplier, 1.5);
  assert.equal(applyAction(state, 'b', { type: 'collect', pickupId: pickup.id }).ok, false);
  assert.equal(state.pickups.length, 0);
  assert.equal(getStats(pilot, pilot.starlightUntil).multiplier, 1);
  advance(state, 4);
  state.pickups[0].type = 'chip';
  const chip = state.pickups[0];
  const credits = pilot.credits;
  assert.equal(applyAction(state, 'a', { type: 'collect', pickupId: chip.id }).ok, true);
  assert.equal(pilot.credits, credits + 25);
  assert.equal(getStats(pilot).speed, 1.05 * 1.25);
  advance(state, 20);
  assert.ok(state.pickups.length <= 4);
  assert.ok(state.pickups.every((item) => item.expiresAt > state.now));
});

test('Solar Surge starts on schedule; voice is capped, rate-limited and expires', () => {
  const state = fixture();
  state.players = [state.players[0]];
  const pilot = state.players[0];
  state.rays = [];
  startRound(state, 1000);
  assert.equal(applyAction(state, 'a', { type: 'voice', intensity: 1 }).ok, false);
  advance(state, 15);
  assert.equal(state.surge.active, true);
  assert.equal(state.surge.endsAt, 24000);
  assert.equal(applyAction(state, 'a', { type: 'voice', intensity: 100 }).ok, true);
  assert.equal(pilot.voiceIntensity, 1);
  assert.equal(applyAction(state, 'a', { type: 'voice', intensity: 1 }).ok, false);
  const oldScore = pilot.score;
  advance(state, 1);
  // One sample expires after 500 ms, so held/stale microphone data cannot score indefinitely.
  assert.ok(pilot.score - oldScore <= 50);
  assert.ok(pilot.score - oldScore > 0);
  advance(state, 7);
  assert.equal(state.surge.active, false);
  assert.equal(applyAction(state, 'a', { type: 'voice', intensity: 1 }).ok, false);
  advance(state, 17);
  assert.equal(state.surge.active, true);
  assert.equal(state.surge.index, 2);
  assert.equal(applyAction(state, 'a', { type: 'voice', intensity: NaN }).ok, false);
});
