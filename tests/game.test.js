import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, removePlayer, startRound, tickGame, applyAction, getStats, getPlayerSpeed, getPlayerPosition, getRaySpeedMultiplier, packGameState, unpackGameState, getUpgradeCost, UPGRADE_CATALOG, ORB_CATALOG, xpForLevel, MAX_PLAYERS, LANE_COUNT, LANE_RADII, MAX_RAYS, MAX_PICKUPS, TAU } from '../src/game.js';

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

function orbFixture({ players = 2, rays = false, now = 1000 } = {}) {
  const state = createGame({ seed: 42, now });
  for (let index = 0; index < players; index++) {
    const player = addPlayer(state, { id: `pilot-${index}`, name: `Pilot ${index}` });
    player.lane = index % LANE_COUNT;
    player.angle = index + 1;
  }
  if (!rays) state.rays = [];
  startRound(state, now);
  state.nextPickupAt = state.phaseEndsAt + 1;
  return state;
}

function catchOrb(state, type, player = state.players[0]) {
  const pickup = { id: `manual-${++state.pickupSeq}`, type, angle: player.angle, lane: player.lane, expiresAt: state.now + 8000 };
  state.pickups.push(pickup);
  tickGame(state, 0.05, state.now + 50);
  assert.ok(!state.pickups.includes(pickup), `${type} must be collected by contact`);
  return pickup;
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
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: LANE_COUNT }).ok, false);
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: -1 }).ok, false);
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: 1.2 }).ok, false);
  assert.equal(applyAction(state, 'a', { type: 'lane', lane: 4 }).ok, true);
  assert.equal(state.players[0].lane, 4);
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

test('eight-player snapshots remain comfortably inside the Refract 16 KiB cap', () => {
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

test('orbs spawn on five rings, expire and reject remote click collection', () => {
  const state = fixture();
  startRound(state, 1000);
  advance(state, 4);
  assert.ok(state.pickups.length > 0);
  const pickup = state.pickups[0];
  const pilot = state.players[0];
  const before = pilot.score;
  assert.equal(applyAction(state, 'a', { type: 'collect', pickupId: pickup.id }).ok, false);
  assert.equal(pilot.score, before);
  assert.ok(state.pickups.includes(pickup));
  assert.equal(applyAction(state, 'b', { type: 'collect', pickupId: pickup.id }).ok, false);
  advance(state, 20);
  assert.ok(!state.pickups.some((item) => item.id === pickup.id));
  assert.ok(state.pickups.length <= MAX_PICKUPS);
  assert.ok(state.pickups.every((item) => item.expiresAt > state.now));
  assert.ok(state.pickups.every((item) => item.lane >= 0 && item.lane < LANE_COUNT));
});

test('Solar Surge starts on schedule; voice is capped, rate-limited and expires', () => {
  const state = fixture();
  state.players = [state.players[0]];
  const pilot = state.players[0];
  state.rays = [];
  startRound(state, 1000);
  state.nextPickupAt = state.phaseEndsAt + 1;
  assert.equal(applyAction(state, 'a', { type: 'voice', intensity: 1 }).ok, false);
  advance(state, 15);
  // Isolate the metered voice source from a lap or natural orb during this second.
  pilot.orbitProgress = 0;
  state.pickups = [];
  state.nextPickupAt = state.phaseEndsAt + 1;
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

test('all five rings share radii and angular speed with the renderer', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  assert.equal(LANE_COUNT, 5);
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    assert.equal(applyAction(state, pilot.id, { type: 'lane', lane }).ok, true);
    assert.equal(getPlayerPosition(pilot).radius, LANE_RADII[lane]);
    const angle = pilot.angle;
    const speed = getPlayerSpeed(pilot, state.now);
    tickGame(state, 0.05, state.now + 50);
    const moved = (pilot.angle - angle + TAU) % TAU;
    assert.ok(Math.abs(moved - speed * 0.05) < 1e-9);
  }
});

test('orb collection requires its ring and detects contact swept through the angle wrap', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  pilot.angle = TAU - 0.2;
  pilot.lane = 4;
  const pickup = { id: 'wrap-orb', type: 'star', angle: 0.03, lane: 3, expiresAt: state.now + 8000 };
  state.pickups = [pickup];
  tickGame(state, 0.25, state.now + 250);
  assert.ok(state.pickups.includes(pickup), 'a matching angle in a different ring is insufficient');
  assert.equal(applyAction(state, pilot.id, { type: 'lane', lane: 3 }).ok, true);
  pilot.angle = TAU - 0.2;
  tickGame(state, 0.25, state.now + 250);
  assert.equal(state.pickups.length, 0);
  assert.equal(pilot.score, 60);
  assert.equal(getStats(pilot).multiplier, 1.5);
});

test('fast pilots collect swept orbs even when neither endpoint touches them', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  pilot.angle = 0;
  pilot.lane = 2;
  pilot.upgrades = { 'kinetic-drive': 5 };
  pilot.overdriveUntil = state.now + 6000;
  state.pickups = [{ id: 'swept', type: 'chip', angle: 0.4, lane: 2, expiresAt: state.now + 8000 }];
  tickGame(state, 0.25, state.now + 250);
  assert.ok(pilot.angle > 0.7);
  assert.equal(state.pickups.length, 0);
  assert.equal(pilot.score, 35);
  assert.equal(pilot.credits, 85);
  assert.equal(getStats(pilot).speed, 1.05 * 1.8 * 1.25);
});

