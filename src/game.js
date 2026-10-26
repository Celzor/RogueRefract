// The simulation is independent of the DOM and transport. Only the elected host
// advances it; every command carries the authenticated activity participant ID.
export const TAU = Math.PI * 2;
export const MAX_PLAYERS = 12;
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

export function getPlayerPosition(player) {
  const radius = [0.47, 0.65, 0.83][player.lane] || 0.65;
  return { x: Math.cos(player.angle) * radius, y: Math.sin(player.angle) * radius, angle: player.angle, radius, lane: player.lane };
}

export function createGame({ seed = Date.now(), now = Date.now(), roundDuration = 60, shopDuration = 30 } = {}) {
  const normalizedSeed = validNumber(Number(seed), 1) >>> 0;
  return {
    version: 1, seed: normalizedSeed, rng: normalizedSeed, phase: 'lobby', round: 0,
    phaseEndsAt: 0, roundDuration: Math.max(1, validNumber(roundDuration, 60)),
    shopDuration: Math.max(1, validNumber(shopDuration, 30)), now,
    players: [], rays: [
      { angle: 0, color: '#70e7e3', speed: -0.25, width: 0.025 },
      { angle: 2.1, color: '#b79cff', speed: 0.35, width: 0.025 },
      { angle: 4.2, color: '#ffc785', speed: -0.14, width: 0.025 },
    ], collisionCooldowns: {}, eventSeq: 0, events: [], lastResults: [],
    pickups: [], pickupSeq: 0, nextPickupAt: 0,
    surge: { active: false, endsAt: 0, nextAt: 0, index: 0 },
  };
}

function emit(state, event) {
  const next = { id: ++state.eventSeq, at: state.now, ...event };
  state.events.push(next);
  if (state.events.length > 12) state.events.shift();
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
    angle: random(state) * TAU, orbitProgress: 0, lane: state.players.length % 3,
    hits: 0, collisions: 0, revolutions: 0, roundHits: 0, roundCollisions: 0, roundRevolutions: 0,
    ready: false, shopOffers: [], upgradeTokens: 0, rerollCost: 35,
    boostUntil: 0, boostReadyAt: 0, slingUntil: 0, lastRayAt: 0, chain: 0,
    rayCooldowns: [0, 0, 0], passivePointCarry: 0, passiveCreditCarry: 0,
    nextDecisionAt: state.now + 2000 + random(state) * 4000,
    updatedAt: state.now, starlightUntil: 0, chipUntil: 0,
    voiceIntensity: 0, voiceUntil: 0, lastVoiceAt: -1000, voiceCarry: 0, voiceEventAt: 0,
  };
  state.players.push(player);
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
  state.now = now;
  state.phase = 'playing';
  state.round += 1;
  state.phaseEndsAt = now + state.roundDuration * 1000;
  state.collisionCooldowns = {};
  state.pickups = [];
  state.nextPickupAt = now + 4000;
  state.surge = { active: false, endsAt: 0, nextAt: now + 15000, index: 0 };
  for (const player of state.players) {
    player.roundScore = 0;
    player.roundHits = 0;
    player.roundCollisions = 0;
    player.roundRevolutions = 0;
    player.orbitProgress = 0;
    player.ready = false;
    player.boostUntil = 0;
    player.boostReadyAt = 0;
    player.rayCooldowns = [0, 0, 0];
    player.chain = 0;
    player.lastRayAt = 0;
    player.slingUntil = 0;
    player.updatedAt = now;
    player.starlightUntil = 0;
    player.chipUntil = 0;
    player.voiceIntensity = 0;
    player.voiceUntil = 0;
    player.lastVoiceAt = -1000;
    player.voiceCarry = 0;
    player.voiceEventAt = now;
    player.nextDecisionAt = now + 1500 + random(state) * 3500;
  }
  emit(state, { type: 'round-start', amount: state.round, text: `Round ${state.round} · catch the light` });
  return true;
}

