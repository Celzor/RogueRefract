import { getStats } from './game.js';

const TAU = Math.PI * 2;
const SPECTRUM = ['#fc6d9d', '#ffad69', '#ffe39a', '#b7f7b1', '#7ee8f2', '#9b9bff', '#d99dff'];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** The same tilted avatar orbit as Refract's voice stage, drawn in logical pixels. */
export class OrbitArena {
  constructor(canvas, { onCollect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onCollect = onCollect;
    this.width = 600;
    this.height = 430;
    this.particles = [];
    this.floats = [];
    this.flashes = new Map();
    this.images = new Map();
    this.positions = new Map();
    this.targets = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.logo = new Image();
    // document.baseURI is the repo root, including GitHub Pages project subpaths.
    this.logo.src = new URL('assets/refract-icon.png', document.baseURI).href;
    this.resizeObserver = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.resizeObserver.observe(canvas);
    this.click = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const target = this.targets.find((p) => Math.hypot(p.x - x, p.y - y) < 28);
      if (target) this.onCollect?.(target.id);
    };
    canvas.addEventListener('pointerdown', this.click);
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

  project(angle, lane = 1, extra = 1) {
    const radius = [0.65, 0.83, 1][clamp(lane, 0, 2)] * extra;
    const rx = this.width * 0.415 * radius;
    const ry = Math.min(this.height * 0.27, this.width * 0.21) * radius;
    const x = Math.cos(angle) * rx;
    return { x: this.width / 2 + x, y: this.height * 0.49 + Math.sin(angle) * ry - x * 0.17 };
  }

  emit(event, state, selfId) {
    const p = state.players.find((p) => p.id === event.playerId);
    if (!p || !['ray', 'collision', 'revolution', 'levelup', 'boost', 'collect', 'surge'].includes(event.type)) return;
    const position = this.positions.get(p.id) || this.project(p.angle, p.lane);
    const color = event.critical ? '#ffe09d' : event.type === 'levelup' ? '#d5b2ff' : p.color;
    this.flashes.set(p.id, { until: performance.now() + 650, color });
    if (!this.reducedMotion) {
      const count = event.critical || event.type === 'levelup' ? 25 : 10;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU, v = 20 + Math.random() * 80;
        this.particles.push({ ...position, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: i % 3 === 0 ? SPECTRUM[i % 7] : color });
      }
    }
    if (this.floats.length < 15 && (p.id === selfId || event.critical)) {
      this.floats.push({ ...position, life: 1, color, text: event.type === 'levelup' ? 'LEVEL UP!' : event.type === 'boost' ? 'OVERDRIVE' : `${event.critical ? 'CRIT! ' : '+'}${Math.round(event.amount || 0)}` });
    }
    this.particles = this.particles.slice(-220);
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
    for (let lane = 2; lane >= 0; lane--) {
      const selected = me?.lane === lane;
      c.beginPath();
      for (let i = 0; i <= 180; i++) {
        const p = this.project(i / 180 * TAU, lane);
        if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
      }
      c.strokeStyle = selected ? '#b5a0dd75' : '#9b7abf32';
      c.lineWidth = selected ? 1.2 : 0.8;
      c.stroke();
      for (let i = 0; i < 60; i++) {
        const p = this.project(i / 60 * TAU, lane);
        c.fillStyle = i % 5 === 0 ? '#baa6d04d' : '#baa6d01c';
        c.fillRect(p.x - 1, p.y - 1, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }
    }
    // Refraction rays share the simulation's angle, so a visual hit is a real hit.
    const rays = state.rays?.length ? state.rays : SPECTRUM.slice(0, 4).map((color, i) => ({ angle: i * TAU / 4, color }));
    if (active || preview) rays.forEach((ray, i) => {
      const a = preview ? ray.angle + time * 0.16 : ray.angle + (ray.speed || 0) * clamp(extrapolation, 0, 0.65);
      const end = this.project(a, 2, 1.17);
      const start = { x: w / 2, y: h * 0.49 };
      const gradient = c.createLinearGradient(start.x, start.y, end.x, end.y);
      const color = /^#[\da-f]{6}$/i.test(ray.color) ? ray.color : SPECTRUM[i % 7];
      gradient.addColorStop(0, `${color}a0`); gradient.addColorStop(0.6, `${color}45`); gradient.addColorStop(1, `${color}00`);
      c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(end.x, end.y);
      c.strokeStyle = gradient; c.lineWidth = 1.5; c.stroke();
      c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(end.x + 7, end.y - 4); c.lineTo(end.x - 7, end.y + 4); c.closePath();
      c.fillStyle = gradient; c.globalAlpha = 0.16; c.fill(); c.globalAlpha = 1;
      if (!this.reducedMotion) {
        const t = (time * 0.65 + i * 0.23) % 1;
        c.beginPath(); c.arc(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, 2, 0, TAU);
        c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 10; c.fill(); c.shadowBlur = 0;
      }
    });
    // An arc behind each avatar makes spin speed and overdrive visible.
    const players = state.players.map((p, index) => {
      let angle = p.angle || index * TAU / Math.max(1, state.players.length);
      if (preview) angle = index * TAU / Math.max(1, state.players.length) + time * 0.16;
      else if (active) {
        const logicalNow = state.now + extrapolation * 1000;
        const stats = getStats(p, logicalNow);
        angle += stats.speed * (p.boostUntil > logicalNow ? 1.65 : 1) * (p.slingUntil > logicalNow ? 1 + stats.slingshot : 1) * [1.1, 1, 0.9][p.lane] * clamp(extrapolation, 0, 0.65);
      }
      const position = this.project(angle, p.lane);
      this.positions.set(p.id, position);
      if (active || preview) {
        c.beginPath();
        for (let j = 0; j < 25; j++) {
          const q = this.project(angle - j * 0.022, p.lane);
          if (!j) c.moveTo(q.x, q.y); else c.lineTo(q.x, q.y);
        }
        c.lineWidth = p.id === selfId ? 3 : 2; c.strokeStyle = `${p.color}65`; c.lineCap = 'round'; c.stroke();
      }
      return { p, position };
    }).sort((a, b) => a.position.y - b.position.y);
    const centerY = h * 0.49;
    players.filter((p) => p.position.y < centerY).forEach(({ p, position }) => this.drawPlayer(p, position, selfId, now));
    // Glass orb + the real Refract brand mark from the application's voice stage.
    const size = Math.min(48, w * 0.075);
    const halo = c.createRadialGradient(w / 2, centerY, 6, w / 2, centerY, size * 2.7);
    halo.addColorStop(0, '#ab7dff30'); halo.addColorStop(1, '#ab7dff00');
    c.fillStyle = halo; c.beginPath(); c.arc(w / 2, centerY, size * 2.7, 0, TAU); c.fill();
    const orb = c.createRadialGradient(w / 2 - size * 0.4, centerY - size * 0.5, 3, w / 2, centerY, size);
    orb.addColorStop(0, '#726084'); orb.addColorStop(0.3, '#35243f'); orb.addColorStop(0.8, '#22182f'); orb.addColorStop(1, '#4e365f');
    c.fillStyle = orb; c.strokeStyle = '#b78ce89a'; c.lineWidth = 1;
    c.beginPath(); c.arc(w / 2, centerY, size, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = '#c3a0e329'; c.beginPath(); c.arc(w / 2, centerY, size + 5, 0, TAU); c.stroke();
    if (this.logo.complete && this.logo.naturalWidth) c.drawImage(this.logo, w / 2 - size * 0.72, centerY - size * 0.72, size * 1.44, size * 1.44);
    c.textAlign = 'center'; c.font = '600 11px Inter, system-ui'; c.fillStyle = '#d2c4e3';
    c.fillText('THE REFRACT CORE', w / 2, centerY + size + 23);
    c.font = '9px ui-monospace, monospace'; c.fillStyle = '#80768d';
    c.fillText(state.surge?.active ? 'SOLAR SURGE' : 'CATCH THE LIGHT', w / 2, centerY + size + 39);
    players.filter((p) => p.position.y >= centerY).forEach(({ p, position }) => this.drawPlayer(p, position, selfId, now));
    this.targets = [];
    (state.pickups || []).forEach((pickup) => {
      const p = this.project(pickup.angle, pickup.lane, 1.08);
      this.targets.push({ ...p, id: pickup.id });
      const color = pickup.type === 'star' ? '#ffdc89' : '#b5a1ff';
      const pulse = this.reducedMotion ? 1 : 1 + Math.sin(time * 4) * 0.09;
      c.save(); c.translate(p.x, p.y); c.scale(pulse, pulse);
      c.fillStyle = `${color}16`; c.strokeStyle = `${color}75`; c.lineWidth = 1;
      c.beginPath(); c.arc(0, 0, 17, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 13;
      if (pickup.type === 'star') {
        c.beginPath(); for (let j = 0; j < 8; j++) { const a = j * TAU / 8 - Math.PI / 2, r = j % 2 ? 3.5 : 11; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
      } else {
        c.rotate(Math.PI / 4); c.fillRect(-6, -6, 12, 12); c.fillStyle = '#31274a'; c.fillRect(-2, -2, 4, 4);
      }
      c.restore();
    });
    this.canvas.style.cursor = this.targets.length ? 'crosshair' : 'default';
    this.particles.forEach((p) => { p.life -= dt * 1.7; p.x += p.vx * dt; p.y += p.vy * dt; c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.color; c.fillRect(p.x, p.y, 2.5, 2.5); });
    this.particles = this.particles.filter((p) => p.life > 0);
    this.floats.forEach((p) => { p.life -= dt * 0.8; p.y -= dt * 26; c.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); c.textAlign = 'center'; c.fillStyle = p.color; c.font = '700 12px Inter, system-ui'; c.fillText(p.text, p.x, p.y - 40); });
    this.floats = this.floats.filter((p) => p.life > 0);
    c.globalAlpha = 1;
  }

  drawPlayer(p, position, selfId, now) {
    const c = this.ctx;
    const { x, y } = position;
    const self = p.id === selfId;
    const s = this.width < 480 ? 30 : 42;
    const flash = this.flashes.get(p.id);
    if (flash?.until > now) {
      c.beginPath(); c.arc(x, y, s * 0.8 + (1 - (flash.until - now) / 650) * 18, 0, TAU);
      c.strokeStyle = `${flash.color}80`; c.lineWidth = 2; c.stroke();
    }
    c.save();
    c.shadowColor = p.color; c.shadowBlur = self ? 16 : 5;
    c.fillStyle = '#1c1c27'; c.strokeStyle = self ? p.color : `${p.color}80`; c.lineWidth = self ? 2 : 1;
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
    c.restore();
    c.textAlign = 'center'; c.fillStyle = self ? '#e7f6ed' : '#c3bccc'; c.font = `${self ? 700 : 500} 10px Inter, system-ui`;
    const name = self ? (p.name === 'You' ? 'YOU' : `${p.name.slice(0, 10)} · YOU`) : p.name.slice(0, 12);
    c.fillText(name, x, y + s / 2 + 17);
    if (p.bot) { c.font = '8px ui-monospace,monospace'; c.fillStyle = '#716b7d'; c.fillText('BOT', x, y + s / 2 + 29); }
    if (self) { c.fillStyle = p.color; c.beginPath(); c.moveTo(x - 3, y - s / 2 - 8); c.lineTo(x + 3, y - s / 2 - 8); c.lineTo(x, y - s / 2 - 4); c.fill(); }
    c.restore();
  }

  drawInitial(p, x, y) {
    const c = this.ctx;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = p.color; c.font = '700 15px Inter, system-ui'; c.fillText(p.name.charAt(0).toUpperCase(), x, y + 1); c.textBaseline = 'alphabetic';
  }

  destroy() { this.resizeObserver.disconnect(); this.canvas.removeEventListener('pointerdown', this.click); }
}
