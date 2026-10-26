// The simulation is independent of the DOM and transport. Only the elected host
// advances it; every command carries the authenticated activity participant ID.
export const TAU = Math.PI * 2;
export const MAX_PLAYERS = 8;
export const LANE_COUNT = 5;
export const LANE_RADII = Object.freeze([0.48, 0.61, 0.74, 0.87, 1]);
export const LANE_SPEEDS = Object.freeze([1.15, 1.075, 1, 0.925, 0.85]);
export const MAX_RAYS = 50;
export const MAX_PICKUPS = 8;
const ORB_INTERVAL = 1500;
const ORB_LIFETIME = 8000;
const ORB_CONTACT_ARC = 0.075;
const FIELD_DURATION = 20000;
const MAX_BEAM_STACKS = 10;
const MAX_HASTE_STACKS = 8;
const IMPORTANT_EVENTS = new Set(['levelup', 'collect', 'round-start', 'round-end', 'reset', 'purchase', 'surge-start', 'cast', 'knockout', 'lobby', 'winner']);
export const ORB_CATALOG = Object.freeze([
  { id: 'star', name: 'Starlight', color: '#ffdc89', points: 60, duration: 6, description: '1.5× points for 6 seconds.' },
  { id: 'chip', name: 'Refract chip', color: '#bcf6cf', points: 35, duration: 6, description: '+25 shards and +25% orbit speed for 6 seconds.' },
  { id: 'beam', name: 'Prism bloom', color: '#d5b2ff', points: 50, duration: 20, description: '+5 centre beams for 20 seconds. Stacks up to 50 beams.' },
  { id: 'haste', name: 'Light rush', color: '#ffad69', points: 50, duration: 20, description: '+25% beam rotation speed for 20 seconds. Stacks up to 3×.' },
  { id: 'ice', name: 'Ice orb', color: '#8be0fa', points: 75, duration: 4, description: 'Slow every unshielded rival by 50% for 4 seconds.' },
  { id: 'clock', name: 'Time stop', color: '#f5a6d5', points: 90, duration: 2, description: 'Freeze every unshielded rival for 2 seconds.' },
  { id: 'overdrive', name: 'Overdrive', color: '#ff916e', points: 70, duration: 6, description: '1.75× orbit speed for 6 seconds. Stacks with burst.' },
  { id: 'echo', name: 'Echo orb', color: '#aab7ff', points: 65, duration: 6, description: 'Repeat your ray point rewards for 6 seconds.' },
  { id: 'shield', name: 'Prism shield', color: '#6de9d3', points: 55, duration: 8, description: 'Clear hostile effects and block ice, time stop and gravity for 8 seconds.' },
  { id: 'blackhole', name: 'Black hole', color: '#b995f5', points: 100, duration: 6, description: 'Pull unshielded rivals inward every 0.75 seconds for 6 seconds.' },
  { id: 'light', name: 'Light mote', color: '#f8ec9a', points: 20, duration: 0, light: 2, description: '+2 Light Points in battle. Fuel for purchased moves.' },
  { id: 'light-surge', name: 'Light cluster', color: '#80e8ff', points: 35, duration: 0, light: 4, description: '+4 Light Points in battle. Move PP still limits each move.' },
  { id: 'light-nova', name: 'Nova orb', color: '#e4b0ff', points: 50, duration: 0, light: 6, description: '+6 Light Points in battle. Store light for stronger moves.' },
].map(Object.freeze));
const orbById = new Map(ORB_CATALOG.map((orb) => [orb.id, orb]));
export const PLAYER_COLORS = ['#b5a0ff', '#6de9d3', '#ffb873', '#f58bbd', '#72b8ff', '#d9e984', '#ff8e91', '#8be0fa', '#cab9a7', '#a5e5aa', '#dca7ff', '#f2dd98'];

const upgrade = (id, name, description, rarity, cost, maxLevel, icon, category) =>
  Object.freeze({ id, name, description, rarity, cost, maxLevel, icon, category });

export const UPGRADE_CATALOG = Object.freeze([
  upgrade('kinetic-drive', 'Kinetic drive', '+16% spin speed. More revolutions, more opportunities.', 'common', 65, 5, 'zap', 'Velocity'),
  upgrade('triple-prism', 'Triple prism', '+10% chance for ray hits to score a critical triple.', 'rare', 100, 5, 'prism', 'Luck'),
  upgrade('prism-amplifier', 'Prism amplifier', '+8 base points from every light ray.', 'common', 60, 5, 'sun', 'Light'),
  upgrade('heavy-orbit', 'Heavy orbit', '+12 base points whenever you collide with another pilot.', 'common', 55, 5, 'collision', 'Collision'),
  upgrade('lap-reactor', 'Lap reactor', '+15 base points for every full revolution.', 'common', 60, 5, 'orbit', 'Orbit'),
  upgrade('wide-spectrum', 'Wide spectrum', 'Widen your ray collection arc by 0.026 radians.', 'common', 55, 4, 'scan', 'Light'),
  upgrade('lucky-photon', 'Lucky photon', '+4% critical chance and +0.5× critical multiplier.', 'epic', 140, 4, 'sparkles', 'Luck'),
  upgrade('phase-echo', 'Phase echo', '+12% chance for a ray hit to echo for 50% extra points.', 'rare', 95, 5, 'echo', 'Light'),
  upgrade('chain-reaction', 'Chain reaction', 'Ray hits within 6 seconds build +8% score per chain step.', 'rare', 90, 4, 'link', 'Combo'),
  upgrade('solar-cell', 'Solar cell', 'Generate 0.8 extra shards per second while spinning.', 'common', 70, 4, 'battery', 'Economy'),
  upgrade('xp-lens', 'Experience lens', '+25% experience from all scoring events.', 'common', 65, 4, 'book', 'Growth'),
  upgrade('gold-rush', 'Gold rush', '+25% shards earned from hits, collisions and revolutions.', 'common', 60, 4, 'coin', 'Economy'),
  upgrade('overdrive', 'Overdrive', 'Orbit burst lasts 1.5 seconds longer.', 'rare', 85, 4, 'flame', 'Burst'),
  upgrade('capacitor', 'Burst capacitor', 'Reduce orbit burst cooldown by 2.5 seconds.', 'rare', 90, 4, 'battery', 'Burst'),
  upgrade('afterburner', 'Afterburner', '+0.3× score multiplier during orbit burst.', 'rare', 90, 4, 'rocket', 'Burst'),
  upgrade('event-horizon', 'Event horizon', '+8% points from all scoring sources.', 'rare', 100, 5, 'globe', 'Power'),
  upgrade('resonance', 'Resonance', 'Collisions also award 20% of a ray hit per level.', 'common', 65, 5, 'pulse', 'Collision'),
  upgrade('gravity-well', 'Gravity well', 'Collect rays across a much wider arc; spin 3.5% slower.', 'rare', 80, 4, 'magnet', 'Light'),
  upgrade('double-helix', 'Double helix', 'Every second revolution scores 50% more per level.', 'rare', 95, 4, 'dna', 'Orbit'),
  upgrade('starlight', 'Starlight', 'Collect 1.5 passive points per second, even between rays.', 'common', 65, 5, 'star', 'Idle'),
  upgrade('photon-shower', 'Photon shower', 'Every ray hit drops 1 extra shard per level.', 'common', 60, 5, 'rain', 'Economy'),
  upgrade('comet-tail', 'Comet tail', 'Gain 1.5% spin speed per completed lap this round, up to 20 laps.', 'epic', 125, 3, 'comet', 'Velocity'),
  upgrade('momentum', 'Momentum', 'Gain +2% points per lap this round, up to 15 laps.', 'rare', 100, 3, 'trend', 'Orbit'),
  upgrade('quantum-roll', 'Quantum roll', 'Revolutions gain a 12% critical chance per level.', 'rare', 90, 4, 'dice', 'Luck'),
  upgrade('radiant-bloom', 'Radiant bloom', 'Every fifth ray hit explodes for 35 bonus points per level.', 'epic', 130, 4, 'flower', 'Light'),
  upgrade('slingshot', 'Slingshot', 'Collisions grant +15% spin speed per level for 3 seconds.', 'rare', 85, 4, 'wind', 'Collision'),
  upgrade('nebula-bank', 'Nebula bank', 'Earn 10% interest on held shards after each round; max 100 per level.', 'rare', 95, 4, 'bank', 'Economy'),
  upgrade('prismatic-core', 'Prismatic core', '+10% points and +10% experience from all sources.', 'legendary', 180, 3, 'gem', 'Power'),
]);

const catalogById = new Map(UPGRADE_CATALOG.map((item) => [item.id, item]));
const count = (p, id) => Math.max(0, Math.min(catalogById.get(id)?.maxLevel || 0, p.upgrades[id] || 0));
const wrap = (angle) => ((angle % TAU) + TAU) % TAU;
const distance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const validNumber = (value, fallback) => Number.isFinite(value) ? value : fallback;