test('the earliest physical orb contact wins regardless of player order', () => {
  const state = orbFixture();
  const [first, second] = state.players;
  first.angle = 0;
  second.angle = 0.04;
  first.lane = second.lane = 2;
  state.pickups = [{ id: 'shared', type: 'star', angle: 0.15, lane: 2, expiresAt: state.now + 8000 }];
  tickGame(state, 0.25, state.now + 250);
  const collections = state.events.filter((event) => event.type === 'collect');
  assert.equal(collections.length, 1);
  assert.equal(collections[0].playerId, second.id);
  assert.equal(state.pickups.length, 0);
  assert.equal(applyAction(state, first.id, { type: 'collect', pickupId: 'shared' }).ok, false);
});

test('an orb expiring before contact cannot award a late pickup', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  pilot.angle = 0;
  state.pickups = [{ id: 'expired', type: 'star', angle: 0.2, lane: pilot.lane, expiresAt: state.now + 50 }];
  tickGame(state, 0.25, state.now + 250);
  assert.equal(state.pickups.length, 0);
  assert.equal(pilot.score, 0);
});

test('natural seeded orb decks include every effect in one heat and stay bounded', () => {
  const state = orbFixture({ players: 1 });
  state.nextPickupAt = state.now + 1500;
  const seen = new Set();
  for (let index = 0; index < 600; index++) {
    tickGame(state, 0.05, state.now + 50);
    for (const pickup of state.pickups) seen.add(pickup.type);
    assert.ok(state.pickups.length <= MAX_PICKUPS);
  }
  assert.deepEqual([...seen].sort(), ORB_CATALOG.map((orb) => orb.id).sort());
});

test('beam and haste orb stacks cap at 50 rays and 3x rotation then expire individually', () => {
  const state = orbFixture({ players: 1, rays: true });
  for (let index = 0; index < 12; index++) catchOrb(state, 'beam');
  assert.equal(state.rays.length, MAX_RAYS);
  assert.equal(state.fieldEffects.filter((effect) => effect.type === 'beam').length, 10);
  for (let index = 0; index < 10; index++) catchOrb(state, 'haste');
  assert.equal(getRaySpeedMultiplier(state), 3);
  assert.equal(state.fieldEffects.filter((effect) => effect.type === 'haste').length, 8);
  const deadlines = state.fieldEffects.map((effect) => effect.expiresAt).sort((a, b) => a - b);
  tickGame(state, 0, deadlines[0]);
  assert.equal(state.fieldEffects.length, 17);
  assert.equal(state.rays.length, 48);
  assert.equal(getRaySpeedMultiplier(state), 3);
  tickGame(state, 0, deadlines.at(-1));
  assert.equal(state.fieldEffects.length, 0);
  assert.equal(state.rays.length, 3);
  assert.equal(getRaySpeedMultiplier(state), 1);
});

