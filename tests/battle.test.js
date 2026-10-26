import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, removePlayer, applyAction, tickGame, startRound, getPlayerSpeed, getMoveStats, getMoveCost, getMoveUnlockRound, getLightCapacity, getLightYield, getOrbUpgradeCost, packGameState, unpackGameState, MOVE_CATALOG, ORB_UPGRADE_CATALOG, UPGRADE_CATALOG, ORB_CATALOG, MAX_PLAYERS, MAX_PICKUPS } from '../src/game.js';

function fixture({ count = 3, bots = false, now = 1000, ...options } = {}) {
  const state = createGame({ seed: 42, now, ...options });
  for (let index = 0; index < count; index++) addPlayer(state, { id: `pilot-${index}`, name: `Pilot ${index}`, bot: bots && index > 0 });
  assert.equal(applyAction(state, state.players[0].id, { type: 'mode', mode: 'battle' }).ok, true);
  state.rays = [];
  return state;
}
const act = (state, player, action) => applyAction(state, player.id, { ...action, round: state.round });
function enterShop(state) { assert.equal(act(state, state.players[0], { type: 'start' }).ok, true); }
function buy(state, player, moveId) { assert.equal(act(state, player, { type: 'buy-move', moveId }).ok, true); }
function launch(state) {
  for (const player of state.players.filter((pilot) => !pilot.bot)) act(state, player, { type: 'ready' });
  tickGame(state, 0.05, state.now + 50);
  assert.equal(state.phase, 'playing');
  state.nextPickupAt = state.phaseEndsAt + 1;
}
function loadout(state) {
  enterShop(state);
  for (const player of state.players) {
    player.credits = 1000;
    for (const move of MOVE_CATALOG) if (!player.moves[move.id]) buy(state, player, move.id);
  }
  launch(state);
  for (const player of state.players) player.lightPoints = getLightCapacity(player);
}
function cast(state, player, moveId, target) {
  // Generic move tests take a legal turn first; dedicated scheduler tests below
  // submit actions directly so turn ownership remains part of the assertion.
  for (let steps = 0; state.combatStyle !== 'no-limits' && state.phase === 'playing' && player.health > 0 && state.turnPlayerId !== player.id && steps < state.players.length * 2; steps++) {
    const current = state.players.find((pilot) => pilot.id === state.turnPlayerId);
    if (!current || !act(state, current, { type: 'pass-turn' }).ok) break;
  }
  return act(state, player, { type: 'cast', moveId, targetId: target?.id });
}
function recharge(state, player) { player.castReadyAt = state.now; }
function catchOrb(state, player, type) {
  state.pickups.push({ id: `manual-${++state.pickupSeq}`, type, angle: player.angle, lane: player.lane, expiresAt: state.now + 8000 });
  tickGame(state, 0.05, state.now + 50);
}

test('battle opens a paid preparation shop without granting a repeatable shard reward', () => {
  const state = fixture();
  const player = state.players[0];
  assert.deepEqual(player.moves, {});
  assert.equal(player.lightPoints, 0);
  assert.equal(player.health, 100);
  assert.equal(cast(state, player, 'photon-strike', state.players[1]).ok, false);
  enterShop(state);
  assert.equal(state.round, 0);
  assert.equal(state.phase, 'shop');
  assert.equal(player.credits, 60);
  buy(state, player, 'photon-strike');
  assert.equal(player.credits, 25);
  assert.equal(player.moves['photon-strike'], 1);
  assert.equal(player.movePP['photon-strike'], 8);
  assert.equal(act(state, player, { type: 'buy-move', moveId: 'mending-light' }).ok, false);
  act(state, player, { type: 'lobby' });
  enterShop(state);
  assert.equal(player.credits, 25);
  launch(state);
  assert.equal(state.round, 1);
  assert.equal(act(state, player, { type: 'buy-move', moveId: 'mending-light' }).ok, false);
  assert.equal(act(state, player, { type: 'mode', mode: 'orbit' }).ok, false);
});