export const MOVE_CATALOG = Object.freeze([
  { id: 'photon-strike', name: 'Photon strike', type: 'attack', target: 'rival', icon: 'swords', color: '#ffb873', cost: 35, maxLevel: 5, description: 'Strike one chosen rival. Higher ranks deal more damage.' },
  { id: 'mending-light', name: 'Mending light', type: 'heal', target: 'self', icon: 'sun', color: '#6de9d3', cost: 30, maxLevel: 5, description: 'Restore your own HP. Cannot revive a knocked-out pilot.' },
  { id: 'mirror-veil', name: 'Mirror veil', type: 'reflect', target: 'self', icon: 'prism', color: '#b5a0ff', cost: 40, maxLevel: 5, description: 'Reflect the next hostile move in the next 6 seconds. One bounce only.' },
  { id: 'static-pulse', name: 'Static pulse', type: 'stun', target: 'rival', icon: 'zap', color: '#8be0fa', cost: 40, maxLevel: 5, description: 'Damage and briefly stun one chosen rival, blocking movement and moves.' },
  { id: 'aegis-shell', name: 'Aegis shell', type: 'shield', target: 'self', icon: 'prism', color: '#f8ec9a', cost: 35, maxLevel: 5, description: 'Absorb incoming damage for 8 seconds. Higher ranks add shield HP.' },
].map(Object.freeze));
export const ORB_UPGRADE_CATALOG = Object.freeze([
  { id: 'light-reservoir', name: 'Light reservoir', icon: 'gem', cost: 50, maxLevel: 3, description: '+5 maximum Light Points per rank. Starts at 20 LP.' },
  { id: 'orb-condenser', name: 'Orb condenser', icon: 'sparkles', cost: 55, maxLevel: 3, description: '+1 Light Point from every light orb per rank.' },
].map(Object.freeze));
const movesById = new Map(MOVE_CATALOG.map((move) => [move.id, move]));
const orbUpgradesById = new Map(ORB_UPGRADE_CATALOG.map((item) => [item.id, item]));
const BATTLE_NUMBERS = ['health', 'lightPoints', 'castReadyAt', 'stunUntil', 'reflectUntil', 'shieldHealth', 'barrierUntil', 'knockouts', 'skipTurns'];
const moveLevel = (player, id) => Math.max(0, Math.min(5, Math.floor(player.moves?.[id] || 0)));
const orbLevel = (player, id) => Math.max(0, Math.min(3, Math.floor(player.orbUpgrades?.[id] || 0)));
export const getLightCapacity = (player) => 20 + orbLevel(player, 'light-reservoir') * 5;
export const getLightYield = (player, type) => orbById.get(type)?.light ? orbById.get(type).light + orbLevel(player, 'orb-condenser') : 0;
export const getMoveUnlockRound = (player, id) => movesById.has(id) ? moveLevel(player, id) + 1 : Infinity;
export const getMoveCost = (player, id) => movesById.has(id) ? movesById.get(id).cost + moveLevel(player, id) * 25 : Infinity;
export const getOrbUpgradeCost = (player, id) => orbUpgradesById.has(id) ? orbUpgradesById.get(id).cost + orbLevel(player, id) * 35 : Infinity;
export const getOrbUpgradeUnlockRound = (player, id) => orbUpgradesById.has(id) ? orbLevel(player, id) + 1 : Infinity;

export function getMoveStats(player, id, levelOverride) {
  const move = movesById.get(id);
  if (!move) return null;
  const level = Number.isInteger(levelOverride) ? Math.max(0, Math.min(5, levelOverride)) : moveLevel(player, id);
  const rank = Math.max(1, level);
  const offset = rank - 1;
  return {
    level, target: move.target, cooldown: 2.5,
    lightCost: ({ attack: 3, heal: 4, reflect: 5, stun: 5, shield: 4 })[move.type] + Math.floor(offset / 2),
    maxPP: ({ attack: 8, heal: 4, reflect: 3, stun: 4, shield: 4 })[move.type] + offset,
    power: move.type === 'attack' ? 20 + offset * 6 : move.type === 'heal' ? 24 + offset * 7 : move.type === 'stun' ? 8 + offset * 3 : move.type === 'shield' ? 20 + offset * 10 : 0,
    duration: move.type === 'reflect' ? 6 + offset : move.type === 'stun' ? 1.2 + offset * 0.3 : move.type === 'shield' ? 8 : 0,
  };
}

function initializeBattle(player) {
  if (player.moves) return;
  Object.assign(player, { health: 100, lightPoints: 0, moves: {}, movePP: {}, orbUpgrades: {}, castReadyAt: 0, stunUntil: 0, reflectUntil: 0, shieldHealth: 0, barrierUntil: 0, knockouts: 0, skipTurns: 0 });
}

function restoreBattle(player, clearLight = false) {
  initializeBattle(player);
  player.health = 100;
  player.lightPoints = clearLight ? 0 : Math.min(getLightCapacity(player), player.lightPoints);
  player.castReadyAt = player.stunUntil = player.reflectUntil = player.shieldHealth = player.barrierUntil = player.skipTurns = 0;
  player.movePP = Object.fromEntries(MOVE_CATALOG.filter((move) => moveLevel(player, move.id)).map((move) => [move.id, getMoveStats(player, move.id).maxPP]));
}

function spendBattleChoice(player, cost) {
  if (player.upgradeTokens > 0) player.upgradeTokens--;
  else if (player.credits >= cost) player.credits -= cost;
  else return false;
  player.ready = false;
  return true;
}

function buyMove(state, player, id) {
  const move = movesById.get(id);
  if (!move) return { ok: false, error: 'Choose a move from the battle shop.' };
  const level = moveLevel(player, id);
  if (level >= move.maxLevel) return { ok: false, error: 'That move is already at maximum rank.' };
  if (level + 1 > Math.max(1, state.round + 1)) return { ok: false, error: `Rank ${level + 1} unlocks before heat ${level + 1}.` };
  if (!spendBattleChoice(player, getMoveCost(player, id))) return { ok: false, error: 'Not enough shards for this move.' };
  player.moves[id] = level + 1;
  player.movePP[id] = getMoveStats(player, id).maxPP;
  emit(state, { type: 'purchase', playerId: player.id, text: `${move.name} · rank ${level + 1}` });
  return { ok: true };
}

function buyOrbUpgrade(state, player, id) {
  const item = orbUpgradesById.get(id);
  if (!item) return { ok: false, error: 'Choose an orb upgrade from the battle shop.' };
  const level = orbLevel(player, id);
  if (level >= item.maxLevel) return { ok: false, error: 'That orb upgrade is already at maximum rank.' };
  if (level + 1 > Math.max(1, state.round + 1)) return { ok: false, error: `Rank ${level + 1} unlocks before heat ${level + 1}.` };
  if (!spendBattleChoice(player, getOrbUpgradeCost(player, id))) return { ok: false, error: 'Not enough shards for this orb upgrade.' };
  player.orbUpgrades[id] = level + 1;
  emit(state, { type: 'purchase', playerId: player.id, text: `${item.name} · rank ${level + 1}` });
  return { ok: true };
}