test('ice slows rivals while time stop blocks their movement, lane changes and burst', () => {
  const state = orbFixture();
  const [collector, rival] = state.players;
  const normalSpeed = getPlayerSpeed(rival, state.now);
  catchOrb(state, 'ice', collector);
  assert.equal(collector.slowUntil, 0);
  assert.equal(getPlayerSpeed(rival, state.now), normalSpeed * 0.5);
  catchOrb(state, 'clock', collector);
  const angle = rival.angle;
  assert.equal(getPlayerSpeed(rival, state.now), 0);
  assert.equal(applyAction(state, rival.id, { type: 'lane', lane: 4 }).ok, false);
  assert.equal(applyAction(state, rival.id, { type: 'boost' }).ok, false);
  advance(state, 1);
  assert.equal(rival.angle, angle);
  tickGame(state, 0.05, rival.frozenUntil + 50);
  assert.ok(rival.angle !== angle);
  assert.equal(applyAction(state, rival.id, { type: 'lane', lane: 4 }).ok, true);
  assert.equal(applyAction(state, rival.id, { type: 'boost' }).ok, true);
  assert.ok(getPlayerSpeed(rival, rival.slowUntil) > normalSpeed * 0.5);
});

test('freeze expiry inside a step only permits movement after its deadline', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  pilot.frozenUntil = state.now + 125;
  const angle = pilot.angle;
  const normalSpeed = getPlayerSpeed({ ...pilot, frozenUntil: 0 }, state.now);
  tickGame(state, 0.25, state.now + 250);
  assert.ok(Math.abs(pilot.angle - angle - normalSpeed * 0.125) < 1e-9);
});

test('frozen pilots keep passive income and voice scoring without moving', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  advance(state, 15);
  pilot.upgrades = { 'solar-cell': 1, starlight: 1 };
  pilot.frozenUntil = state.now + 4000;
  const angle = pilot.angle;
  const credits = pilot.credits;
  const score = pilot.score;
  assert.equal(applyAction(state, pilot.id, { type: 'voice', intensity: 1 }).ok, true);
  advance(state, 2);
  assert.equal(pilot.angle, angle);
  assert.equal(pilot.credits, credits + 1);
  assert.equal(pilot.score, score + 53);
});

test('overdrive stacks with burst and positive orb durations extend within 18 seconds', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  const baseSpeed = getPlayerSpeed(pilot, state.now);
  catchOrb(state, 'overdrive');
  assert.equal(getPlayerSpeed(pilot, state.now), baseSpeed * 1.75);
  assert.equal(applyAction(state, pilot.id, { type: 'boost' }).ok, true);
  assert.equal(getPlayerSpeed(pilot, state.now), baseSpeed * 1.75 * 1.65);
  for (let index = 0; index < 5; index++) catchOrb(state, 'overdrive');
  assert.equal(pilot.overdriveUntil, state.now + 18000);
  for (let index = 0; index < 5; index++) catchOrb(state, 'shield');
  assert.equal(pilot.shieldUntil, state.now + 18000);
});

test('echo repeats ray points exactly without duplicating XP or shards', () => {
  const state = orbFixture({ players: 1 });
  const pilot = state.players[0];
  catchOrb(state, 'echo');
  state.baseRayCount = 1;
  state.rays = [{ angle: pilot.angle + 0.03, speed: 0 }];
  const seq = state.eventSeq;
  const credits = pilot.credits;
  const xp = pilot.xp;
  tickGame(state, 0.05, state.now + 50);
  const events = state.events.filter((event) => event.id > seq);
  const ray = events.find((event) => event.type === 'ray');
  const echo = events.find((event) => event.type === 'echo');
  assert.ok(ray && echo);
  assert.equal(ray.amount, echo.amount);
  assert.equal(pilot.xp, xp + 8);
  assert.equal(pilot.credits, credits + 3);
});

test('shield clears hostile effects and blocks subsequent ice, clock and blackhole attacks', () => {
  const state = orbFixture({ players: 3 });
  const [collector, shielded, exposed] = state.players;
  shielded.slowUntil = shielded.frozenUntil = shielded.gravityUntil = state.now + 5000;
  shielded.nextGravityAt = state.now + 750;
  catchOrb(state, 'shield', shielded);
  assert.equal(shielded.slowUntil, 0);
  assert.equal(shielded.frozenUntil, 0);
  assert.equal(shielded.gravityUntil, 0);
  assert.equal(shielded.nextGravityAt, 0);
  catchOrb(state, 'ice', collector);
  catchOrb(state, 'clock', collector);
  catchOrb(state, 'blackhole', collector);
  assert.equal(shielded.slowUntil, 0);
  assert.equal(shielded.frozenUntil, 0);
  assert.equal(shielded.gravityUntil, 0);
  assert.ok(exposed.slowUntil > state.now);
  assert.ok(exposed.frozenUntil > state.now);
  assert.ok(exposed.gravityUntil > state.now);
});