test('all five purchased moves level through buy rounds and never spend above rank gates or max rank', () => {
  const state = fixture();
  const player = state.players[0];
  enterShop(state);
  player.credits = 10000;
  for (let rank = 1; rank <= 5; rank++) {
    state.round = rank - 1;
    for (const move of MOVE_CATALOG) {
      const cost = getMoveCost(player, move.id);
      assert.equal(getMoveUnlockRound(player, move.id), rank);
      const before = player.credits;
      buy(state, player, move.id);
      assert.equal(player.credits, before - cost);
      assert.equal(player.moves[move.id], rank);
      const beforeBlocked = player.credits;
      assert.equal(act(state, player, { type: 'buy-move', moveId: move.id }).ok, false);
      assert.equal(player.credits, beforeBlocked);
    }
  }
  player.credits = 0;
  state.round = 10;
  player.moves['photon-strike'] = 1;
  player.upgradeTokens = 1;
  buy(state, player, 'photon-strike');
  assert.equal(player.upgradeTokens, 0);
  assert.equal(player.credits, 0);
  assert.equal(act(state, player, { type: 'buy-move', moveId: '__proto__' }).ok, false);
  const first = getMoveStats(player, 'photon-strike', 1);
  const fifth = getMoveStats(player, 'photon-strike', 5);
  assert.ok(fifth.power > first.power && fifth.maxPP > first.maxPP && fifth.lightCost > first.lightCost);
});

test('physical light pickups fuel LP within upgraded capacity and potency without refilling move PP', () => {
  const state = fixture();
  enterShop(state);
  const player = state.players[0];
  player.credits = 1000;
  buy(state, player, 'photon-strike');
  for (const item of ORB_UPGRADE_CATALOG) {
    const before = player.credits;
    const cost = getOrbUpgradeCost(player, item.id);
    assert.equal(act(state, player, { type: 'buy-orb', upgradeId: item.id }).ok, true);
    assert.equal(player.credits, before - cost);
    assert.equal(act(state, player, { type: 'buy-orb', upgradeId: item.id }).ok, false);
  }
  assert.equal(getLightCapacity(player), 25);
  assert.equal(getLightYield(player, 'light'), 3);
  assert.equal(getLightYield(player, 'light-surge'), 5);
  assert.equal(getLightYield(player, 'light-nova'), 7);
  launch(state);
  player.movePP['photon-strike'] = 2;
  catchOrb(state, player, 'light');
  assert.equal(player.lightPoints, 3);
  catchOrb(state, player, 'light-surge');
  assert.equal(player.lightPoints, 8);
  player.lightPoints = 24;
  catchOrb(state, player, 'light-nova');
  assert.equal(player.lightPoints, 25);
  assert.equal(player.movePP['photon-strike'], 2);
  assert.equal(act(state, player, { type: 'collect', pickupId: 'forged' }).ok, false);
});

test('targeted attacks validate ownership, target, LP, PP, cooldown, stale rounds and heat deadline', () => {
  const state = fixture();
  loadout(state);
  const [player, rival] = state.players;
  assert.equal(cast(state, player, 'photon-strike').ok, false);
  assert.equal(cast(state, player, 'photon-strike', player).ok, false);
  assert.equal(cast(state, player, 'not-a-move', rival).ok, false);
  assert.equal(applyAction(state, player.id, { type: 'cast', moveId: 'photon-strike', targetId: rival.id, round: state.round - 1 }).ok, false);
  assert.equal(cast(state, player, 'photon-strike', rival).ok, true);
  assert.equal(rival.health, 80);
  assert.equal(player.lightPoints, 17);
  assert.equal(player.movePP['photon-strike'], 7);
  assert.equal(cast(state, player, 'photon-strike', rival).ok, false);
  recharge(state, player);
  player.lightPoints = 2;
  assert.equal(cast(state, player, 'photon-strike', rival).ok, false);
  assert.equal(player.movePP['photon-strike'], 7);
  player.lightPoints = 20;
  player.movePP['photon-strike'] = 0;
  assert.equal(cast(state, player, 'photon-strike', rival).ok, false);
  player.movePP['photon-strike'] = 1;
  state.now = state.phaseEndsAt;
  assert.equal(cast(state, player, 'photon-strike', rival).ok, false);
  assert.equal(rival.health, 80);
});