function castMove(state, player, action) {
  const now = state.now;
  const move = movesById.get(action.moveId);
  if (state.gameMode !== 'battle' || state.phase !== 'playing') return { ok: false, error: 'Cast moves during a battle heat.' };
  if (!move || !moveLevel(player, move.id)) return { ok: false, error: 'Buy that move in a buy round first.' };
  if (player.health <= 0) return { ok: false, error: 'You are eliminated until the next heat.' };
  const turnBased = state.combatStyle !== 'no-limits';
  if (turnBased && state.turnPlayerId !== player.id) return { ok: false, error: 'Wait for your turn before casting.' };
  if (player.stunUntil > now || player.frozenUntil > now) return { ok: false, error: 'You cannot cast while stunned or frozen.' };
  if (player.castReadyAt > now) return { ok: false, error: 'Your moves are recharging.' };
  const target = typeof action.targetId === 'string' ? state.players.find((pilot) => pilot.id === action.targetId) : null;
  if (!target || (move.target === 'self' ? target.id !== player.id : target.id === player.id)) return { ok: false, error: move.target === 'self' ? 'Choose yourself for this move.' : 'Choose a rival before every attack.' };
  if (target.health <= 0) return { ok: false, error: 'That pilot is eliminated. Choose another target.' };
  const stats = getMoveStats(player, move.id);
  if (turnBased && (player.movePP[move.id] || 0) <= 0) return { ok: false, error: 'No PP left. Move PP refills in the next buy round.' };
  if (turnBased && player.lightPoints < stats.lightCost) return { ok: false, error: `Collect light orbs: this move needs ${stats.lightCost} LP.` };
  if (move.type === 'heal' && player.health >= 100) return { ok: false, error: 'Your HP is already full.' };
  if (move.type === 'reflect' && player.reflectUntil > now) return { ok: false, error: 'Your mirror veil is already active.' };
  if (move.type === 'shield' && player.barrierUntil > now && player.shieldHealth > 0) return { ok: false, error: 'Your shield is already active.' };
  if (turnBased) {
    player.lightPoints -= stats.lightCost;
    player.movePP[move.id]--;
  }
  player.castReadyAt = now + stats.cooldown * 1000;
  let recipient = target;
  let reflected = false;
  let amount = stats.power;
  let blocked = false;
  if (move.type === 'heal') {
    amount = Math.min(stats.power, 100 - player.health);
    player.health += amount;
  } else if (move.type === 'reflect') {
    player.reflectUntil = now + stats.duration * 1000;
  } else if (move.type === 'shield') {
    player.shieldHealth = stats.power;
    player.barrierUntil = now + stats.duration * 1000;
  } else {
    if (target.reflectUntil > now) {
      target.reflectUntil = 0;
      recipient = player;
      reflected = true;
    }
    blocked = recipient.shieldUntil > now;
    if (blocked) amount = 0;
    else {
      const absorbed = recipient.barrierUntil > now ? Math.min(recipient.shieldHealth, stats.power) : 0;
      recipient.shieldHealth = recipient.barrierUntil > now ? recipient.shieldHealth - absorbed : 0;
      amount = Math.min(stats.power - absorbed, recipient.health);
      recipient.health -= amount;
      if (move.type === 'stun' && !absorbed) {
        recipient.stunUntil = now + Math.round(stats.duration * 1000);
        if (turnBased) recipient.skipTurns = 1;
      }
    }
  }
  emit(state, { type: 'cast', playerId: player.id, otherId: recipient.id, moveId: move.id, amount, ...(reflected ? { reflected: true, reflectedBy: target.id } : {}), ...(blocked ? { blocked: true } : {}), text: `${move.name}${reflected ? ' reflected' : ''}${blocked ? ' blocked by Prism shield' : move.type === 'reflect' ? ' · next attack reflected' : ` · ${amount} ${move.type === 'heal' ? 'HP restored' : move.type === 'shield' ? 'shield HP' : 'damage'}`}` });
  if (recipient.health <= 0) {
    recipient.lightPoints = 0;
    recipient.stunUntil = recipient.reflectUntil = recipient.boostUntil = 0;
    const victor = reflected ? target : player;
    victor.knockouts++;
    victor.score += 150;
    victor.roundScore += 150;
    victor.credits += 20;
    grantXp(state, victor, 20, getStats(victor));
    emit(state, { type: 'knockout', playerId: victor.id, otherId: recipient.id, amount: 150, text: `${victor.name} knocked out ${recipient.name} · +150 points` });
    finishBattleIfWon(state);
  }
  if (turnBased && state.phase === 'playing') advanceBattleTurn(state);
  return { ok: true };
}

function advanceBattleTurn(state, previous = state.players.findIndex((player) => player.id === state.turnPlayerId)) {
  for (let offset = 1; offset <= state.players.length * 2; offset++) {
    const player = state.players[(Math.max(-1, previous) + offset) % state.players.length];
    if (!player || player.health <= 0) continue;
    if (player.skipTurns > 0) { player.skipTurns--; continue; }
    state.turnPlayerId = player.id;
    state.turnEndsAt = state.now + 10000;
    return;
  }
  state.turnPlayerId = null;
  state.turnEndsAt = 0;
}

function random(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function xpForLevel(level) { return 50 + Math.max(1, level) * 25; }

export function getStats(player, now = player.updatedAt || 0) {
  const n = (id) => count(player, id);
  return {
    speed: 1.05 * Math.max(0.3, 1 + n('kinetic-drive') * 0.16 - n('gravity-well') * 0.035 + n('comet-tail') * Math.min(20, player.roundRevolutions || 0) * 0.015) * (player.chipUntil > now ? 1.25 : 1),
    rayPoints: 25 + n('prism-amplifier') * 8,
    lapPoints: 35 + n('lap-reactor') * 15,
    collisionPoints: 30 + n('heavy-orbit') * 12,
    critChance: Math.min(0.8, 0.08 + n('triple-prism') * 0.1 + n('lucky-photon') * 0.04),
    critMultiplier: 3 + n('lucky-photon') * 0.5,
    multiplier: (1 + n('event-horizon') * 0.08 + n('prismatic-core') * 0.1 + n('momentum') * Math.min(15, player.roundRevolutions || 0) * 0.02) * (player.starlightUntil > now ? 1.5 : 1),
    magnet: 0.025 + n('wide-spectrum') * 0.026 + n('gravity-well') * 0.06,
    boostDuration: 4 + n('overdrive') * 1.5,
    boostCooldown: 20 - n('capacitor') * 2.5,
    boostMultiplier: 2 + n('afterburner') * 0.3,
    xpMultiplier: 1 + n('xp-lens') * 0.25 + n('prismatic-core') * 0.1,
    creditMultiplier: 1 + n('gold-rush') * 0.25,
    echoChance: n('phase-echo') * 0.12,
    chainBonus: n('chain-reaction') * 0.08,
    passiveCredits: n('solar-cell') * 0.8,
    passivePoints: n('starlight') * 1.5,
    photonShards: n('photon-shower'),
    doubleHelix: n('double-helix') * 0.5,
    lapCritChance: n('quantum-roll') * 0.12,
    bloomPoints: n('radiant-bloom') * 35,
    resonance: n('resonance') * 0.2,
    slingshot: n('slingshot') * 0.15,
    interest: n('nebula-bank') * 0.1,
  };
}

/** The renderer and host share the complete angular motion calculation. */
export function getPlayerSpeed(player, now = player.updatedAt || 0) {
  if (player.frozenUntil > now || player.stunUntil > now || player.health <= 0) return 0;
  const stats = getStats(player, now);
  return stats.speed * LANE_SPEEDS[player.lane]
    * (player.boostUntil > now ? 1.65 : 1)
    * (player.slingUntil > now ? 1 + stats.slingshot : 1)
    * (player.overdriveUntil > now ? 1.75 : 1)
    * (player.slowUntil > now ? 0.5 : 1);
}

export function getRaySpeedMultiplier(state, now = state.now) {
  return 1 + Math.min(MAX_HASTE_STACKS, (state.fieldEffects || []).filter((effect) => effect.type === 'haste' && effect.expiresAt > now).length) * 0.25;
}

function travelDistance(player, from, to) {
  const boundaries = [from, to, ...['boostUntil', 'slingUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'stunUntil']
    .map((key) => player[key]).filter((at) => at > from && at < to)].sort((a, b) => a - b);
  let distance = 0;
  for (let index = 1; index < boundaries.length; index++) {
    distance += getPlayerSpeed(player, (boundaries[index - 1] + boundaries[index]) / 2) * (boundaries[index] - boundaries[index - 1]) / 1000;
  }
  return distance;
}

export function getPlayerPosition(player) {
  const radius = LANE_RADII[player.lane] ?? LANE_RADII[2];
  return { x: Math.cos(player.angle) * radius, y: Math.sin(player.angle) * radius, angle: player.angle, radius, lane: player.lane };
}

/** Compact repeated catalog/participant IDs at the transport boundary only. */
export function packGameState(state) {
  const pairs = new Map();
  for (let first = 0; first < state.players.length; first++) {
    for (let second = first + 1; second < state.players.length; second++) {
      pairs.set([state.players[first].id, state.players[second].id].sort().join('|'), [first, second]);
    }
  }
  return {
    ...state,
    packed: 1,
    players: state.players.map((player) => {
      const packed = { ...player, upgrades: Object.keys(player.upgrades).length ? UPGRADE_CATALOG.map((item) => player.upgrades[item.id] || 0) : [] };
      if (player.moves) {
        packed.battle = [...BATTLE_NUMBERS.map((key) => player[key]), ...MOVE_CATALOG.map((move) => player.moves[move.id] || 0), ...MOVE_CATALOG.map((move) => Object.hasOwn(player.movePP, move.id) ? player.movePP[move.id] : -1), ...ORB_UPGRADE_CATALOG.map((item) => player.orbUpgrades[item.id] || 0)];
        for (const key of [...BATTLE_NUMBERS, 'moves', 'movePP', 'orbUpgrades']) delete packed[key];
      }
      return packed;
    }),
    collisionCooldowns: Object.entries(state.collisionCooldowns).map(([key, until]) => {
      const indexes = pairs.get(key);
      return indexes ? [...indexes, until] : [key, until];
    }),
    events: state.events.map((event) => {
      const packed = { ...event };
      for (const key of ['playerId', 'otherId', 'reflectedBy']) {
        const index = state.players.findIndex((player) => player.id === event[key]);
        if (index >= 0) packed[key] = index;
      }
      if (event.moveId && movesById.has(event.moveId)) packed.moveId = MOVE_CATALOG.findIndex((move) => move.id === event.moveId);
      return packed;
    }),
    fieldEffects: state.fieldEffects.map((effect) => [effect.type === 'beam' ? 0 : 1, effect.expiresAt]),
  };
}

/** Decode without changing the wire object; raw snapshots remain compatible. */
export function unpackGameState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.packed === undefined) return snapshot;
  if (snapshot.packed !== 1 || !Array.isArray(snapshot.players) || snapshot.players.length > MAX_PLAYERS || !Array.isArray(snapshot.collisionCooldowns) || snapshot.collisionCooldowns.length > MAX_PLAYERS * MAX_PLAYERS) throw new TypeError('Invalid packed orbit state.');
  const { packed, ...state } = snapshot;
  state.players = snapshot.players.map((player) => {
    if (!player || typeof player.id !== 'string' || !Array.isArray(player.upgrades) || player.upgrades.length > UPGRADE_CATALOG.length) throw new TypeError('Invalid packed pilot build.');
    const upgrades = [];
    player.upgrades.forEach((level, index) => {
      if (!Number.isInteger(level) || level < 0 || level > UPGRADE_CATALOG[index].maxLevel) throw new TypeError('Invalid packed upgrade level.');
      if (level) upgrades.push([UPGRADE_CATALOG[index].id, level]);
    });
    const decoded = { ...player, upgrades: Object.fromEntries(upgrades) };
    if (player.battle !== undefined) {
      const expected = BATTLE_NUMBERS.length + MOVE_CATALOG.length * 2 + ORB_UPGRADE_CATALOG.length;
      if (!Array.isArray(player.battle) || player.battle.length !== expected || player.battle.some((value, index) => !Number.isFinite(value) || !Number.isInteger(value) || value < (index >= BATTLE_NUMBERS.length + MOVE_CATALOG.length && index < BATTLE_NUMBERS.length + MOVE_CATALOG.length * 2 ? -1 : 0))) throw new TypeError('Invalid packed battle state.');
      let index = 0;
      for (const key of BATTLE_NUMBERS) decoded[key] = player.battle[index++];
      decoded.moves = {};
      for (const move of MOVE_CATALOG) {
        const rank = player.battle[index++];
        if (rank > move.maxLevel) throw new TypeError('Invalid packed move rank.');
        if (rank) decoded.moves[move.id] = rank;
      }
      decoded.movePP = {};
      for (const move of MOVE_CATALOG) {
        const pp = player.battle[index++];
        if (pp > getMoveStats(decoded, move.id).maxPP) throw new TypeError('Invalid packed move PP.');
        if (pp >= 0) decoded.movePP[move.id] = pp;
      }
      decoded.orbUpgrades = {};
      for (const item of ORB_UPGRADE_CATALOG) {
        const rank = player.battle[index++];
        if (rank > item.maxLevel) throw new TypeError('Invalid packed orb rank.');
        if (rank) decoded.orbUpgrades[item.id] = rank;
      }
      if (decoded.health > 100 || decoded.lightPoints > getLightCapacity(decoded) || decoded.shieldHealth > 60) throw new TypeError('Invalid packed battle resources.');
      delete decoded.battle;
    }
    return decoded;
  });
  state.collisionCooldowns = Object.fromEntries(snapshot.collisionCooldowns.map((pair) => {
    if (!Array.isArray(pair)) throw new TypeError('Invalid packed collision cooldown.');
    if (pair.length === 2 && typeof pair[0] === 'string' && Number.isFinite(pair[1])) return pair;
    if (pair.length !== 3 || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1]) || pair[0] === pair[1] || !state.players[pair[0]] || !state.players[pair[1]] || !Number.isFinite(pair[2])) throw new TypeError('Invalid packed collision pair.');
    return [[state.players[pair[0]].id, state.players[pair[1]].id].sort().join('|'), pair[2]];
  }));
  if (!Array.isArray(snapshot.events) || !Array.isArray(snapshot.fieldEffects)) throw new TypeError('Invalid packed battle events.');
  state.events = snapshot.events.map((event) => {
    const decoded = { ...event };
    for (const key of ['playerId', 'otherId', 'reflectedBy']) if (typeof event[key] === 'number') {
      if (!Number.isInteger(event[key]) || !state.players[event[key]]) throw new TypeError('Invalid packed event pilot.');
      decoded[key] = state.players[event[key]].id;
    }
    if (typeof event.moveId === 'number') {
      if (!Number.isInteger(event.moveId) || !MOVE_CATALOG[event.moveId]) throw new TypeError('Invalid packed event move.');
      decoded.moveId = MOVE_CATALOG[event.moveId].id;
    }
    return decoded;
  });
  state.fieldEffects = snapshot.fieldEffects.map((effect) => {
    if (!Array.isArray(effect)) return { ...effect };
    if (effect.length !== 2 || ![0, 1].includes(effect[0]) || !Number.isFinite(effect[1])) throw new TypeError('Invalid packed field effect.');
    return { type: effect[0] === 0 ? 'beam' : 'haste', expiresAt: effect[1] };
  });
  return state;
}

