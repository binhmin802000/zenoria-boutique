// ============================================================
// seasonFx.js — l'animation saisonnière : feuilles, pétales, poussière de lumière ou flocons
//
// Une animation DISCRÈTE, dessinée sur un <canvas>, sans bibliothèque externe :
//  - 12 éléments sur ordinateur, 8 sur petit écran ; très transparents et très lents ;
//  - n'intercepte aucun clic (le canvas est en pointer-events: none, voir components/SeasonFx.js) ;
//  - coupée si la visiteuse a demandé moins de mouvement dans son système (prefers-reduced-motion) ;
//  - mise en pause quand elle n'est plus à l'écran, ou que l'onglet est masqué ;
//  - dessin limité à une résolution raisonnable (devicePixelRatio plafonné à 1,5).
// L'état est publié sur le canvas (data-fx-season, data-fx-running, data-fx-particles) pour les tests et le diagnostic.
// ============================================================

export const FX_COUNT_DESKTOP = 12;
export const FX_COUNT_MOBILE = 8;
export const FX_MOBILE_WIDTH = 640;

export function particleCount(width) {
  return width < FX_MOBILE_WIDTH ? FX_COUNT_MOBILE : FX_COUNT_DESKTOP;
}

export const FX_CONFIG = {
  printemps: { shape: "petal", colors: ["#f2a3b5", "#f8c9bb", "#ffffff", "#f4c07a"], size: [6, 11], vy: [8, 15], sway: [10, 24], alpha: 0.5 },
  ete: { shape: "glow", colors: ["#ffc75a", "#ffd98a", "#ffb43c"], size: [4, 8], vy: [-8, -3], sway: [6, 16], alpha: 0.9 },
  automne: { shape: "leaf", colors: ["#c8643b", "#d9a02b", "#a8452a", "#7b7a2c"], size: [8, 15], vy: [8, 17], sway: [14, 30], alpha: 0.48 },
  hiver: { shape: "flake", colors: ["#8fb0e2", "#a9c3ec", "#b8cdee"], size: [4, 7], vy: [8, 14], sway: [6, 14], alpha: 0.6 },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class SeasonFxEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    this.season = null;
    this.parts = [];
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.t = 0;
    this.last = 0;
    this.fade = 1;
    this.raf = 0;
    this.visible = true;
    this.destroyed = false;
    this.motionQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this._loop = (ts) => this.loop(ts);
    this._sync = () => this.sync();
    if (!this.ctx) return;

    if (typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting;
        this.sync();
      });
      this.io.observe(canvas);
    }
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement || canvas);
    }
    document.addEventListener("visibilitychange", this._sync);
    if (this.motionQuery && this.motionQuery.addEventListener) this.motionQuery.addEventListener("change", this._sync);
    this.resize();
    this.publish();
  }

  reduced() {
    return Boolean(this.motionQuery && this.motionQuery.matches);
  }

  canRun() {
    return Boolean(this.season) && this.visible && !document.hidden && !this.reduced() && !this.destroyed;
  }

  publish() {
    const d = this.canvas && this.canvas.dataset;
    if (!d) return;
    d.fxSeason = this.season || "";
    d.fxRunning = this.raf ? "1" : "0";
    d.fxParticles = String(this.parts.length);
  }

  resize() {
    if (!this.ctx) return;
    const host = this.canvas.parentElement || this.canvas;
    const r = host.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    if (this.season) this.seed();
    this.publish();
  }

  seed() {
    const cfg = FX_CONFIG[this.season];
    this.parts = [];
    if (!cfg) return;
    const n = particleCount(typeof window !== "undefined" ? window.innerWidth : FX_MOBILE_WIDTH);
    for (let i = 0; i < n; i++) {
      this.parts.push({
        bx: rnd(0, this.w),
        y: rnd(0, this.h),
        size: rnd(cfg.size[0], cfg.size[1]),
        vy: rnd(cfg.vy[0], cfg.vy[1]),
        amp: rnd(cfg.sway[0], cfg.sway[1]),
        freq: rnd(0.25, 0.6),
        phase: rnd(0, Math.PI * 2),
        rot: rnd(0, Math.PI * 2),
        vrot: rnd(-0.6, 0.6),
        color: pick(cfg.colors),
        tw: rnd(0.6, 1.4),
      });
    }
  }

  // key : « printemps » | « ete » | « automne » | « hiver » | null (aucune animation)
  setSeason(key) {
    if (!this.ctx) return;
    const k = key && FX_CONFIG[key] ? key : null;
    if (k !== this.season) {
      this.season = k;
      this.fade = 0;
      this.seed();
      if (!k) this.clear();
    }
    this.sync();
  }

  sync() {
    if (!this.ctx) return;
    if (this.canRun()) {
      if (!this.raf) {
        this.last = 0;
        this.raf = requestAnimationFrame(this._loop);
      }
    } else {
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
      if (!this.season || this.reduced()) this.clear();
    }
    this.publish();
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  loop(ts) {
    this.raf = 0;
    if (!this.canRun()) {
      this.publish();
      return;
    }
    if (!this.last) this.last = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.t += dt;
    this.fade = Math.min(1, this.fade + dt / 1.2);
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this._loop);
  }

  step(dt) {
    const margin = 30;
    for (const p of this.parts) {
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.vy > 0 && p.y > this.h + margin) {
        p.y = -margin;
        p.bx = rnd(0, this.w);
      }
      if (p.vy < 0 && p.y < -margin) {
        p.y = this.h + margin;
        p.bx = rnd(0, this.w);
      }
    }
  }

  draw() {
    const cfg = FX_CONFIG[this.season];
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!cfg) return;
    for (const p of this.parts) {
      const x = p.bx + Math.sin(this.t * p.freq + p.phase) * p.amp;
      ctx.save();
      ctx.translate(x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = cfg.alpha * this.fade;
      SHAPES[cfg.shape](ctx, p, this.t);
      ctx.restore();
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.io) this.io.disconnect();
    if (this.ro) this.ro.disconnect();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this._sync);
    if (this.motionQuery && this.motionQuery.removeEventListener) this.motionQuery.removeEventListener("change", this._sync);
    this.publish();
  }
}

// ------------------------------------------------------------
// Les quatre formes
// ------------------------------------------------------------
const SHAPES = {
  leaf(ctx, p) {
    const s = p.size;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.95, -s * 0.5, s * 0.75, s * 0.65, 0, s);
    ctx.bezierCurveTo(-s * 0.75, s * 0.65, -s * 0.95, -s * 0.5, 0, -s);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,30,10,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.9);
    ctx.lineTo(0, s * 0.85);
    ctx.stroke();
  },
  petal(ctx, p) {
    const s = p.size;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.5, s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.ellipse(-s * 0.12, -s * 0.2, s * 0.16, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  glow(ctx, p, t) {
    const s = p.size;
    const twinkle = 0.65 + 0.35 * Math.sin(t * p.tw + p.phase);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2);
    g.addColorStop(0, p.color);
    g.addColorStop(1, "rgba(255,214,120,0)");
    ctx.globalAlpha *= twinkle;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s * 2, 0, Math.PI * 2);
    ctx.fill();
  },
  flake(ctx, p) {
    const s = p.size;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * -s, Math.sin(a) * -s);
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    }
    ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  },
};