test('heals clamp at full HP; reflection bounces once and credits a reflected knockout correctly', () => {
  const state = fixture();
  loadout(state);
  const [player, rival] = state.players;
  assert.equal(cast(state, player, 'mending-light', player).ok, false);
  player.health = 90;
  assert.equal(cast(state, player, 'mending-light', rival).ok, false);
  assert.equal(cast(state, player, 'mending-light', player).ok, true);
  assert.equal(player.health, 100);
  recharge(state, player);
  player.health = 15;
  assert.equal(cast(state, player, 'mirror-veil', player).ok, true);
  assert.equal(cast(state, rival, 'mirror-veil', rival).ok, true);
  recharge(state, player);
  assert.equal(cast(state, player, 'photon-strike', rival).ok, true);
  assert.equal(rival.health, 100);
  assert.equal(player.health, 0);
  assert.equal(rival.reflectUntil, 0);
  assert.equal(rival.knockouts, 1);
  const event = state.events.findLast((event) => event.type === 'cast');
  assert.equal(event.reflected, true);
  assert.equal(event.reflectedBy, rival.id);
  assert.equal(event.otherId, player.id);
});

test('stun blocks movement, lane changes and casting; shield absorbs damage and expires', () => {
  const state = fixture();
  loadout(state);
  const [player, rival] = state.players;
  assert.equal(cast(state, player, 'static-pulse', rival).ok, true);
  assert.equal(rival.health, 92);
  const angle = rival.angle;
  tickGame(state, 0.05, state.now + 50);
  assert.equal(rival.angle, angle);
  assert.equal(getPlayerSpeed(rival, state.now), 0);
  assert.equal(act(state, rival, { type: 'lane', lane: 4 }).ok, false);
  assert.equal(act(state, rival, { type: 'boost' }).ok, false);
  assert.equal(cast(state, rival, 'photon-strike', player).ok, false);
  tickGame(state, 0.05, rival.stunUntil + 50);
  assert.ok(getPlayerSpeed(rival, state.now) > 0);
  assert.equal(cast(state, rival, 'aegis-shell', rival).ok, true);
  assert.equal(rival.shieldHealth, 20);
  recharge(state, player);
  assert.equal(cast(state, player, 'photon-strike', rival).ok, true);
  assert.equal(rival.health, 92);
  assert.equal(rival.shieldHealth, 0);
  recharge(state, rival);
  assert.equal(cast(state, rival, 'aegis-shell', rival).ok, true);
  tickGame(state, 0.05, rival.barrierUntil + 50);
  assert.equal(rival.shieldHealth, 0);
  recharge(state, player);
  assert.equal(cast(state, player, 'photon-strike', rival).ok, true);
  assert.equal(rival.health, 72);
});

test('eliminated pilots freeze for the whole heat and cannot earn points, collect, or act', () => {
  const state = fixture();
  loadout(state);
  const [player, rival] = state.players;
  rival.health = 10;
  rival.upgrades = { starlight: 5, 'solar-cell': 4 };
  assert.equal(cast(state, player, 'photon-strike', rival).ok, true);
  assert.equal(state.phase, 'playing');
  const before = { score: rival.score, credits: rival.credits, angle: rival.angle };
  for (const action of [{ type: 'lane', lane: 4 }, { type: 'boost' }, { type: 'voice', intensity: 1 }, { type: 'cast', moveId: 'mending-light', targetId: rival.id }]) assert.equal(act(state, rival, action).ok, false);
  catchOrb(state, rival, 'light-nova');
  tickGame(state, 0.05, state.now + 10000);
  assert.equal(rival.health, 0);
  assert.equal(rival.angle, before.angle);
  assert.equal(rival.score, before.score);
  assert.equal(rival.credits, before.credits);
  assert.equal(rival.lightPoints, 0);
  assert.equal(cast(state, player, 'photon-strike', rival).ok, false);
  assert.equal(player.knockouts, 1);
});