export function createGame({ seed = Date.now(), now = Date.now(), roundDuration = 60, shopDuration = 30 } = {}) {
  const normalizedSeed = validNumber(Number(seed), 1) >>> 0;
  return {
    version: 1, seed: normalizedSeed, rng: normalizedSeed, gameMode: 'orbit', combatStyle: 'turn-based', phase: 'lobby', round: 0,
    phaseEndsAt: 0, roundDuration: Math.max(1, validNumber(roundDuration, 60)),
    shopDuration: Math.max(1, validNumber(shopDuration, 30)), now,
    players: [], rays: [
      { angle: 0, color: '#70e7e3', speed: -0.25, width: 0.025 },
      { angle: 2.1, color: '#b79cff', speed: 0.35, width: 0.025 },
      { angle: 4.2, color: '#ffc785', speed: -0.14, width: 0.025 },
    ], collisionCooldowns: {}, eventSeq: 0, events: [], lastResults: [],
    pickups: [], pickupSeq: 0, nextPickupAt: 0, orbDeck: [], fieldEffects: [], baseRayCount: 3,
    surge: { active: false, endsAt: 0, nextAt: 0, index: 0 },
  };
}

function emit(state, event) {
  const next = { id: ++state.eventSeq, at: state.now, ...event };
  // At 50 rays a single step can emit hundreds of score events. Keep the newest
  // level per pilot and preserve celebrations/round changes for the UI snapshot.
  if (event.type === 'levelup') {
    const previous = state.events.findIndex((item) => item.type === 'levelup' && item.playerId === event.playerId);
    if (previous >= 0) state.events.splice(previous, 1);
  }
  state.events.push(next);
  if (state.events.length > 12) {
    const disposable = state.events.findIndex((item) => state.now - item.at >= 1500 || !IMPORTANT_EVENTS.has(item.type));
    state.events.splice(disposable < 0 ? 0 : disposable, 1);
  }
  return next;
}

export function addPlayer(state, { id, name = 'Pilot', color, avatarUrl = null, bot = false }) {
  if (id === null || id === undefined) return null;
  id = String(id);
  if (!id || id.length > 100) return null;
  const existing = state.players.find((player) => player.id === id);
  if (existing) return existing;
  if (state.players.length >= MAX_PLAYERS) return null;
  const player = {
    id, name: String(name).slice(0, 32), color: color || PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl.slice(0, 400) : null, bot: !!bot,
    score: 0, roundScore: 0, level: 1, xp: 0, credits: 60, upgrades: {},
    angle: random(state) * TAU, orbitProgress: 0, lane: state.players.length % LANE_COUNT,
    hits: 0, collisions: 0, revolutions: 0, roundHits: 0, roundCollisions: 0, roundRevolutions: 0,
    ready: false, shopOffers: [], upgradeTokens: 0, rerollCost: 35,
    boostUntil: 0, boostReadyAt: 0, slingUntil: 0, lastRayAt: 0, chain: 0,
    rayCooldowns: '', passivePointCarry: 0, passiveCreditCarry: 0,
    nextDecisionAt: state.now + 2000 + random(state) * 4000,
    updatedAt: state.now, starlightUntil: 0, chipUntil: 0,
    slowUntil: 0, frozenUntil: 0, overdriveUntil: 0, echoUntil: 0, shieldUntil: 0, gravityUntil: 0, nextGravityAt: 0,
    voiceIntensity: 0, voiceUntil: 0, lastVoiceAt: -1000, voiceCarry: 0, voiceEventAt: 0,
  };
  state.players.push(player);
  if (state.gameMode === 'battle') initializeBattle(player);
  if (state.phase === 'shop') player.shopOffers = rollOffers(state, player);
  return player;
}

export function removePlayer(state, id) {
  const index = state.players.findIndex((player) => player.id === String(id));
  if (index < 0) return false;
  state.players.splice(index, 1);
  for (const key of Object.keys(state.collisionCooldowns)) {
    if (key.split('|').includes(String(id))) delete state.collisionCooldowns[key];
  }
  finishBattleIfWon(state);
  if (state.gameMode === 'battle' && state.phase === 'playing' && state.combatStyle !== 'no-limits' && state.turnPlayerId === String(id)) advanceBattleTurn(state, index - 1);
  return true;
}