function openShop(state, now) {
  state.phase = 'shop';
  state.pickups = [];
  state.surge.active = false;
  state.phaseEndsAt = now + state.shopDuration * 1000;
  state.lastResults = [...state.players].sort((a, b) => b.roundScore - a.roundScore).map((p) => ({ id: p.id, name: p.name, score: p.roundScore }));
  for (const player of state.players) {
    player.boostUntil = 0;
    player.voiceIntensity = 0;
    player.voiceUntil = 0;
    player.ready = false;
    player.rerollCost = 35;
    player.shopOffers = rollOffers(state, player);
    const stats = getStats(player);
    const interest = Math.min(100 * count(player, 'nebula-bank'), Math.floor(player.credits * stats.interest));
    player.credits += interest + 35;
    if (interest) emit(state, { type: 'interest', playerId: player.id, amount: interest });
    if (player.bot) {
      for (let index = 0; index < 3; index++) {
        const offer = player.shopOffers.find((id) => player.upgradeTokens || getUpgradeCost(player, id) <= player.credits);
        if (!offer) break;
        purchase(state, player, offer);
      }
      player.ready = true;
    }
  }
  emit(state, { type: 'round-end', amount: state.round, text: 'Round complete · upgrade your orbit' });
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

export function applyAction(state, playerId, action, now = state.now) {
  const player = state.players.find((p) => p.id === String(playerId));
  if (!player) return { ok: false, error: 'Join the orbit before taking an action.' };
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') return { ok: false, error: 'Invalid action.' };
  state.now = now;
  player.updatedAt = now;
  if (state.phase === 'playing' && now >= state.phaseEndsAt && ['boost', 'lane', 'collect', 'voice'].includes(action.type)) {
    return { ok: false, error: 'This round has ended. The upgrade shop is opening.' };
  }
  switch (action.type) {
    case 'start':
      if (state.phase !== 'lobby') return { ok: false, error: 'A run is already in progress.' };
      return { ok: startRound(state, now) };
    case 'lane':
      if (state.phase !== 'playing' && state.phase !== 'lobby') return { ok: false, error: 'Choose your lane during a round.' };
      if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane > 2) return { ok: false, error: 'Choose a valid orbit lane.' };
      player.lane = action.lane;
      return { ok: true };
    case 'boost': {
      if (state.phase !== 'playing') return { ok: false, error: 'Orbit burst is available during a round.' };
      if (now < player.boostReadyAt) return { ok: false, error: 'Orbit burst is recharging.' };
      const stats = getStats(player);
      player.boostUntil = now + stats.boostDuration * 1000;
      player.boostReadyAt = now + stats.boostCooldown * 1000;
      emit(state, { type: 'boost', playerId: player.id, text: 'Orbit burst · speed +65% & double points' });
      return { ok: true };
    }
    case 'collect': {
      if (state.phase !== 'playing') return { ok: false, error: 'Pickups appear during a round.' };
      const index = state.pickups.findIndex((pickup) => pickup.id === action.pickupId && pickup.expiresAt > now);
      if (index < 0) return { ok: false, error: 'Another pilot already collected that pickup.' };
      const [pickup] = state.pickups.splice(index, 1);
      if (pickup.type === 'star') {
        player.starlightUntil = now + 6000;
        player.score += 60;
        player.roundScore += 60;
        emit(state, { type: 'collect', playerId: player.id, amount: 60, text: 'Star caught · 1.5× points for 6s' });
      } else {
        player.chipUntil = now + 6000;
        player.credits += 25;
        emit(state, { type: 'collect', playerId: player.id, amount: 25, text: 'Refract chip · +25 shards & +25% speed for 6s' });
      }
      return { ok: true };
    }
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
      // Keep event IDs monotonic so existing views can see the reset event.
      fresh.eventSeq = state.eventSeq;
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
  const simulationDt = Math.max(0, Math.min(seconds, (state.phaseEndsAt - (state.now - seconds * 1000)) / 1000));
  const surgeWasActive = state.surge.active;
  if (state.surge.active && state.now >= state.surge.endsAt) state.surge.active = false;
  if (!state.surge.active && state.now >= state.surge.nextAt && state.surge.nextAt < state.phaseEndsAt) {
    state.surge.active = true;
    state.surge.endsAt = state.surge.nextAt + 8000;
    state.surge.nextAt += 25000;
    state.surge.index += 1;
    if (state.now >= state.surge.endsAt) state.surge.active = false;
    else emit(state, { type: 'surge-start', text: 'Solar Surge · turn sound into starlight' });
  }
  state.pickups = state.pickups.filter((pickup) => pickup.expiresAt > state.now);
  if (state.now >= state.nextPickupAt && simulationDt > 0) {
    if (state.pickups.length < 4) state.pickups.push({
      id: `p${++state.pickupSeq}`, type: random(state) < 0.55 ? 'star' : 'chip',
      angle: random(state) * TAU, lane: Math.floor(random(state) * 3), expiresAt: state.now + 8000,
    });
    state.nextPickupAt = state.now + 4000;
  }
  const oldRays = state.rays.map((ray) => ray.angle);
  for (const ray of state.rays) ray.angle = wrap(ray.angle + ray.speed * simulationDt);
  const oldAngles = new Map();
  const advances = new Map();
  for (const player of state.players) {
    player.updatedAt = state.now;
    const stats = getStats(player);
    if (state.surge.active && player.voiceUntil > state.now) player.voiceCarry += Math.min(1, player.voiceIntensity) * 100 * simulationDt;
    if ((state.surge.active && state.now - player.voiceEventAt >= 1000) || (surgeWasActive && !state.surge.active)) {
      const voicePoints = Math.floor(player.voiceCarry + 1e-9);
      player.voiceCarry -= voicePoints;
      player.voiceEventAt = state.now;
      if (voicePoints > 0) {
        player.score += voicePoints;
        player.roundScore += voicePoints;
        emit(state, { type: 'surge', playerId: player.id, amount: voicePoints });
      }
    }
    if (player.bot && state.now >= player.nextDecisionAt) {
      if (state.now >= player.boostReadyAt && random(state) < 0.7) applyAction(state, player.id, { type: 'boost' }, state.now);
      player.lane = Math.floor(random(state) * 3);
      player.nextDecisionAt = state.now + 3000 + random(state) * 4000;
    }
    const speedBonus = (player.boostUntil > state.now ? 1.65 : 1) * (player.slingUntil > state.now ? 1 + stats.slingshot : 1);
    const advance = stats.speed * speedBonus * simulationDt * [1.1, 1, 0.9][player.lane];
    oldAngles.set(player.id, player.angle);
    advances.set(player.id, advance);
    player.angle = wrap(player.angle + advance);
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
      const relativeAdvance = advance - ray.speed * simulationDt;
      const crosses = relativeAdvance >= 0 ? oldRelative + relativeAdvance >= TAU : oldRelative + relativeAdvance <= 0;
      const touches = distance(player.angle, ray.angle) < stats.magnet + ray.width;
      if ((crosses || touches) && simulationDt > 0 && player.rayCooldowns[index] <= state.now) {
        player.rayCooldowns[index] = state.now + 900;
        player.hits += 1;
        player.roundHits += 1;
        player.chain = state.now - player.lastRayAt < 6000 ? Math.min(5, player.chain + 1) : 1;
        player.lastRayAt = state.now;
        award(state, player, { type: 'ray', base: stats.rayPoints, xp: 8, credits: 3 + stats.photonShards,
          critical: random(state) < stats.critChance, extraMultiplier: 1 + (player.chain - 1) * stats.chainBonus }, stats);
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
  if (state.now >= state.phaseEndsAt) openShop(state, state.now);
  return state.events.filter((event) => event.id > seqBefore);
}