test('last surviving pilot wins immediately and all pilots revive with full PP next heat', () => {
  const state = fixture({ count: 2 });
  loadout(state);
  const [player, rival] = state.players;
  rival.health = 10;
  const end = state.phaseEndsAt;
  assert.equal(cast(state, player, 'photon-strike', rival).ok, true);
  assert.equal(state.phase, 'shop');
  assert.equal(state.battleWinnerId, player.id);
  assert.ok(state.now < end);
  assert.equal(rival.health, 0);
  assert.equal(state.lastResults[0].id, player.id);
  assert.equal(state.lastResults[1].health, 0);
  assert.equal(state.events.findLast((event) => event.type === 'winner').text, 'Winner winner chicken dinner!');
  assert.equal(player.movePP['photon-strike'], 8);
  launch(state);
  assert.equal(rival.health, 100);
  assert.equal(state.battleWinnerId, null);
  assert.equal(rival.movePP['photon-strike'], 8);
});

test('a departed final rival awards survival victory while timeout with several survivors does not', () => {
  const state = fixture({ count: 2 });
  loadout(state);
  removePlayer(state, state.players[1].id);
  assert.equal(state.phase, 'shop');
  assert.equal(state.battleWinnerId, state.players[0].id);
  const timed = fixture();
  loadout(timed);
  tickGame(timed, 0.05, timed.phaseEndsAt);
  assert.equal(timed.phase, 'shop');
  assert.equal(timed.battleWinnerId, null);
  assert.equal(timed.events.some((event) => event.type === 'winner'), false);
});

test('a departing active pilot hands the turn to the next surviving roster member immediately', () => {
  const state = fixture({ count: 4 });
  loadout(state);
  const [first, second, third] = state.players;
  act(state, first, { type: 'pass-turn' });
  assert.equal(state.turnPlayerId, second.id);
  removePlayer(state, second.id);
  assert.equal(state.phase, 'playing');
  assert.equal(state.turnPlayerId, third.id);
  assert.equal(state.turnEndsAt, state.now + 10000);
});

test('returning to lobby preserves all bought progression and score, clearing combat state; reset keeps mode', () => {
  const state = fixture();
  loadout(state);
  const player = state.players[0];
  player.upgrades = { 'kinetic-drive': 2 };
  player.orbUpgrades = { 'light-reservoir': 2 };
  player.score = 1234;
  player.health = 0;
  player.stunUntil = player.reflectUntil = player.shieldUntil = state.now + 8000;
  assert.equal(act(state, player, { type: 'lobby' }).ok, true);
  assert.equal(state.phase, 'lobby');
  assert.equal(player.health, 100);
  assert.equal(player.lightPoints, 0);
  assert.equal(player.score, 1234);
  assert.equal(player.moves['photon-strike'], 1);
  assert.equal(player.orbUpgrades['light-reservoir'], 2);
  assert.equal(player.upgrades['kinetic-drive'], 2);
  assert.equal(player.stunUntil, 0);
  assert.equal(player.reflectUntil, 0);
  assert.equal(player.shieldUntil, 0);
  assert.deepEqual(state.pickups, []);
  enterShop(state);
  assert.equal(state.phase, 'shop');
  const seq = state.eventSeq;
  act(state, player, { type: 'reset' });
  assert.equal(state.gameMode, 'battle');
  assert.equal(state.phase, 'lobby');
  assert.deepEqual(state.players[0].moves, {});
  assert.equal(state.players[0].score, 0);
  assert.equal(state.turnPlayerId ?? null, null);
  assert.equal(state.battleWinnerId ?? null, null);
  assert.equal(state.battlePreparation ?? false, false);
  assert.ok(state.eventSeq > seq);
});