function rollOffers(state, player, excluded = []) {
  const available = UPGRADE_CATALOG.filter((item) => count(player, item.id) < item.maxLevel && !excluded.includes(item.id));
  const offers = [];
  while (offers.length < 3 && available.length) {
    const weight = (item) => ({ common: 5, rare: 3, epic: 1.5, legendary: 0.65 })[item.rarity];
    const total = available.reduce((sum, item) => sum + weight(item), 0);
    let target = random(state) * total;
    let index = 0;
    for (; index < available.length - 1; index++) {
      target -= weight(available[index]);
      if (target <= 0) break;
    }
    offers.push(available[index].id);
    available.splice(index, 1);
  }
  return offers;
}

export function getUpgradeCost(player, upgradeId) {
  const item = catalogById.get(upgradeId);
  return item ? Math.round(item.cost * (1 + count(player, upgradeId) * 0.35)) : Infinity;
}

function grantXp(state, player, amount, stats) {
  player.xp += Math.round(amount * stats.xpMultiplier);
  while (player.xp >= xpForLevel(player.level)) {
    player.xp -= xpForLevel(player.level);
    player.level += 1;
    player.upgradeTokens += 1;
    emit(state, { type: 'levelup', playerId: player.id, amount: player.level, text: `Level ${player.level} · free upgrade earned` });
  }
}

function award(state, player, { type, base, xp = 0, credits = 0, critical = false, otherId, extraMultiplier = 1 }, stats = getStats(player)) {
  const boostMultiplier = player.boostUntil > state.now ? stats.boostMultiplier : 1;
  const amount = Math.max(0, Math.round(base * stats.multiplier * boostMultiplier * extraMultiplier * (critical ? stats.critMultiplier : 1)));
  player.score += amount;
  player.roundScore += amount;
  player.credits += Math.round(credits * stats.creditMultiplier);
  grantXp(state, player, xp, stats);
  emit(state, { type, playerId: player.id, amount, ...(critical ? { critical: true } : {}), ...(otherId ? { otherId } : {}) });
}

export function startRound(state, now = state.now) {
  if (!state.players.length || state.phase === 'playing') return false;
  if (state.phase === 'lobby') state.baseRayCount = state.rays.length;
  state.now = now;
  state.phase = 'playing';
  state.round += 1;
  state.phaseEndsAt = now + state.roundDuration * 1000;
  state.collisionCooldowns = {};
  state.pickups = [];
  state.orbDeck = [];
  state.fieldEffects = [];
  state.rays.length = Math.min(state.rays.length, state.baseRayCount);
  state.nextPickupAt = now + ORB_INTERVAL;
  state.surge = { active: false, endsAt: 0, nextAt: now + 15000, index: 0 };
  if (state.gameMode === 'battle') {
    state.battleWinnerId = null;
    state.battleEntrants = state.players.length;
    state.battlePreparation = false;
  }
  for (const player of state.players) {
    if (state.gameMode === 'battle') restoreBattle(player);
    player.roundScore = 0;
    player.roundHits = 0;
    player.roundCollisions = 0;
    player.roundRevolutions = 0;
    player.orbitProgress = 0;
    player.ready = false;
    player.boostUntil = 0;
    player.boostReadyAt = 0;
    player.rayCooldowns = '';
    player.chain = 0;
    player.lastRayAt = 0;
    player.slingUntil = 0;
    player.updatedAt = now;
    player.starlightUntil = 0;
    player.chipUntil = 0;
    for (const key of ['slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt']) player[key] = 0;
    player.voiceIntensity = 0;
    player.voiceUntil = 0;
    player.lastVoiceAt = -1000;
    player.voiceCarry = 0;
    player.voiceEventAt = now;
    player.nextDecisionAt = now + 1500 + random(state) * 3500;
  }
  if (state.gameMode === 'battle') {
    state.turnPlayerId = null;
    state.turnEndsAt = 0;
    if (state.combatStyle !== 'no-limits') advanceBattleTurn(state);
  }
  emit(state, { type: 'round-start', amount: state.round, text: `Round ${state.round} · catch the light` });
  return true;
}

function openShop(state, now, preparation = false) {
  if (state.gameMode === 'battle') {
    state.battlePreparation = preparation;
    state.turnPlayerId = null;
    state.turnEndsAt = 0;
  }
  state.phase = 'shop';
  state.pickups = [];
  state.fieldEffects = [];
  state.rays.length = Math.min(state.rays.length, state.baseRayCount);
  state.surge.active = false;
  state.phaseEndsAt = now + state.shopDuration * 1000;
  state.lastResults = preparation ? [] : [...state.players].sort((a, b) => state.gameMode === 'battle' ? Number(b.id === state.battleWinnerId) - Number(a.id === state.battleWinnerId) || b.health - a.health || b.roundScore - a.roundScore : b.roundScore - a.roundScore).map((p) => ({ id: p.id, name: p.name, score: p.roundScore, ...(state.gameMode === 'battle' ? { health: p.health, knockouts: p.knockouts } : {}) }));
  for (const player of state.players) {
    if (state.gameMode === 'battle') {
      // Keep elimination and final HP visible throughout the buy round. Revive
      // only when the next heat launches; buying refills every owned move's PP.
      player.castReadyAt = player.stunUntil = player.reflectUntil = player.shieldHealth = player.barrierUntil = player.skipTurns = 0;
      player.movePP = Object.fromEntries(MOVE_CATALOG.filter((move) => moveLevel(player, move.id)).map((move) => [move.id, getMoveStats(player, move.id).maxPP]));
    }
    player.boostUntil = 0;
    for (const key of ['starlightUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt']) player[key] = 0;
    player.voiceIntensity = 0;
    player.voiceUntil = 0;
    player.ready = false;
    player.rerollCost = 35;
    player.shopOffers = rollOffers(state, player);
    const stats = getStats(player);
    const interest = Math.min(100 * count(player, 'nebula-bank'), Math.floor(player.credits * stats.interest));
    player.credits += preparation ? 0 : interest + 35;
    if (interest && !preparation) emit(state, { type: 'interest', playerId: player.id, amount: interest });
    if (player.bot) {
      if (state.gameMode === 'battle') {
        for (const move of MOVE_CATALOG) {
          if (!moveLevel(player, move.id) && (player.upgradeTokens || getMoveCost(player, move.id) <= player.credits)) buyMove(state, player, move.id);
        }
        const nextMove = MOVE_CATALOG.find((move) => moveLevel(player, move.id) < Math.min(5, state.round + 1) && (player.upgradeTokens || getMoveCost(player, move.id) <= player.credits));
        if (nextMove) buyMove(state, player, nextMove.id);
        const orbUpgrade = ORB_UPGRADE_CATALOG.find((item) => orbLevel(player, item.id) < Math.min(3, state.round + 1) && (player.upgradeTokens || getOrbUpgradeCost(player, item.id) <= player.credits));
        if (orbUpgrade) buyOrbUpgrade(state, player, orbUpgrade.id);
      }
      for (let index = 0; index < 3; index++) {
        const offer = player.shopOffers.find((id) => player.upgradeTokens || getUpgradeCost(player, id) <= player.credits);
        if (!offer) break;
        purchase(state, player, offer);
      }
      player.ready = true;
    }
  }
  emit(state, { type: preparation ? 'battle-prep' : 'round-end', amount: state.round, text: preparation ? 'Battle preparation · buy your first moves' : 'Round complete · upgrade your orbit' });
}

function finishBattleIfWon(state) {
  if (state.gameMode !== 'battle' || state.phase !== 'playing' || state.battleEntrants < 2) return false;
  const survivors = state.players.filter((player) => player.health > 0);
  if (survivors.length > 1) return false;
  state.battleWinnerId = survivors[0]?.id || null;
  emit(state, { type: 'winner', playerId: state.battleWinnerId, text: survivors.length ? 'Winner winner chicken dinner!' : 'All pilots eliminated.' });
  openShop(state, state.now);
  return true;
}

function purchase(state, player, upgradeId) {
  const item = catalogById.get(upgradeId);
  if (!item || !player.shopOffers.includes(upgradeId)) return { ok: false, error: 'Choose an upgrade from your current offers.' };
  if (count(player, upgradeId) >= item.maxLevel) return { ok: false, error: 'That upgrade is already at its maximum level.' };
  const cost = getUpgradeCost(player, upgradeId);
  if (player.upgradeTokens > 0) player.upgradeTokens -= 1;
  else if (player.credits >= cost) player.credits -= cost;
  else return { ok: false, error: 'Not enough shards for this upgrade.' };
  player.upgrades[upgradeId] = count(player, upgradeId) + 1;
  player.ready = false;
  const slot = player.shopOffers.indexOf(upgradeId);
  player.shopOffers.splice(slot, 1);
  const replacements = rollOffers(state, player, player.shopOffers);
  if (replacements.length) player.shopOffers.splice(slot, 0, replacements[0]);
  emit(state, { type: 'purchase', playerId: player.id, text: `${item.name} +${player.upgrades[upgradeId]}` });
  return { ok: true };
}