test('gravity pulls rivals inward on schedule, allows resistance and catches up missed pulls', () => {
  const state = orbFixture();
  const [collector, rival] = state.players;
  rival.lane = 4;
  catchOrb(state, 'blackhole', collector);
  assert.equal(collector.gravityUntil, 0);
  const firstPull = rival.nextGravityAt;
  advance(state, 0.7);
  assert.equal(rival.lane, 4);
  advance(state, 0.05);
  assert.equal(rival.lane, 3);
  assert.equal(rival.nextGravityAt, firstPull + 750);
  assert.equal(applyAction(state, rival.id, { type: 'lane', lane: 4 }).ok, true);
  advance(state, 0.75);
  assert.equal(rival.lane, 3);
  tickGame(state, 0.05, rival.nextGravityAt + 1500);
  assert.equal(rival.lane, 0);
  assert.ok(rival.nextGravityAt > state.now);
  const deadline = rival.gravityUntil;
  tickGame(state, 0.05, deadline + 50);
  assert.equal(applyAction(state, rival.id, { type: 'lane', lane: 4 }).ok, true);
  advance(state, 1);
  assert.equal(rival.lane, 4);
});

test('heat boundaries remove every temporary orb effect and restore base beam count', () => {
  const state = orbFixture();
  for (const orb of ORB_CATALOG) catchOrb(state, orb.id);
  tickGame(state, 0.05, state.phaseEndsAt);
  assert.equal(state.phase, 'shop');
  assert.equal(state.fieldEffects.length, 0);
  assert.equal(state.pickups.length, 0);
  assert.equal(state.rays.length, state.baseRayCount);
  for (const pilot of state.players) {
    for (const key of ['starlightUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt']) assert.equal(pilot[key], 0, key);
  }
});