test('battle spawning guarantees frequent light fuel and bots purchase, collect and cast moves', () => {
  const state = fixture({ bots: true, count: 6 });
  enterShop(state);
  for (const player of state.players.filter((pilot) => pilot.bot)) {
    assert.equal(player.moves['photon-strike'], 1);
    assert.equal(player.ready, true);
  }
  launch(state);
  state.nextPickupAt = state.now + 50;
  const seen = new Map();
  let lightDrops = 0;
  let castCount = 0;
  for (let index = 0; index < 1100 && state.phase === 'playing'; index++) {
    const events = tickGame(state, 0.05, state.now + 50);
    castCount += events.filter((event) => event.type === 'cast' && event.playerId !== state.players[0].id).length;
    for (const pickup of state.pickups) if (!seen.has(pickup.id)) {
      seen.set(pickup.id, pickup.type);
      if (pickup.type.startsWith('light')) lightDrops++;
    }
    assert.ok(state.pickups.length <= MAX_PICKUPS);
  }
  assert.ok(lightDrops >= seen.size / 2, `${lightDrops}/${seen.size} light drops`);
  assert.ok(castCount > 0, 'Bots should spend collected light on actual attacks');
});

test('turn ownership, passing, 10-second timeout and stun turn skipping are authoritative', () => {
  const state = fixture();
  loadout(state);
  const [first, second, third] = state.players;
  assert.equal(state.turnPlayerId, first.id);
  assert.equal(state.turnEndsAt, state.now + 10000);
  assert.equal(act(state, second, { type: 'cast', moveId: 'photon-strike', targetId: first.id }).ok, false);
  assert.equal(act(state, second, { type: 'pass-turn' }).ok, false);
  assert.equal(act(state, first, { type: 'cast', moveId: 'static-pulse', targetId: second.id }).ok, true);
  assert.equal(state.turnPlayerId, third.id, 'Stunned second pilot loses its next turn');
  assert.equal(second.skipTurns, 0, 'Skip consumed exactly once');
  assert.equal(act(state, third, { type: 'pass-turn' }).ok, true);
  assert.equal(state.turnPlayerId, first.id);
  tickGame(state, 0.05, state.turnEndsAt);
  assert.equal(state.turnPlayerId, second.id);
  assert.equal(state.turnEndsAt, state.now + 10000);
  const own = state.turnPlayerId;
  state.players.find((pilot) => pilot.id === own).lightPoints = 0;
  assert.equal(act(state, second, { type: 'pass-turn' }).ok, true, 'Players with no LP can always pass');
  assert.equal(state.turnPlayerId, third.id);
  assert.equal(act(state, first, { type: 'combat-style', style: 'no-limits' }).ok, false);
});

test('no limits uses purchased moves and cooldown alone without consuming LP or PP', () => {
  const state = fixture();
  assert.equal(act(state, state.players[0], { type: 'combat-style', style: 'no-limits' }).ok, true);
  loadout(state);
  const [first, second] = state.players;
  assert.equal(state.turnPlayerId, null);
  first.lightPoints = 0;
  first.movePP['photon-strike'] = 0;
  second.lightPoints = 0;
  second.movePP['photon-strike'] = 0;
  assert.equal(cast(state, first, 'photon-strike', second).ok, true);
  assert.equal(cast(state, second, 'photon-strike', first).ok, true, 'Both rivals can cast without a turn queue');
  assert.equal(first.lightPoints, 0);
  assert.equal(first.movePP['photon-strike'], 0);
  assert.equal(second.health, 80);
  assert.equal(cast(state, first, 'photon-strike', second).ok, false, 'Cooldown still applies');
  first.castReadyAt = state.now;
  assert.equal(cast(state, first, 'photon-strike', second).ok, true);
  assert.equal(act(state, first, { type: 'pass-turn' }).ok, false);
  delete first.moves['static-pulse'];
  first.castReadyAt = state.now;
  assert.equal(cast(state, first, 'static-pulse', second).ok, false, 'No limits never grants an unbought move');
  act(state, first, { type: 'lobby' });
  act(state, first, { type: 'reset' });
  assert.equal(state.combatStyle, 'no-limits');
});

