import { LANE_COUNT, LANE_RADII, MAX_RAYS, ORB_CATALOG, getPlayerSpeed, getRaySpeedMultiplier } from './game.js';

const TAU = Math.PI * 2;
const SPECTRUM = ['#fc6d9d', '#ffad69', '#ffe39a', '#b7f7b1', '#7ee8f2', '#9b9bff', '#d99dff'];
const ORB_COLORS = Object.fromEntries(ORB_CATALOG.map(({ id, color }) => [id, color]));
const CAST_COLORS = { 'photon-strike': '#ff8e91', 'mending-light': '#bcf6cf', 'mirror-veil': '#6de9d3', 'static-pulse': '#8be0fa', 'aegis-shell': '#ffdc89' };
const LIGHT_ORBS = { light: 2, 'light-surge': 4, 'light-nova': 6 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** The same tilted avatar orbit as Refract's voice stage, drawn in logical pixels. */
export class OrbitArena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 600;
    this.height = 430;
    this.particles = [];
    this.floats = [];
    this.flashes = new Map();
    this.levelUps = new Map();
    this.images = new Map();
    this.positions = new Map();
    this.displayLanes = new Map();
    this.castBeams = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.logo = new Image();
    // document.baseURI is the repo root, including GitHub Pages project subpaths.
    this.logo.src = new URL('assets/refract-icon.png', document.baseURI).href;
    this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.resizeObserver.observe(canvas);
    this.stars = Array.from({ length: 85 }, (_, i) => ({
      x: ((Math.sin(i * 127.1 + 31) * 43758.5453) % 1 + 1) % 1,
      y: ((Math.sin(i * 311.7 + 9) * 32678.128) % 1 + 1) % 1,
      r: i % 9 === 0 ? 1.3 : 0.65,
    }));
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  project(angle, lane = 2, extra = 1) {
    const boundedLane = clamp(lane, 0, LANE_COUNT - 1);
    const inner = Math.floor(boundedLane), outer = Math.min(LANE_COUNT - 1, inner + 1);
    const radius = (LANE_RADII[inner] + (LANE_RADII[outer] - LANE_RADII[inner]) * (boundedLane - inner)) * extra;
    const rx = this.width * 0.415 * radius;
    const ry = Math.min(this.height * 0.34, this.width * 0.25) * radius;
    const x = Math.cos(angle) * rx;
    return { x: this.width / 2 + x, y: this.height * 0.49 + Math.sin(angle) * ry - x * 0.17 };
  }

  emit(event, state, selfId) {
    const p = state.players.find((p) => p.id === event.playerId);
    if (p && state.gameMode === 'battle' && ['cast', 'knockout', 'winner'].includes(event.type)) {
      this.emitBattle(event, state, p);
      return;
    }
    if (!p || !['ray', 'collision', 'revolution', 'levelup', 'boost', 'collect', 'surge'].includes(event.type)) return;
    const position = this.positions.get(p.id) || this.project(p.angle, p.lane);
    const color = event.critical ? '#ffe09d' : event.type === 'levelup' ? '#d5b2ff' : event.type === 'collect' ? ORB_COLORS[event.pickupType] || p.color : p.color;
    this.flashes.set(p.id, { until: performance.now() + 650, color });
    if (event.type === 'levelup' && p.id === selfId) {
      this.levelUps.set(p.id, { startedAt: performance.now(), duration: 1800 });
    }
    if (!this.reducedMotion) {
      const count = event.critical || ['levelup', 'collect'].includes(event.type) ? 25 : 10;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU, v = 20 + Math.random() * 80;
        this.particles.push({ ...position, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: i % 3 === 0 ? SPECTRUM[i % 7] : color });
      }
    }
    if (this.floats.length < 15 && (p.id === selfId || event.critical) && !(event.type === 'levelup' && p.id === selfId)) {
      this.floats.push({ ...position, life: 1, color, text: event.type === 'levelup' ? 'LEVEL UP!' : event.type === 'boost' ? 'OVERDRIVE' : `${event.critical ? 'CRIT! ' : '+'}${Math.round(event.amount || 0)}` });
    }
    this.particles = this.particles.slice(-220);
  }

  emitBattle(event, state, caster) {
    const target = state.players.find((p) => p.id === event.otherId) || caster;
    const position = this.positions.get(target.id) || this.project(target.angle, target.lane);
    const color = event.type === 'knockout' ? '#ff8e91' : event.type === 'winner' ? '#ffdc89' : CAST_COLORS[event.moveId] || caster.color;
    const now = performance.now();
    this.flashes.set(target.id, { until: now + 650, color });
    if (event.type === 'cast') {
      this.castBeams.push({ casterId: caster.id, targetId: target.id, reflectorId: event.reflectedBy, color, startedAt: now, reflected: !!event.reflected });
      this.castBeams = this.castBeams.slice(-12);
    }
    const text = event.type === 'knockout' ? 'ELIMINATED' : event.type === 'winner' ? 'WINNER!' : event.moveId === 'mending-light' ? `+${Math.round(event.amount || 0)} HP` : event.moveId === 'mirror-veil' ? 'REFLECT READY' : event.moveId === 'aegis-shell' ? `+${Math.round(event.amount || 0)} SHIELD` : `${event.reflected ? 'REFLECT! ' : ''}${event.amount ? `−${Math.round(event.amount)} HP` : 'STUN'}`;
    this.floats.push({ ...position, life: 1.3, color, text, battle: true });
    this.floats = this.floats.slice(-20);
    if (!this.reducedMotion) {
      for (let i = 0; i < 14; i++) {
        const angle = i * TAU / 14, speed = 25 + Math.random() * 45;
        this.particles.push({ ...position, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
      }
      this.particles = this.particles.slice(-220);
    }
  }

  render(state, selfId, now, extrapolation = 0) {
    const c = this.ctx;
    if (!c) return;
    const { width: w, height: h } = this;
    const time = now / 1000;
    const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const preview = state.phase === 'lobby';
    const active = state.phase === 'playing';
    this.battleMode = state.gameMode === 'battle';
    if (!active) this.castBeams = [];
    const logicalNow = state.now + clamp(extrapolation, 0, 0.65) * 1000;
    this.logicalNow = logicalNow;
    for (const [id, effect] of this.levelUps) {
      if (now - effect.startedAt >= effect.duration || !state.players.some((p) => p.id === id) || preview) this.levelUps.delete(id);
    }
    for (const id of this.displayLanes.keys()) if (!state.players.some((p) => p.id === id)) this.displayLanes.delete(id);
    c.clearRect(0, 0, w, h);
    const glow = c.createRadialGradient(w / 2, h * 0.49, 10, w / 2, h * 0.49, w * 0.49);
    glow.addColorStop(0, state.surge?.active ? '#382b4438' : '#30243c55');
    glow.addColorStop(0.6, '#201d2a22');
    glow.addColorStop(1, '#15151b00');
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      c.globalAlpha = 0.12 + (this.reducedMotion ? 0.2 : (Math.sin(time * 0.6 + i) + 1) * 0.13);
      c.fillStyle = i % 5 ? '#c3b7d6' : '#b4f1d2';
      c.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    c.globalAlpha = 1;
    const me = state.players.find((p) => p.id === selfId);
    for (let lane = LANE_COUNT - 1; lane >= 0; lane--) {
      const selected = me?.lane === lane;
      c.beginPath();
      for (let i = 0; i <= 180; i++) {
        const p = this.project(i / 180 * TAU, lane);
        if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
      }
      c.strokeStyle = selected ? '#bcf6cf85' : '#9b7abf42';
      c.lineWidth = selected ? 1.5 : 0.8;
      c.stroke();
      for (let i = 0; i < 60; i++) {
        const p = this.project(i / 60 * TAU, lane);
        c.fillStyle = i % 5 === 0 ? '#baa6d04d' : '#baa6d01c';
        c.fillRect(p.x - 1, p.y - 1, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
    }
    // Refraction rays share the simulation's angle, so a visual hit is a real hit.
    const rays = state.rays?.length ? state.rays : SPECTRUM.slice(0, 4).map((color, i) => ({ angle: i * TAU / 4, color }));
    const raySpeed = getRaySpeedMultiplier(state, logicalNow);
    const dense = rays.length > 20;
    if (active || preview) rays.slice(0, MAX_RAYS).forEach((ray, i) => {
      const a = preview ? ray.angle + time * 0.16 : ray.angle + (ray.speed || 0) * raySpeed * clamp(extrapolation, 0, 0.65);
      const end = this.project(a, LANE_COUNT - 1, 1.12);
      const start = { x: w / 2, y: h * 0.49 };
      const gradient = c.createLinearGradient(start.x, start.y, end.x, end.y);
      const color = /^#[\da-f]{6}$/i.test(ray.color) ? ray.color : SPECTRUM[i % 7];
      gradient.addColorStop(0, `${color}${dense ? '80' : 'a0'}`); gradient.addColorStop(0.6, `${color}${dense ? '65' : '45'}`); gradient.addColorStop(1, `${color}00`);
      c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(end.x, end.y);
      c.strokeStyle = gradient; c.lineWidth = dense ? 1.1 : 1.5; c.stroke();
      c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(end.x + 7, end.y - 4); c.lineTo(end.x - 7, end.y + 4); c.closePath();
      c.fillStyle = gradient; c.globalAlpha = dense ? 0.08 : 0.16; c.fill(); c.globalAlpha = 1;
      if (!this.reducedMotion && (!dense || i % 2 === 0)) {
        const t = (time * 0.65 * raySpeed + i * 0.23) % 1;
        c.beginPath(); c.arc(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, 2, 0, TAU);
        c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 10; c.fill(); c.shadowBlur = 0;
      }
    });
    // An arc behind each avatar makes spin speed and overdrive visible.
    const players = state.players.map((p, index) => {
      let angle = Number.isFinite(p.angle) ? p.angle : index * TAU / Math.max(1, state.players.length);
      if (preview) angle = index * TAU / Math.max(1, state.players.length) + time * 0.16;
      else if (active && !(this.battleMode && (p.health <= 0 || p.stunUntil > logicalNow))) {
        angle += getPlayerSpeed(p, logicalNow) * clamp(extrapolation, 0, 0.65);
      }
      const previousLane = this.displayLanes.get(p.id) ?? p.lane;
      const displayLane = this.battleMode && p.health <= 0 ? previousLane : active && p.gravityUntil > logicalNow ? previousLane + (p.lane - previousLane) * (1 - Math.exp(-dt * 13)) : p.lane;
      this.displayLanes.set(p.id, displayLane);
      const position = this.project(angle, displayLane);
      this.positions.set(p.id, position);
      if ((active || preview) && !(active && (p.frozenUntil > logicalNow || (this.battleMode && (p.health <= 0 || p.stunUntil > logicalNow))))) {
        c.beginPath();
        for (let j = 0; j < 25; j++) {
          const q = this.project(angle - j * 0.022, displayLane);
          if (!j) c.moveTo(q.x, q.y); else c.lineTo(q.x, q.y);
        }
        c.lineWidth = p.id === selfId ? 3 : 2; c.strokeStyle = `${p.slowUntil > logicalNow ? ORB_COLORS.ice : p.color}65`; c.lineCap = 'round'; c.stroke();
      }
      return { p, position };
    }).sort((a, b) => a.position.y - b.position.y);
    const centerY = h * 0.49;
    const gravityActive = active && state.players.some((p) => p.gravityUntil > logicalNow);
    players.filter((p) => p.position.y < centerY).forEach(({ p, position }) => this.drawPlayer(p, position, selfId, now));
    // Glass orb + the real Refract brand mark from the application's voice stage.
    const size = Math.min(48, w * 0.075);
    if (gravityActive) this.drawVortex(w / 2, centerY, size, time);
    const halo = c.createRadialGradient(w / 2, centerY, 6, w / 2, centerY, size * 2.7);
    halo.addColorStop(0, '#ab7dff30'); halo.addColorStop(1, '#ab7dff00');
    c.fillStyle = halo; c.beginPath(); c.arc(w / 2, centerY, size * 2.7, 0, TAU); c.fill();
    const orb = c.createRadialGradient(w / 2 - size * 0.4, centerY - size * 0.5, 3, w / 2, centerY, size);
    orb.addColorStop(0, '#726084'); orb.addColorStop(0.3, '#35243f'); orb.addColorStop(0.8, '#22182f'); orb.addColorStop(1, '#4e365f');
    c.fillStyle = gravityActive ? '#100b1d' : orb; c.strokeStyle = gravityActive ? '#d0a2ff' : '#b78ce89a'; c.lineWidth = 1;
    c.beginPath(); c.arc(w / 2, centerY, size, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = '#c3a0e329'; c.beginPath(); c.arc(w / 2, centerY, size + 5, 0, TAU); c.stroke();
    if (this.logo.complete && this.logo.naturalWidth) {
      c.save(); c.globalAlpha = gravityActive ? 0.45 : 1;
      c.drawImage(this.logo, w / 2 - size * 0.72, centerY - size * 0.72, size * 1.44, size * 1.44); c.restore();
    }
    c.textAlign = 'center'; c.font = '600 11px Inter, system-ui'; c.fillStyle = '#d2c4e3';
    c.fillText(gravityActive ? 'GRAVITY WELL' : 'THE REFRACT CORE', w / 2, centerY + size + 23);
    c.font = '9px ui-monospace, monospace'; c.fillStyle = '#80768d';
    c.fillText(state.surge?.active ? 'SOLAR SURGE' : active ? `${rays.length} BEAMS${raySpeed > 1 ? ` · ${raySpeed.toFixed(2)}× SPEED` : ''}` : 'CATCH THE LIGHT', w / 2, centerY + size + 39);
    players.filter((p) => p.position.y >= centerY).forEach(({ p, position }) => this.drawPlayer(p, position, selfId, now));
    (state.pickups || []).forEach((pickup) => {
      this.drawOrb(pickup, time, pickup.lane === me?.lane);
    });
    this.drawCastBeams(now);
    this.particles.forEach((p) => { p.life -= dt * 1.7; p.x += p.vx * dt; p.y += p.vy * dt; c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.color; c.fillRect(p.x, p.y, 2.5, 2.5); });
    this.particles = this.particles.filter((p) => p.life > 0);
    this.floats.forEach((p) => { p.life -= dt * 0.8; if (!(p.battle && this.reducedMotion)) p.y -= dt * 26; c.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); c.textAlign = 'center'; c.fillStyle = p.color; c.font = `700 ${this.width < 480 && p.battle ? 10 : 12}px Inter, system-ui`; c.fillText(p.text, p.x, p.y - 40); });
    this.floats = this.floats.filter((p) => p.life > 0);
    c.globalAlpha = 1;
  }

  drawCastBeams(now) {
    const c = this.ctx;
    const duration = this.reducedMotion ? 500 : 850;
    this.castBeams = this.castBeams.filter((beam) => now - beam.startedAt < duration);
    for (const beam of this.castBeams) {
      const source = this.positions.get(beam.casterId), target = this.positions.get(beam.targetId);
      if (!source || !target) continue;
      const progress = clamp((now - beam.startedAt) / duration, 0, 1);
      c.save(); c.globalAlpha = this.reducedMotion ? 0.65 : Math.min(1, (1 - progress) * 2);
      c.strokeStyle = beam.color; c.lineWidth = 2; c.lineCap = 'round';
      if (beam.casterId === beam.targetId && !beam.reflectorId) {
        const radius = (this.width < 480 ? 24 : 32) + (this.reducedMotion ? 0 : progress * 12);
        c.beginPath(); c.arc(target.x, target.y, radius, 0, TAU); c.stroke();
      } else {
        const reflector = this.positions.get(beam.reflectorId);
        const destination = reflector || target;
        c.beginPath(); c.moveTo(source.x, source.y); c.lineTo(destination.x, destination.y); c.stroke();
        if (reflector) {
          c.setLineDash([4, 4]); c.strokeStyle = '#6de9d3';
          c.beginPath(); c.moveTo(reflector.x, reflector.y); c.quadraticCurveTo((source.x + reflector.x) / 2 - 15, (source.y + reflector.y) / 2 - 18, target.x, target.y); c.stroke();
        }
        if (!this.reducedMotion) {
          const travel = Math.min(1, progress * 2);
          c.fillStyle = beam.color; c.shadowColor = beam.color; c.shadowBlur = 9;
          c.beginPath(); c.arc(source.x + (destination.x - source.x) * travel, source.y + (destination.y - source.y) * travel, 3, 0, TAU); c.fill();
        }
      }
      c.restore();
    }
  }

  drawOrb(pickup, time, selected) {
    const c = this.ctx;
    const position = this.project(pickup.angle, pickup.lane);
    const color = ORB_COLORS[pickup.type] || '#bcf6cf';
    const size = this.width < 480 ? 12 : 15;
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(time * 3.5 + pickup.angle) * 0.055;
    c.save(); c.translate(position.x, position.y); c.scale(pulse, pulse);
    c.shadowColor = color; c.shadowBlur = selected ? 16 : 8;
    c.fillStyle = '#171722'; c.strokeStyle = color; c.lineWidth = selected ? 1.8 : 1.2;
    c.beginPath(); c.arc(0, 0, size, 0, TAU); c.fill(); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = `${color}18`; c.fill();
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
    if (LIGHT_ORBS[pickup.type]) {
      const value = LIGHT_ORBS[pickup.type];
      c.textAlign = 'center'; c.font = '800 10px Inter, system-ui';
      c.fillText(`+${value}`, 0, 0);
      c.font = '700 6px ui-monospace,monospace'; c.fillText('LP', 0, 8);
      if (value > 2) {
        c.strokeStyle = `${color}90`; c.lineWidth = 0.8;
        c.beginPath(); c.arc(0, 0, size - 3, -Math.PI * 0.8, -Math.PI * 0.2); c.stroke();
        if (value === 6) { c.beginPath(); c.arc(0, 0, size - 3, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
      }
    } else if (pickup.type === 'beam') {
      c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.stroke();
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        c.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); c.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      }
      c.stroke();
    } else if (pickup.type === 'haste') {
      c.beginPath(); c.moveTo(1, -8); c.lineTo(-6, 1); c.lineTo(-1, 1); c.lineTo(-2, 8); c.lineTo(6, -2); c.lineTo(1, -2); c.closePath(); c.fill();
    } else if (pickup.type === 'ice') {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        c.moveTo(0, 0); c.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
        for (const side of [-1, 1]) {
          c.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
          c.lineTo(Math.cos(a) * 5 + Math.cos(a + Math.PI + side * 0.8) * 3, Math.sin(a) * 5 + Math.sin(a + Math.PI + side * 0.8) * 3);
        }
      }
      c.stroke();
    } else if (pickup.type === 'clock') {
      c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 0); c.lineTo(3, 2); c.stroke();
      c.fillRect(-2, -10, 4, 1.5);
    } else if (pickup.type === 'star') {
      c.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = j * TAU / 8 - Math.PI / 2, r = j % 2 ? 3 : 8;
        if (!j) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fill();
    } else if (pickup.type === 'overdrive') {
      c.beginPath();
      for (const dx of [-3, 3]) { c.moveTo(dx - 3, -6); c.lineTo(dx + 2, 0); c.lineTo(dx - 3, 6); }
      c.stroke();
    } else if (pickup.type === 'echo') {
      c.beginPath(); c.arc(-3, 0, 5, 0, TAU); c.stroke();
      c.beginPath(); c.arc(3, 0, 5, 0, TAU); c.stroke();
    } else if (pickup.type === 'shield') {
      c.beginPath(); c.moveTo(0, -8); c.lineTo(6, -5); c.lineTo(5, 3); c.quadraticCurveTo(4, 6, 0, 8); c.quadraticCurveTo(-4, 6, -5, 3); c.lineTo(-6, -5); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-3, 0); c.lineTo(-1, 3); c.lineTo(3, -2); c.stroke();
    } else if (pickup.type === 'blackhole') {
      c.save(); c.rotate(-0.35);
      c.beginPath(); c.ellipse(0, 0, 9, 4, 0, 0, TAU); c.stroke();
      c.fillStyle = '#080511'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill();
      c.strokeStyle = '#e3c7ff'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.ellipse(0, 0, 9, 4, 0, 0, Math.PI); c.stroke();
      c.restore();
    } else {
      c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.fillStyle = '#31274a'; c.fillRect(-2, -2, 4, 4);
    }
    c.restore();
  }

  drawPlayer(p, position, selfId, now) {
    const c = this.ctx;
    const { x, y } = position;
    const self = p.id === selfId;
    const s = this.width < 480 ? 30 : 42;
    const knockedOut = this.battleMode && p.health <= 0;
    const stunned = this.battleMode && !knockedOut && p.stunUntil > this.logicalNow;
    const reflecting = this.battleMode && !knockedOut && p.reflectUntil > this.logicalNow;
    const barrier = this.battleMode && !knockedOut && p.barrierUntil > this.logicalNow && p.shieldHealth > 0;
    const frozen = p.frozenUntil > this.logicalNow;
    const slowed = !frozen && p.slowUntil > this.logicalNow;
    const shielded = p.shieldUntil > this.logicalNow;
    const gravity = p.gravityUntil > this.logicalNow;
    const effectColor = stunned ? CAST_COLORS['static-pulse'] : frozen ? ORB_COLORS.clock : slowed ? ORB_COLORS.ice : null;
    c.save();
    if (knockedOut) c.globalAlpha = 0.4;
    const levelUp = this.levelUps.get(p.id);
    if (levelUp) this.drawLevelUp(position, s, levelUp, now);
    if (gravity) this.drawGravityPull(position, s, now / 1000);
    if (p.overdriveUntil > this.logicalNow) {
      const next = this.project(p.angle + 0.02, p.lane);
      c.save(); c.translate(x, y); c.rotate(Math.atan2(next.y - y, next.x - x));
      c.strokeStyle = ORB_COLORS.overdrive; c.lineWidth = 1.8;
      c.globalAlpha = this.reducedMotion ? 0.65 : 0.6 + Math.sin(now / 160) * 0.15;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const tail = -s * (0.8 + i * 0.2);
        c.moveTo(tail - 4, -5); c.lineTo(tail + 1, 0); c.lineTo(tail - 4, 5);
      }
      c.stroke(); c.restore();
    }
    if (p.echoUntil > this.logicalNow) {
      c.save(); c.strokeStyle = `${ORB_COLORS.echo}70`; c.lineWidth = 1.2;
      const echoOffset = s * (this.reducedMotion ? 0.24 : 0.24 + Math.sin(now / 210) * 0.025);
      for (const side of [-1, 1]) { c.beginPath(); c.arc(x + side * echoOffset, y, s * 0.7, 0, TAU); c.stroke(); }
      c.restore();
    }
    if (shielded) {
      c.save(); c.strokeStyle = `${ORB_COLORS.shield}85`; c.fillStyle = `${ORB_COLORS.shield}08`; c.lineWidth = 1.3;
      c.beginPath(); c.arc(x, y, s * 0.78, 0, TAU); c.fill(); c.stroke(); c.restore();
    }
    if (reflecting) {
      c.save(); c.strokeStyle = '#6de9d3'; c.fillStyle = '#6de9d30c'; c.lineWidth = 1.6;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6 - Math.PI / 2;
        const px = x + Math.cos(angle) * s * 0.82, py = y + Math.sin(angle) * s * 0.82;
        if (!i) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    if (barrier) {
      c.save(); c.strokeStyle = '#ffdc89'; c.fillStyle = '#ffdc8910'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, s * 0.72, 0, TAU); c.fill(); c.stroke();
      c.font = '700 8px ui-monospace,monospace'; c.textAlign = 'center'; c.fillStyle = '#ffdc89';
      c.fillText(`+${Math.ceil(p.shieldHealth)}`, x, y - s * 0.82);
      c.restore();
    }
    const flash = this.flashes.get(p.id);
    if (flash?.until > now) {
      c.beginPath(); c.arc(x, y, this.reducedMotion ? s * 0.83 : s * 0.8 + (1 - (flash.until - now) / 650) * 18, 0, TAU);
      c.strokeStyle = `${flash.color}80`; c.lineWidth = 2; c.stroke();
    }
    c.save();
    c.shadowColor = effectColor || p.color; c.shadowBlur = self || effectColor ? 16 : 5;
    c.fillStyle = '#1c1c27'; c.strokeStyle = effectColor || (self ? p.color : `${p.color}80`); c.lineWidth = self || effectColor ? 2 : 1;
    c.beginPath(); c.roundRect(x - s / 2, y - s / 2, s, s, 10); c.fill(); c.stroke(); c.shadowBlur = 0;
    c.save(); c.clip();
    const gradient = c.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
    gradient.addColorStop(0, `${p.color}55`); gradient.addColorStop(1, `${p.color}0a`);
    c.fillStyle = gradient; c.fillRect(x - s / 2, y - s / 2, s, s);
    if (p.avatarUrl && /^https?:\/\//.test(p.avatarUrl)) {
      if (!this.images.has(p.avatarUrl)) { const img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = p.avatarUrl; this.images.set(p.avatarUrl, img); }
      const img = this.images.get(p.avatarUrl);
      if (img.complete && img.naturalWidth) c.drawImage(img, x - s / 2, y - s / 2, s, s);
      else this.drawInitial(p, x, y);
    } else this.drawInitial(p, x, y);
    if (effectColor) {
      c.fillStyle = `${effectColor}20`; c.fillRect(x - s / 2, y - s / 2, s, s);
      c.strokeStyle = `${effectColor}55`; c.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        c.beginPath(); c.moveTo(x - s / 2, y + i * s / 3); c.lineTo(x + s / 2, y + i * s / 3 - s / 2); c.stroke();
      }
    }
    c.restore();
    if (effectColor) {
      const bx = x + s / 2 - 1, by = y - s / 2 + 1;
      c.fillStyle = '#171722'; c.strokeStyle = effectColor; c.lineWidth = 1.3;
      c.beginPath(); c.arc(bx, by, 7, 0, TAU); c.fill(); c.stroke();
      c.beginPath();
      if (stunned) { c.moveTo(bx + 1, by - 4); c.lineTo(bx - 3, by); c.lineTo(bx, by); c.lineTo(bx - 1, by + 4); c.lineTo(bx + 3, by - 1); }
      else if (frozen) { c.moveTo(bx, by - 4); c.lineTo(bx, by); c.lineTo(bx + 3, by + 2); }
      else {
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI / 3;
          c.moveTo(bx - Math.cos(a) * 4, by - Math.sin(a) * 4); c.lineTo(bx + Math.cos(a) * 4, by + Math.sin(a) * 4);
        }
      }
      c.stroke();
    }
    c.textAlign = 'center'; c.fillStyle = self ? '#e7f6ed' : '#c3bccc'; c.font = `${self ? 700 : 500} 10px Inter, system-ui`;
    const name = self ? (p.name === 'You' ? 'YOU' : `${p.name.slice(0, 10)} · YOU`) : p.name.slice(0, 12);
    c.fillText(name, x, y + s / 2 + (this.battleMode ? 24 : 17));
    if (p.bot) { c.font = '8px ui-monospace,monospace'; c.fillStyle = '#716b7d'; c.fillText('BOT', x, y + s / 2 + (this.battleMode ? 36 : 29)); }
    if (self) { c.fillStyle = p.color; c.beginPath(); c.moveTo(x - 3, y - s / 2 - 8); c.lineTo(x + 3, y - s / 2 - 8); c.lineTo(x, y - s / 2 - 4); c.fill(); }
    c.restore();
    c.restore();
    if (this.battleMode) this.drawHealth(p, position, s, knockedOut);
  }

  drawHealth(p, { x, y }, size, knockedOut) {
    const c = this.ctx;
    const health = clamp(Number.isFinite(p.health) ? p.health : 100, 0, p.maxHealth || 100);
    const fraction = health / (p.maxHealth || 100);
    const width = size + 6, top = y + size / 2 + 6;
    c.save();
    c.fillStyle = '#11121be6'; c.strokeStyle = '#ffffff28'; c.lineWidth = 0.6;
    c.beginPath(); c.roundRect(x - width / 2, top, width, 9, 3); c.fill(); c.stroke();
    if (fraction > 0) {
      c.fillStyle = fraction > 0.5 ? '#bcf6cf' : fraction > 0.25 ? '#ffdc89' : '#ff8e91';
      c.beginPath(); c.roundRect(x - width / 2, top, Math.max(2, width * fraction), 9, 3); c.fill();
    }
    c.textAlign = 'center'; c.font = '800 8px ui-monospace,monospace';
    c.fillStyle = '#fff'; c.strokeStyle = '#13141a'; c.lineWidth = 2;
    c.strokeText(`${Math.ceil(health)} HP`, x, top + 7); c.fillText(`${Math.ceil(health)} HP`, x, top + 7);
    if (knockedOut) {
      c.textAlign = 'center'; c.fillStyle = '#ffb8bb'; c.font = '800 11px Inter,system-ui';
      c.fillText('OUT', x, y + 4);
    }
    c.restore();
  }

  drawInitial(p, x, y) {
    const c = this.ctx;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = p.color; c.font = '700 15px Inter, system-ui'; c.fillText(p.name.charAt(0).toUpperCase(), x, y + 1); c.textBaseline = 'alphabetic';
  }

  drawVortex(x, y, size, time) {
    const c = this.ctx;
    c.save();
    const lens = c.createRadialGradient(x, y, size * 0.75, x, y, size * 3);
    lens.addColorStop(0, '#080510e0'); lens.addColorStop(0.4, `${ORB_COLORS.blackhole}28`); lens.addColorStop(1, `${ORB_COLORS.blackhole}00`);
    c.fillStyle = lens; c.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
    c.translate(x, y); c.rotate(-0.2);
    c.strokeStyle = `${ORB_COLORS.blackhole}7a`; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, size * 2.15, size * 0.63, 0, 0, TAU); c.stroke();
    c.strokeStyle = '#e1b8ff7a'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, size * 1.7, size * 0.48, 0, 0, TAU); c.stroke();
    if (!this.reducedMotion) {
      for (let i = 0; i < 12; i++) {
        const a = time * 1.5 + i * TAU / 12;
        const radius = 1.65 + (i % 3) * 0.2;
        c.globalAlpha = 0.3 + Math.sin(a) * 0.15;
        c.fillStyle = i % 2 ? '#e1b8ff' : '#ffbd93';
        c.beginPath(); c.arc(Math.cos(a) * size * radius, Math.sin(a) * size * radius * 0.29, 1.8, 0, TAU); c.fill();
      }
    }
    c.restore();
  }

  drawGravityPull({ x, y }, size, time) {
    const c = this.ctx;
    const dx = this.width / 2 - x, dy = this.height * 0.49 - y;
    c.save();
    c.strokeStyle = `${ORB_COLORS.blackhole}70`; c.lineWidth = 1.3;
    c.beginPath();
    const rotation = this.reducedMotion ? 0 : time * 2;
    for (let i = 0; i <= 44; i++) {
      const t = i / 44, a = rotation + t * TAU * 1.35;
      const radius = size * (1.1 - t * 0.48);
      const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius * 0.8;
      if (!i) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
    c.strokeStyle = `${ORB_COLORS.blackhole}35`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + dx * 0.2 - dy * 0.12, y + dy * 0.2 + dx * 0.12, x + dx * 0.4, y + dy * 0.4); c.stroke();
    if (!this.reducedMotion) {
      for (let i = 0; i < 3; i++) {
        const t = (time * 0.65 + i / 3) % 1;
        const pull = 0.1 + t * 0.3;
        c.globalAlpha = (1 - t) * 0.7; c.fillStyle = '#d7aeff';
        c.beginPath(); c.arc(x + dx * pull, y + dy * pull, 2 - t, 0, TAU); c.fill();
      }
    }
    c.restore();
  }

  drawLevelUp({ x, y }, size, effect, now) {
    const c = this.ctx;
    const progress = clamp((now - effect.startedAt) / effect.duration, 0, 1);
    const fade = Math.min(1, (1 - progress) * 4);
    const radius = size * 0.8;
    c.save();
    c.globalAlpha = fade;
    const glow = c.createRadialGradient(x, y, size * 0.35, x, y, size * 2.5);
    glow.addColorStop(0, '#d5b2ff30'); glow.addColorStop(0.45, '#bcf6cf16'); glow.addColorStop(1, '#d5b2ff00');
    c.fillStyle = glow;
    c.fillRect(x - size * 2.5, y - size * 2.5, size * 5, size * 5);
    if (this.reducedMotion) {
      c.strokeStyle = '#d5b2ffb0'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, radius, 0, TAU); c.stroke();
      c.restore();
      return;
    }
    for (let ring = 0; ring < 3; ring++) {
      const phase = clamp((progress - ring * 0.12) / (0.76 - ring * 0.12), 0, 1);
      if (progress < ring * 0.12 || phase >= 1) continue;
      const expanded = 1 - (1 - phase) ** 3;
      c.globalAlpha = fade * (1 - phase) * 0.85;
      c.strokeStyle = ring === 1 ? '#bcf6cf' : '#d5b2ff';
      c.lineWidth = 2 - phase;
      c.beginPath(); c.arc(x, y, radius + expanded * size * 1.8, 0, TAU); c.stroke();
    }
    for (let spark = 0; spark < 8; spark++) {
      const angle = spark * TAU / 8 + progress * 0.45;
      const distance = radius + (1 - (1 - progress) ** 2) * size * 1.55;
      const tipX = x + Math.cos(angle) * distance;
      const tipY = y + Math.sin(angle) * distance;
      c.globalAlpha = fade * Math.min(1, progress * 7) * (1 - progress * 0.65);
      c.strokeStyle = spark % 2 ? '#bcf6cf' : '#d5b2ff';
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(tipX, tipY); c.lineTo(x + Math.cos(angle - 0.1) * (distance - 12), y + Math.sin(angle - 0.1) * (distance - 12)); c.stroke();
      const point = 3 * (1 - progress * 0.5);
      c.fillStyle = spark % 2 ? '#bcf6cf' : '#e9d8ff';
      c.beginPath(); c.moveTo(tipX, tipY - point); c.lineTo(tipX + point, tipY); c.lineTo(tipX, tipY + point); c.lineTo(tipX - point, tipY); c.closePath(); c.fill();
    }
    c.restore();
  }

  destroy() { this.resizeObserver.disconnect(); this.levelUps.clear(); this.displayLanes.clear(); this.castBeams = []; }
}