function extendEffect(player, key, now, duration, maximum = 18000) {
  player[key] = Math.min(now + maximum, Math.max(now, player[key] || 0) + duration);
}

function syncFieldRays(state) {
  const count = Math.min(MAX_RAYS, state.baseRayCount + state.fieldEffects.filter((effect) => effect.type === 'beam').length * 5);
  if (state.rays.length > count) state.rays.length = count;
  while (state.rays.length < count) {
    const index = state.rays.length;
    // Extra rays derive their palette by index in the renderer; omitting repeated
    // colors and widths leaves room for 50 rays in activity relay snapshots.
    state.rays.push({ angle: Math.round(random(state) * TAU * 100000) / 100000, speed: [-0.25, 0.35, -0.14][index % 3] });
  }
}

function addFieldEffect(state, type, now) {
  const cap = type === 'beam' ? MAX_BEAM_STACKS : MAX_HASTE_STACKS;
  const matching = state.fieldEffects.filter((effect) => effect.type === type);
  if (matching.length >= cap) state.fieldEffects.splice(state.fieldEffects.indexOf(matching.reduce((oldest, effect) => effect.expiresAt < oldest.expiresAt ? effect : oldest)), 1);
  state.fieldEffects.push({ type, expiresAt: now + FIELD_DURATION });
  syncFieldRays(state);
}

function collectOrb(state, player, pickup) {
  const orb = orbById.get(pickup.type);
  if (!orb) return;
  const now = state.now;
  player.score += orb.points;
  player.roundScore += orb.points;
  if (state.gameMode === 'battle' && orb.light) player.lightPoints = Math.min(getLightCapacity(player), player.lightPoints + getLightYield(player, pickup.type));
  if (pickup.type === 'star') extendEffect(player, 'starlightUntil', now, 6000);
  if (pickup.type === 'chip') { extendEffect(player, 'chipUntil', now, 6000); player.credits += 25; }
  if (pickup.type === 'beam' || pickup.type === 'haste') addFieldEffect(state, pickup.type, now);
  if (pickup.type === 'overdrive') extendEffect(player, 'overdriveUntil', now, 6000);
  if (pickup.type === 'echo') extendEffect(player, 'echoUntil', now, 6000);
  if (pickup.type === 'shield') {
    extendEffect(player, 'shieldUntil', now, 8000);
    player.slowUntil = player.frozenUntil = player.gravityUntil = player.nextGravityAt = 0;
  }
  if (['ice', 'clock', 'blackhole'].includes(pickup.type)) {
    for (const rival of state.players) {
      if (rival.id === player.id || rival.shieldUntil > now || rival.health <= 0) continue;
      if (pickup.type === 'ice') extendEffect(rival, 'slowUntil', now, 4000, 8000);
      if (pickup.type === 'clock') extendEffect(rival, 'frozenUntil', now, 2000, 4000);
      if (pickup.type === 'blackhole') {
        if (!(rival.gravityUntil > now) || !(rival.nextGravityAt > now)) rival.nextGravityAt = now + 750;
        extendEffect(rival, 'gravityUntil', now, 6000, 12000);
      }
    }
  }
  emit(state, { type: 'collect', playerId: player.id, pickupType: pickup.type, amount: orb.points, text: `${orb.name} · +${orb.points} points · ${orb.description}` });
}

function nextOrbType(state) {
  // Alternating fuel/effect cards guarantee at least half of battle drops are
  // usable Light Points, including the very first pickup of every heat.
  if (state.gameMode === 'battle' && state.pickupSeq % 2 === 1) {
    return ['light', 'light-surge', 'light', 'light-nova'][Math.floor((state.pickupSeq - 1) / 2) % 4];
  }
  if (!state.orbDeck.length) {
    // A seeded deck guarantees every effect appears, while repeated prism/rush
    // cards make stacking possible without making hostile orbs overwhelming.
    state.orbDeck = [...orbById.keys(), 'beam', 'beam', 'beam', 'haste', 'haste'];
    for (let index = state.orbDeck.length - 1; index > 0; index--) {
      const other = Math.floor(random(state) * (index + 1));
      [state.orbDeck[index], state.orbDeck[other]] = [state.orbDeck[other], state.orbDeck[index]];
    }
  }
  return state.orbDeck.pop();
}

function rayCooldownReady(state, player, index, now) {
  const start = state.phaseEndsAt - state.roundDuration * 1000;
  const width = Math.max(1, Math.ceil(Math.log(Math.ceil(state.roundDuration * 100) + 91) / Math.log(36)));
  const cooldowns = typeof player.rayCooldowns === 'string' ? player.rayCooldowns : '';
  const expires = parseInt(cooldowns.slice(index * width, (index + 1) * width), 36) || 0;
  return { ready: expires <= (now - start) / 10, start, width, cooldowns };
}

function recordRayHit(player, index, now, { start, width, cooldowns }) {
  const offset = index * width;
  const encoded = Math.ceil((now - start + 900) / 10).toString(36).padStart(width, '0');
  const padded = cooldowns.padEnd(offset + width, '0');
  // Fixed-width relative timestamps keep 50-ray activity snapshots compact.
  player.rayCooldowns = padded.slice(0, offset) + encoded + padded.slice(offset + width);
}