test('a cast or pass arriving exactly at the turn deadline expires the old turn before the next tick', () => {
  const state = fixture();
  loadout(state);
  const [first, second, third] = state.players;
  const castResult = applyAction(state, first.id, { type: 'cast', moveId: 'photon-strike', targetId: second.id, round: state.round }, state.turnEndsAt);
  assert.equal(castResult.ok, false);
  assert.equal(state.turnPlayerId, second.id);
  assert.equal(second.health, 100);
  assert.equal(first.lightPoints, 20);
  assert.equal(first.movePP['photon-strike'], 8);
  const passResult = applyAction(state, second.id, { type: 'pass-turn', round: state.round }, state.turnEndsAt);
  assert.equal(passResult.ok, false);
  assert.equal(state.turnPlayerId, third.id);
  assert.equal(act(state, third, { type: 'pass-turn' }).ok, true);
  assert.equal(state.turnPlayerId, first.id);
});

test('packed worst-case battle builds remain lossless and under the 16KiB relay limit', () => {
  const state = fixture({ count: MAX_PLAYERS, now: 1800000000000 });
  startRound(state);
  state.rays = Array.from({ length: 50 }, (_, index) => ({ angle: index * 0.1, speed: 0.35 }));
  for (let index = 0; index < state.players.length; index++) {
    const player = state.players[index];
    player.id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    player.name = `A fully upgraded orbital pilot ${index}`;
    player.upgrades = Object.fromEntries(UPGRADE_CATALOG.map((item) => [item.id, item.maxLevel]));
    player.moves = Object.fromEntries(MOVE_CATALOG.map((move) => [move.id, move.maxLevel]));
    player.movePP = Object.fromEntries(MOVE_CATALOG.map((move) => [move.id, getMoveStats(player, move.id).maxPP]));
    player.orbUpgrades = Object.fromEntries(ORB_UPGRADE_CATALOG.map((item) => [item.id, item.maxLevel]));
    for (const key of ['starlightUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt', 'castReadyAt', 'stunUntil', 'reflectUntil', 'barrierUntil']) player[key] = state.now + 2000;
    player.shieldHealth = 60;
    player.lightPoints = 35;
    player.rayCooldowns = 'abc'.repeat(50);
  }
  for (let first = 0; first < state.players.length; first++) for (let second = first + 1; second < state.players.length; second++) state.collisionCooldowns[[state.players[first].id, state.players[second].id].sort().join('|')] = state.now + 1600;
  state.fieldEffects = [...Array.from({ length: 10 }, () => ({ type: 'beam', expiresAt: state.now + 20000 })), ...Array.from({ length: 8 }, () => ({ type: 'haste', expiresAt: state.now + 20000 }))];
  state.pickups = Array.from({ length: MAX_PICKUPS }, (_, index) => ({ id: `p${index}`, type: ORB_CATALOG[index].id, angle: index * 0.7, lane: index % 5, expiresAt: state.now + 8000 }));
  state.events = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, at: state.now, type: 'cast', playerId: state.players[index % 8].id, otherId: state.players[(index + 1) % 8].id, moveId: 'photon-strike', amount: 44, text: 'Photon strike · 44 damage' }));
  const before = JSON.stringify(state);
  const packed = packGameState(state);
  const envelope = { protocol: 'rogue-refract/1', sessionId: '00000000-0000-4000-8000-000000000000', hostId: state.players[0].id, kind: 'state', epoch: '12345678-1234-1234-1234-123456789012', revision: 123456, members: state.players.map((player) => player.id), state: packed };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).length;
  assert.ok(bytes < 16384, `Battle relay envelope is ${bytes} bytes`);
  assert.deepEqual(unpackGameState(JSON.parse(JSON.stringify(packed))), state);
  assert.equal(JSON.stringify(state), before);
  const corrupt = structuredClone(packed);
  corrupt.players[0].battle[0] = 101;
  assert.throws(() => unpackGameState(corrupt), /battle resources/);
});