test('eight pilots, 50 beams and all active statuses fit the actual 16 KiB relay envelope', () => {
  const state = orbFixture({ players: MAX_PLAYERS, rays: true, now: 1800000000000 });
  state.fieldEffects = [...Array.from({ length: 10 }, () => ({ type: 'beam', expiresAt: state.now + 20000 })), ...Array.from({ length: 8 }, () => ({ type: 'haste', expiresAt: state.now + 20000 }))];
  advance(state, 8);
  assert.equal(state.rays.length, 50);
  for (const pilot of state.players) {
    for (const key of ['starlightUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt']) pilot[key] = state.now + 2000;
    pilot.upgrades = { 'kinetic-drive': 5, 'prism-amplifier': 5, 'wide-spectrum': 4, 'triple-prism': 5 };
  }
  const envelope = { protocol: 'rogue-refract/1', sessionId: 'room', hostId: state.players[0].id, kind: 'state', epoch: '12345678-1234-1234-1234-123456789012', revision: 12345, members: state.players.map((pilot) => pilot.id), state };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).length;
  assert.ok(bytes < 16384, `actual relay envelope is ${bytes} bytes`);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('high-volume ray scoring preserves the local level-up celebration in the bounded event buffer', () => {
  const state = orbFixture({ players: MAX_PLAYERS, rays: true });
  state.fieldEffects = Array.from({ length: 10 }, () => ({ type: 'beam', expiresAt: state.now + 20000 }));
  tickGame(state, 0, state.now);
  for (const pilot of state.players) { pilot.angle = 1; pilot.lane = 2; pilot.xp = 74; }
  for (const ray of state.rays) { ray.angle = 1.03; ray.speed = 0; }
  state.players[0].upgrades['wide-spectrum'] = 4;
  tickGame(state, 0.05, state.now + 50);
  assert.ok(state.eventSeq > 400);
  assert.ok(state.events.length <= 12);
  const localLevel = state.events.find((event) => event.type === 'levelup' && event.playerId === state.players[0].id);
  assert.ok(localLevel, 'later bot ray awards must not evict the local celebration');
  assert.equal(localLevel.amount, state.players[0].level);
  assert.ok(state.events.some((event) => event.type === 'round-start'));
});

test('packed full builds with UUID pilots, all collision pairs and 50 rays fit the relay envelope losslessly', () => {
  const state = orbFixture({ players: MAX_PLAYERS, rays: true, now: 1800000000000 });
  for (let index = 0; index < state.players.length; index++) {
    const pilot = state.players[index];
    pilot.id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    pilot.name = `A fully upgraded orbital pilot ${index}`;
    pilot.upgrades = Object.fromEntries(UPGRADE_CATALOG.map((item) => [item.id, item.maxLevel]));
  }
  state.players[0].avatarUrl = 'https://example.test/pilot-avatar.png';
  state.fieldEffects = [...Array.from({ length: 10 }, () => ({ type: 'beam', expiresAt: state.now + 20000 })), ...Array.from({ length: 8 }, () => ({ type: 'haste', expiresAt: state.now + 20000 }))];
  advance(state, 8);
  assert.equal(state.rays.length, 50);
  for (const pilot of state.players) {
    for (const key of ['starlightUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt']) pilot[key] = state.now + 2000;
  }
  for (let first = 0; first < state.players.length; first++) {
    for (let second = first + 1; second < state.players.length; second++) state.collisionCooldowns[[state.players[first].id, state.players[second].id].sort().join('|')] = state.now + 1600;
  }
  state.pickups = Array.from({ length: MAX_PICKUPS }, (_, index) => ({ id: `p${index}`, type: ORB_CATALOG[index].id, angle: index * 0.7, lane: index % LANE_COUNT, expiresAt: state.now + 8000 }));
  const before = JSON.stringify(state);
  const packed = packGameState(state);
  const encoded = JSON.stringify(packed);
  const envelope = { protocol: 'rogue-refract/1', sessionId: '00000000-0000-4000-8000-000000000000', hostId: state.players[0].id, kind: 'state', epoch: '12345678-1234-1234-1234-123456789012', revision: 123456, members: state.players.map((pilot) => pilot.id), state: packed };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).length;
  assert.ok(bytes < 16384, `full-build packed relay envelope is ${bytes} bytes`);
  assert.ok(encoded.length < before.length - 5000, 'repeated catalog and UUID collision keys should be removed');
  assert.deepEqual(unpackGameState(JSON.parse(encoded)), state);
  assert.equal(JSON.stringify(state), before, 'packing does not mutate the simulation');
  assert.equal(JSON.stringify(packed), encoded, 'unpacking does not mutate the wire snapshot');
  assert.equal(packed.players[0].avatarUrl, state.players[0].avatarUrl, 'avatar handling stays with the caller');
});

test('wire packing preserves empty builds and noncanonical collision records without mutation', () => {
  const state = orbFixture();
  state.collisionCooldowns['retired-pilot|missing-pilot'] = state.now + 1600;
  const packed = packGameState(state);
  assert.deepEqual(packed.players[0].upgrades, []);
  assert.deepEqual(packed.collisionCooldowns, [['retired-pilot|missing-pilot', state.now + 1600]]);
  assert.deepEqual(unpackGameState(packed), state);
  assert.equal(unpackGameState(state), state, 'unmarked snapshots remain compatible');
  packed.players[0].upgrades.push(1);
  assert.deepEqual(state.players[0].upgrades, {}, 'packed upgrade storage is independent');
});

test('packed state decoder rejects malformed levels, collision indices and unsupported formats', () => {
  const state = orbFixture();
  let packed = packGameState(state);
  packed.players[0].upgrades = [-1];
  assert.throws(() => unpackGameState(packed), /upgrade level/);
  packed = packGameState(state);
  packed.players[0].upgrades = [UPGRADE_CATALOG[0].maxLevel + 1];
  assert.throws(() => unpackGameState(packed), /upgrade level/);
  packed = packGameState(state);
  packed.collisionCooldowns = [[0, 99, state.now]];
  assert.throws(() => unpackGameState(packed), /collision pair/);
  packed.collisionCooldowns = [[0, 0, state.now]];
  assert.throws(() => unpackGameState(packed), /collision pair/);
  packed.packed = 2;
  assert.throws(() => unpackGameState(packed), /packed orbit state/);
});