export function applyAction(state, playerId, action, now = state.now) {
  const player = state.players.find((p) => p.id === String(playerId));
  if (!player) return { ok: false, error: 'Join the orbit before taking an action.' };
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return { ok: false, error: 'Invalid action.' };
  if (action.round !== undefined && (!Number.isInteger(action.round) || action.round !== state.round)) return { ok: false, error: 'That action belongs to an earlier round. Try again.' };
  state.now = now;
  player.updatedAt = now;
  if (state.phase === 'playing' && now >= state.phaseEndsAt && ['boost', 'lane', 'collect', 'voice', 'cast', 'pass-turn'].includes(action.type)) {
    return { ok: false, error: 'This round has ended. The upgrade shop is opening.' };
  }
  if (state.gameMode === 'battle' && state.phase === 'playing' && state.combatStyle !== 'no-limits' && ['cast', 'pass-turn'].includes(action.type) && now >= state.turnEndsAt) {
    const expiredPlayerId = state.turnPlayerId;
    advanceBattleTurn(state);
    if (player.id === expiredPlayerId) return { ok: false, error: 'Your turn has expired. Wait for your next turn.' };
  }
  if (state.gameMode === 'battle' && state.phase === 'playing' && player.health <= 0 && ['boost', 'lane', 'collect', 'voice', 'cast', 'pass-turn'].includes(action.type)) return { ok: false, error: 'You are eliminated until the next heat.' };
  switch (action.type) {
    case 'mode':
      if (state.phase !== 'lobby') return { ok: false, error: 'Choose a mode in the lobby.' };
      if (!['orbit', 'battle'].includes(action.mode)) return { ok: false, error: 'Choose orbit or battle.' };
      state.gameMode = action.mode;
      for (const pilot of state.players) {
        if (action.mode === 'battle') restoreBattle(pilot, true);
        else if (pilot.moves) restoreBattle(pilot, true);
      }
      return { ok: true };
    case 'combat-style':
      if (state.phase !== 'lobby') return { ok: false, error: 'Choose battle rules in the lobby.' };
      if (!['turn-based', 'no-limits'].includes(action.style)) return { ok: false, error: 'Choose turn based or no limits.' };
      state.combatStyle = action.style;
      return { ok: true };
    case 'pass-turn':
      if (state.gameMode !== 'battle' || state.phase !== 'playing' || state.combatStyle === 'no-limits' || state.turnPlayerId !== player.id) return { ok: false, error: 'You can pass only your own battle turn.' };
      advanceBattleTurn(state);
      return { ok: true };
    case 'lobby':
      state.phase = 'lobby';
      state.phaseEndsAt = 0;
      state.pickups = [];
      state.fieldEffects = [];
      state.orbDeck = [];
      state.rays.length = Math.min(state.rays.length, state.baseRayCount);
      state.collisionCooldowns = {};
      state.surge = { active: false, endsAt: 0, nextAt: 0, index: 0 };
      if (state.gameMode === 'battle') state.battleWinnerId = null;
      state.turnPlayerId = null;
      state.turnEndsAt = 0;
      for (const pilot of state.players) {
        pilot.ready = false;
        pilot.shopOffers = [];
        for (const key of ['boostUntil', 'boostReadyAt', 'slingUntil', 'starlightUntil', 'chipUntil', 'slowUntil', 'frozenUntil', 'overdriveUntil', 'echoUntil', 'shieldUntil', 'gravityUntil', 'nextGravityAt', 'voiceUntil', 'voiceIntensity', 'voiceCarry']) pilot[key] = 0;
        if (pilot.moves) restoreBattle(pilot, true);
      }
      emit(state, { type: 'lobby', text: 'Back in the lobby. Your build and scores are saved.' });
      return { ok: true };
    case 'start':
      if (state.phase !== 'lobby') return { ok: false, error: 'A run is already in progress.' };
      if (state.gameMode === 'battle') {
        openShop(state, now, true);
        return { ok: true };
      }
      return { ok: startRound(state, now) };
    case 'lane':
      if (state.phase !== 'playing' && state.phase !== 'lobby') return { ok: false, error: 'Choose your lane during a round.' };
      if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane >= LANE_COUNT) return { ok: false, error: 'Choose a valid orbit lane.' };
      if (state.phase === 'playing' && player.frozenUntil > now) return { ok: false, error: 'Time stop! Lane changes return when the freeze ends.' };
      if (state.phase === 'playing' && player.stunUntil > now) return { ok: false, error: 'Stunned! Lane changes return when the stun ends.' };
      player.lane = action.lane;
      return { ok: true };
    case 'boost': {
      if (state.phase !== 'playing') return { ok: false, error: 'Orbit burst is available during a round.' };
      if (player.frozenUntil > now) return { ok: false, error: 'Time stop! Burst is available when the freeze ends.' };
      if (player.stunUntil > now) return { ok: false, error: 'Stunned! Burst is available when the stun ends.' };
      if (now < player.boostReadyAt) return { ok: false, error: 'Orbit burst is recharging.' };
      const stats = getStats(player);
      player.boostUntil = now + stats.boostDuration * 1000;
      player.boostReadyAt = now + stats.boostCooldown * 1000;
      emit(state, { type: 'boost', playerId: player.id, text: 'Orbit burst · speed +65% & double points' });
      return { ok: true };
    }
    case 'collect': return { ok: false, error: 'Move your pilot into an orb on its ring to collect it.' };
    case 'voice': {
      if (state.phase !== 'playing' || !state.surge.active) return { ok: false, error: 'Your microphone scores during Solar Surge.' };
      if (!Number.isFinite(action.intensity)) return { ok: false, error: 'Invalid microphone level.' };
      if (now - player.lastVoiceAt < 200) return { ok: false, error: 'Microphone samples are limited to five per second.' };
      player.lastVoiceAt = now;
      player.voiceIntensity = Math.max(0, Math.min(1, action.intensity));
      player.voiceUntil = now + 500;
      return { ok: true };
    }
    case 'buy':
      if (state.phase !== 'shop') return { ok: false, error: 'Upgrades open between rounds.' };
      return purchase(state, player, action.upgradeId);
    case 'buy-move':
      if (state.gameMode !== 'battle' || state.phase !== 'shop') return { ok: false, error: 'Buy moves during a battle buy round.' };
      return buyMove(state, player, action.moveId);
    case 'buy-orb':
      if (state.gameMode !== 'battle' || state.phase !== 'shop') return { ok: false, error: 'Buy orb upgrades during a battle buy round.' };
      return buyOrbUpgrade(state, player, action.upgradeId);
    case 'cast': return castMove(state, player, action);
    case 'reroll':
      if (state.phase !== 'shop') return { ok: false, error: 'Reroll offers between rounds.' };
      if (player.credits < player.rerollCost) return { ok: false, error: 'Not enough shards to reroll.' };
      player.credits -= player.rerollCost;
      player.rerollCost += 15;
      player.shopOffers = rollOffers(state, player);
      player.ready = false;
      return { ok: true };
    case 'ready':
      if (state.phase !== 'shop') return { ok: false, error: 'Ready up between rounds.' };
      player.ready = action.ready !== false;
      return { ok: true };
    case 'reset': {
      const players = state.players.map(({ id, name, color, avatarUrl, bot }) => ({ id, name, color, avatarUrl, bot }));
      const fresh = createGame({ seed: state.seed + 1, now, roundDuration: state.roundDuration, shopDuration: state.shopDuration });
      fresh.gameMode = state.gameMode || 'orbit';
      fresh.combatStyle = state.combatStyle || 'turn-based';
      // Keep event IDs monotonic so existing views can see the reset event.
      fresh.eventSeq = state.eventSeq;
      for (const key of Object.keys(state)) if (!Object.hasOwn(fresh, key)) delete state[key];
      Object.assign(state, fresh);
      for (const person of players) addPlayer(state, person);
      emit(state, { type: 'reset', text: 'Fresh run · a new orbit awaits' });
      return { ok: true };
    }
    default: return { ok: false, error: 'Unknown action.' };
  }
}

export function tickGame(state, dt, now = state.now + dt * 1000) {
  const seqBefore = state.eventSeq;
  const seconds = Math.max(0, Math.min(0.25, validNumber(dt, 0)));
  state.now = validNumber(now, state.now);
  if (state.phase === 'shop') {
    const humans = state.players.filter((p) => !p.bot);
    if (state.now >= state.phaseEndsAt || (humans.length > 0 && humans.every((p) => p.ready))) startRound(state, state.now);
    return state.events.filter((event) => event.id > seqBefore);
  }
  if (state.phase !== 'playing') return [];
  if (finishBattleIfWon(state)) return state.events.filter((event) => event.id > seqBefore);
  if (state.gameMode === 'battle' && state.combatStyle !== 'no-limits' && state.now >= state.turnEndsAt) advanceBattleTurn(state);
  const simulationDt = Math.max(0, Math.min(seconds, (state.phaseEndsAt - (state.now - seconds * 1000)) / 1000));
  const stepEnd = Math.min(state.now, state.phaseEndsAt);
  const stepStart = stepEnd - simulationDt * 1000;
  const roundStart = state.phaseEndsAt - state.roundDuration * 1000;
  const surgeWasActive = state.surge.active;
  const previousSurgeIndex = state.surge.index;
  state.surge.index = Math.max(0, Math.floor((Math.min(state.now, state.phaseEndsAt - 1) - roundStart - 15000) / 25000) + 1);
  state.surge.nextAt = roundStart + 15000 + state.surge.index * 25000;
  state.surge.endsAt = state.surge.index ? roundStart + 15000 + (state.surge.index - 1) * 25000 + 8000 : 0;
  state.surge.active = state.surge.index > 0 && state.now < state.surge.endsAt && state.now < state.phaseEndsAt;
  if (state.surge.active && state.surge.index > previousSurgeIndex) emit(state, { type: 'surge-start', text: 'Solar Surge · turn sound into starlight' });
  state.fieldEffects = state.fieldEffects.filter((effect) => effect.expiresAt > stepStart);
  syncFieldRays(state);
  const rayBoundaries = [stepStart, stepEnd, ...state.fieldEffects.filter((effect) => effect.type === 'haste' && effect.expiresAt > stepStart && effect.expiresAt < stepEnd).map((effect) => effect.expiresAt)].sort((a, b) => a - b);
  let raySeconds = 0;
  for (let index = 1; index < rayBoundaries.length; index++) raySeconds += getRaySpeedMultiplier(state, (rayBoundaries[index - 1] + rayBoundaries[index]) / 2) * (rayBoundaries[index] - rayBoundaries[index - 1]) / 1000;
  const oldRays = state.rays.map((ray) => ray.angle);
  for (const ray of state.rays) ray.angle = Math.round(wrap(ray.angle + ray.speed * raySeconds) * 100000) / 100000;
  const oldAngles = new Map();
  const advances = new Map();
  for (const player of state.players) {
    player.updatedAt = state.now;
    oldAngles.set(player.id, player.angle);
    advances.set(player.id, 0);
    if (state.gameMode === 'battle' && player.health <= 0) continue;
    if (player.barrierUntil <= state.now && player.shieldHealth) player.shieldHealth = 0;
    const stats = getStats(player);
    const voiceWindow = roundStart + 15000 + Math.max(0, Math.floor((stepEnd - roundStart - 15000) / 25000)) * 25000;
    const voiceSeconds = Math.max(0, Math.min(stepEnd, voiceWindow + 8000, player.voiceUntil) - Math.max(stepStart, voiceWindow, player.lastVoiceAt)) / 1000;
    player.voiceCarry += Math.max(0, Math.min(1, player.voiceIntensity)) * 100 * voiceSeconds;
    if ((state.surge.active && state.now - player.voiceEventAt >= 1000) || (surgeWasActive && !state.surge.active) || state.now >= state.phaseEndsAt) {
      const voicePoints = Math.floor(player.voiceCarry + 1e-9);
      player.voiceCarry -= voicePoints;
      player.voiceEventAt = state.now;
      if (voicePoints > 0) {
        player.score += voicePoints;
        player.roundScore += voicePoints;
        emit(state, { type: 'surge', playerId: player.id, amount: voicePoints });
      }
    }
    if (player.gravityUntil > stepStart && player.nextGravityAt <= stepEnd && player.frozenUntil <= stepStart && !(player.stunUntil > stepStart)) {
      const lastPullAt = Math.min(stepEnd, player.gravityUntil - 1);
      if (player.nextGravityAt <= lastPullAt) {
        const pulls = Math.floor((lastPullAt - player.nextGravityAt) / 750) + 1;
        player.lane = Math.max(0, player.lane - pulls);
        player.nextGravityAt += pulls * 750;
      }
    }
    if (player.bot && state.now >= player.nextDecisionAt && player.frozenUntil <= stepStart && !(player.stunUntil > stepStart)) {
      if (state.now >= player.boostReadyAt && random(state) < 0.7) applyAction(state, player.id, { type: 'boost' }, state.now);
      // Bots pursue a nearby orb often enough to demonstrate ring play.
      const target = state.pickups.filter((pickup) => pickup.expiresAt > state.now).sort((a, b) => (state.gameMode === 'battle' ? Number(!!orbById.get(b.type)?.light) - Number(!!orbById.get(a.type)?.light) : 0) || wrap(a.angle - player.angle) - wrap(b.angle - player.angle))[0];
      player.lane = target && random(state) < 0.7 ? target.lane : Math.floor(random(state) * LANE_COUNT);
      player.nextDecisionAt = state.now + (state.gameMode === 'battle' ? 1000 + random(state) * 1500 : 3000 + random(state) * 4000);
    }
    const advance = travelDistance(player, stepStart, stepEnd);
    oldAngles.set(player.id, player.angle);
    advances.set(player.id, advance);
    if (advance > 0) player.angle = wrap(player.angle + advance);
    player.orbitProgress += advance;
    while (player.orbitProgress >= TAU) {
      player.orbitProgress -= TAU;
      player.revolutions += 1;
      player.roundRevolutions += 1;
      award(state, player, { type: 'revolution', base: stats.lapPoints, xp: 14, credits: 5,
        critical: random(state) < stats.lapCritChance,
        extraMultiplier: player.roundRevolutions % 2 === 0 ? 1 + stats.doubleHelix : 1 }, stats);
    }
    for (let index = 0; index < state.rays.length; index++) {
      const ray = state.rays[index];
      const oldRelative = wrap(oldAngles.get(player.id) - oldRays[index]);
      const relativeAdvance = advance - ray.speed * raySeconds;
      const crosses = relativeAdvance >= 0 ? oldRelative + relativeAdvance >= TAU : oldRelative + relativeAdvance <= 0;
      const touches = distance(player.angle, ray.angle) < stats.magnet + (ray.width ?? 0.025);
      const cooldown = rayCooldownReady(state, player, index, state.now);
      if ((crosses || touches) && simulationDt > 0 && cooldown.ready) {
        recordRayHit(player, index, state.now, cooldown);
        player.hits += 1;
        player.roundHits += 1;
        player.chain = state.now - player.lastRayAt < 6000 ? Math.min(5, player.chain + 1) : 1;
        player.lastRayAt = state.now;
        const critical = random(state) < stats.critChance;
        const chainMultiplier = 1 + (player.chain - 1) * stats.chainBonus;
        award(state, player, { type: 'ray', base: stats.rayPoints, xp: 8, credits: 3 + stats.photonShards,
          critical, extraMultiplier: chainMultiplier }, stats);
        if (player.echoUntil > state.now) award(state, player, { type: 'echo', base: stats.rayPoints, critical, extraMultiplier: chainMultiplier }, stats);
        if (random(state) < stats.echoChance) award(state, player, { type: 'echo', base: stats.rayPoints * 0.5 }, stats);
        if (stats.bloomPoints && player.roundHits % 5 === 0) award(state, player, { type: 'bloom', base: stats.bloomPoints }, stats);
      }
    }
    player.passivePointCarry += stats.passivePoints * simulationDt;
    if (player.passivePointCarry >= 1 - 1e-9) {
      const amount = Math.floor(player.passivePointCarry + 1e-9);
      player.passivePointCarry -= amount;
      // Passive points are aggregated without events to keep activity snapshots small.
      const points = Math.round(amount * stats.multiplier * (player.boostUntil > state.now ? stats.boostMultiplier : 1));
      player.score += points;
      player.roundScore += points;
    }
    player.passiveCreditCarry += stats.passiveCredits * simulationDt;
    if (player.passiveCreditCarry >= 1 - 1e-9) {
      const amount = Math.floor(player.passiveCreditCarry + 1e-9);
      player.passiveCreditCarry -= amount;
      player.credits += amount;
    }
  }
  for (let a = 0; a < state.players.length; a++) {
    for (let b = a + 1; b < state.players.length; b++) {
      const first = state.players[a];
      const second = state.players[b];
      if (state.gameMode === 'battle' && (first.health <= 0 || second.health <= 0)) continue;
      if (first.lane !== second.lane) continue;
      const key = [first.id, second.id].sort().join('|');
      if ((state.collisionCooldowns[key] || 0) > state.now) continue;
      const oldRelative = wrap(oldAngles.get(first.id) - oldAngles.get(second.id));
      const relativeAdvance = advances.get(first.id) - advances.get(second.id);
      const crossed = relativeAdvance > 0 ? oldRelative + relativeAdvance >= TAU : relativeAdvance < 0 && oldRelative + relativeAdvance <= 0;
      if (simulationDt > 0 && (distance(first.angle, second.angle) <= 0.12 || crossed)) {
        state.collisionCooldowns[key] = state.now + 1600;
        for (const [player, other] of [[first, second], [second, first]]) {
          const stats = getStats(player);
          player.collisions += 1;
          player.roundCollisions += 1;
          player.slingUntil = state.now + 3000;
          award(state, player, { type: 'collision', base: stats.collisionPoints + stats.rayPoints * stats.resonance, xp: 10, credits: 4, otherId: other.id }, stats);
        }
      }
    }
  }
  // Collect after every pilot has moved: attacks take effect for the next step,
  // and the earliest physical contact wins rather than roster order or a click.
  if (simulationDt > 0) {
    for (const pickup of [...state.pickups]) {
      const contacts = [];
      for (const player of state.players) {
        if (state.gameMode === 'battle' && player.health <= 0) continue;
        if (player.lane !== pickup.lane) continue;
        const oldAngle = oldAngles.get(player.id);
        const advance = advances.get(player.id);
        const gap = wrap(pickup.angle - oldAngle);
        const fraction = distance(oldAngle, pickup.angle) <= ORB_CONTACT_ARC ? 0 : advance > 0 && gap <= advance + ORB_CONTACT_ARC ? Math.max(0, (gap - ORB_CONTACT_ARC) / advance) : Infinity;
        if (fraction <= 1 && pickup.expiresAt > stepStart + fraction * simulationDt * 1000) contacts.push({ player, fraction });
      }
      contacts.sort((a, b) => a.fraction - b.fraction || a.player.id.localeCompare(b.player.id));
      if (contacts.length) {
        state.pickups.splice(state.pickups.indexOf(pickup), 1);
        collectOrb(state, contacts[0].player, pickup);
      }
    }
  }
  state.pickups = state.pickups.filter((pickup) => pickup.expiresAt > state.now);
  state.fieldEffects = state.fieldEffects.filter((effect) => effect.expiresAt > state.now);
  syncFieldRays(state);
  if (state.now >= state.nextPickupAt && simulationDt > 0 && state.now < state.phaseEndsAt) {
    if (state.pickups.length < MAX_PICKUPS) state.pickups.push({
      id: `p${++state.pickupSeq}`, type: nextOrbType(state),
      angle: Math.round(random(state) * TAU * 100000) / 100000,
      lane: Math.floor(random(state) * LANE_COUNT), expiresAt: state.now + ORB_LIFETIME,
    });
    state.nextPickupAt = state.now + (state.gameMode === 'battle' ? 750 : ORB_INTERVAL);
  }
  if (state.gameMode === 'battle' && state.now < state.phaseEndsAt) {
    for (const player of state.players) {
      if (!player.bot || player.health <= 0 || player.castReadyAt > state.now || player.stunUntil > state.now || player.frozenUntil > state.now) continue;
      const turnBased = state.combatStyle !== 'no-limits';
      if (turnBased && state.turnPlayerId !== player.id) continue;
      const rivals = state.players.filter((rival) => rival.id !== player.id && rival.health > 0);
      const available = MOVE_CATALOG.filter((move) => moveLevel(player, move.id) && (!turnBased || (player.movePP[move.id] > 0 && player.lightPoints >= getMoveStats(player, move.id).lightCost)));
      const move = available.find((move) => move.type === 'heal' && player.health <= 65)
        || available.find((move) => move.type === 'shield' && !player.shieldHealth && player.health < 70)
        || available.find((move) => move.type === 'reflect' && player.reflectUntil <= state.now && rivals.some((rival) => rival.lightPoints >= 3) && random(state) < 0.15)
        || available.find((move) => move.type === 'stun' && random(state) < 0.3)
        || available.find((move) => move.type === 'attack');
      if (move && (move.target === 'self' || rivals.length)) {
        const target = move.target === 'self' ? player : rivals[Math.floor(random(state) * rivals.length)];
        castMove(state, player, { moveId: move.id, targetId: target.id });
        if (state.phase !== 'playing') return state.events.filter((event) => event.id > seqBefore);
      } else if (turnBased) {
        advanceBattleTurn(state);
      }
    }
  }
  if (state.now >= state.phaseEndsAt) openShop(state, state.now);
  return state.events.filter((event) => event.id > seqBefore);
}
