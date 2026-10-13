// Animation « Le geste » : une main d'homme confie une bague à une main de femme, la pose, puis leurs mains
// s'enlacent tendrement. À la fin, un grand cœur apparaît au-dessus des mains et une étincelle s'allume sur la bague.
//
// - Vidéo au trait fin (12,8 s, environ 350 Ko, sans son), jouée UNE SEULE FOIS quand le composant entre dans l'écran.
// - La bague (photo détourée de la collection, `ringSrc`) et son ombre douce, le cœur, le halo et les étincelles
//   sont posés par-dessus, en code. La couleur du cœur, du halo et des étincelles vient de `crystalColor`
//   (couleur de la collection, de la saison active ou de la bague recommandée).
// - `speed` règle le rythme sans refaire la vidéo (1 = normal, 0.8 = plus lent, 1.25 = plus rapide).
// - Le fond de la vidéo est blanc et fusionné en « multiply » : il prend la couleur du fond de la page.
// - Visiteurs qui ont réduit les animations (ou vidéo impossible à lire) : image finale fixe, avec bague, cœur et étincelle.
//
// Fichiers à placer dans le dossier public/animations/ :
//   zenoria-geste.mp4, zenoria-geste.webm, zenoria-geste-fin.png, ring-collection-violette.png
import { useCallback, useEffect, useRef, useState } from "react";

/* ===== Noyau partagé : chronologie, cœur, étincelles, bague (aucune dépendance) ===== */
var RHV = (function () {
  var W = 1280, H = 704;
  var TL = {"DUR": 12.8, "REVEAL": [0.1, 1.7], "SWAY": [1.4, 2.2], "W_MOVE": [1.2, 3.9], "M_MOVE": [1.8, 4.8], "XFADE": [4.4, 5.2], "WIPE": [6.0, 7.8], "WC": [660, 390], "SOFT": 240, "LAG": 170, "RMAX": 835, "EXT": 1186.616, "HEART": {"stroke": [8.2, 9.9], "inner": [8.6, 10.3], "fill": [9.4, 10.8], "glow": [9.6, 11.0], "glowFade": [11.0, 12.2], "pulse": [10.8, 11.6]}, "HSTARS": [[10.2, 11.0, -192, -42, 30], [10.4, 11.2, 196, -20, 24], [10.6, 11.4, 172, -112, 18], [10.8, 11.6, -168, -112, 14]], "GLINT": [11.0, 11.6, 12.4], "HALO": [11.0, 11.8], "MSTARS": [[11.2, 11.9, 66, -10, 17], [11.4, 12.1, -48, -50, 13]]};                       // chronologie (source unique : timeline.py)
  var DUR = TL.DUR;
  var RING = { S0: [598, 229], S1: [650.6, 342.8], B: [672, 344], C: [645, 432], Rhold: 40, RB: 33, RC: 32 };
  var HEART = { x: 600, y: 150, u: 128 };

  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function sstep(x, a, b) { var t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function dist(x, y, c) { var dx = x - c[0], dy = y - c[1]; return Math.sqrt(dx * dx + dy * dy); }
  // le dessin apparaît en cercle depuis la bague tenue, puis se redessine en cercle depuis la bague posée
  function wipe(t, x, y, lag) { return smooth((sstep(t, TL.WIPE[0], TL.WIPE[1]) * TL.EXT - lag - dist(x, y, TL.WC)) / TL.SOFT); }
  function reveal(t, x, y) { return smooth((sstep(t, TL.REVEAL[0], TL.REVEAL[1]) * (TL.RMAX + 260) - dist(x, y, RING.S0)) / 260); }
  function f(v) { return (Math.round(v * 1000) / 1000).toString(); }
  function tr(x, y, rot, sc) { return 'translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(rot) + ') scale(' + f(sc) + ')'; }

  /* état de tous les éléments à l'instant t (fonction pure) */
  function attrsFor(t) {
    var a = {}, s = sstep(t, TL.M_MOVE[0], TL.M_MOVE[1]), c = sstep(t, TL.XFADE[0], TL.XFADE[1]);
    var sway = 1.6 * Math.sin(2 * Math.PI * t / 3.2) * (1 - sstep(t, TL.SWAY[0], TL.SWAY[1])); // même balancement que la main
    var lx = RING.S0[0] + (RING.S1[0] - RING.S0[0]) * s, ly = RING.S0[1] + (RING.S1[1] - RING.S0[1]) * s + sway;
    var x = lx + (RING.B[0] - lx) * c, y = ly + (RING.B[1] - ly) * c;
    var R = RING.Rhold + (RING.RB - RING.Rhold) * s;
    a.ringA = { transform: tr(x, y, -20 * (1 - s), R), opacity: reveal(t, RING.S0[0], RING.S0[1]) * (1 - wipe(t, RING.B[0], RING.B[1], 0)) };
    a.ringC = { transform: tr(RING.C[0], RING.C[1], 0, RING.RC), opacity: wipe(t, RING.C[0], RING.C[1], TL.LAG) };

    // cœur : tracé fin, double trait, remplissage, halo, petite pulsation
    var Hh = TL.HEART;
    var hs = sstep(t, Hh.stroke[0], Hh.stroke[1]), hi = sstep(t, Hh.inner[0], Hh.inner[1]);
    var hf = sstep(t, Hh.fill[0], Hh.fill[1]), hg = sstep(t, Hh.glow[0], Hh.glow[1]);
    var pulse = 1 + 0.035 * Math.sin(Math.PI * sstep(t, Hh.pulse[0], Hh.pulse[1]));
    a.heart = { transform: tr(HEART.x, HEART.y, 0, HEART.u * pulse) };
    a.heartL = { dash: 1 - hs, opacity: hs > 0 ? 1 : 0 };
    a.heartR = { dash: 1 - hs, opacity: hs > 0 ? 1 : 0 };
    a.heartIn = { dash: 1 - hi, opacity: hi > 0 ? 0.55 : 0 };
    a.heartFill = { opacity: 0.36 * hf };
    a.heartGlow = { opacity: 0.30 * hg * (1 - 0.35 * sstep(t, Hh.glowFade[0], Hh.glowFade[1])) };
    var i, k, st;
    for (i = 0; i < TL.HSTARS.length; i++) {
      st = TL.HSTARS[i]; k = sstep(t, st[0], st[1]);
      a['hs' + i] = { transform: tr(HEART.x + st[2], HEART.y + st[3], -35 * (1 - k), st[4] * k * (1 + 0.2 * Math.sin(Math.PI * k))), opacity: k };
    }
    // étincelle finale sur la bague
    var G = TL.GLINT, gin = sstep(t, G[0], G[1]);
    a.halo = { transform: tr(RING.C[0], RING.C[1], 0, 1 + 0.35 * sstep(t, TL.HALO[0], TL.HALO[1] + 0.8)), opacity: 0.55 * sstep(t, TL.HALO[0], TL.HALO[1]) * (1 - 0.4 * sstep(t, G[1], G[2])) };
    a.glint = { transform: tr(RING.C[0] + 40, RING.C[1] - 42, -20 * (1 - gin), 42 * (0.25 + 0.75 * gin)), opacity: gin * (1 - 0.5 * sstep(t, G[1], G[2])) };
    for (i = 0; i < TL.MSTARS.length; i++) {
      st = TL.MSTARS[i]; k = sstep(t, st[0], st[1]);
      a['ms' + i] = { transform: tr(RING.C[0] + st[2], RING.C[1] + st[3], -35 * (1 - k), st[4] * k * (1 + 0.2 * Math.sin(Math.PI * k))), opacity: k };
    }
    return a;
  }

  /* ---- bague dessinée en code (repli si aucune photo n'est fournie) ---- */
  function hexToHsl(hex) {
    var h = hex.replace('#', ''), r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), H_ = 0, S = 0, L = (mx + mn) / 2;
    if (mx !== mn) { var d = mx - mn; S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) H_ = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) H_ = (b - r) / d + 2; else H_ = (r - g) / d + 4; H_ *= 60; }
    return [H_, S, L];
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; var r, g, b;
    if (s === 0) { r = g = b = l; } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      var tt = function (x) { x = (x + 1) % 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
      r = tt(h + 1 / 3); g = tt(h); b = tt(h - 1 / 3); }
    var c = function (v) { var n = Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16); return n.length < 2 ? '0' + n : n; };
    return '#' + c(r) + c(g) + c(b);
  }
  function ringPalette(color, custom) {
    if (custom) return custom;
    var hs = hexToHsl(color), h = hs[0], s = Math.min(0.75, Math.max(0.35, hs[1]));
    return { outer: hsl(h - 10, s * 0.80, 0.30), outerHi: hsl(h - 10, s * 0.75, 0.46), mid: hsl(h, s * 0.85, 0.50), midHi: hsl(h, s * 0.80, 0.80),
      center: hsl(h, s * 0.95, 0.74), centerHi: hsl(h, s * 0.90, 0.93), bead: hsl(h, s * 0.70, 0.86), ab: '#f2bd8f', line: '#3b3535' };
  }
  function ringMarkup(p) {
    var rad = function (d) { return d * Math.PI / 180; }, ff = function (v) { return v.toFixed(3); };
    var pt = function (r, a) { return ff(r * Math.cos(a)) + ',' + ff(r * Math.sin(a)); };
    var sk = 'stroke="' + p.line + '" stroke-width="0.022" stroke-linejoin="round" stroke-linecap="round"';
    var s = '<circle r="0.97" fill="' + p.outer + '" ' + sk + '/>', i, a, hw, P0, P1, P2, P3;
    for (i = 0; i < 14; i++) {
      a = rad(i * 360 / 14 - 90); hw = rad(11.5); P0 = pt(0.56, a); P1 = pt(0.80, a - hw); P2 = pt(0.80, a + hw); P3 = pt(1.0, a);
      s += '<polygon points="' + P0 + ' ' + P1 + ' ' + P3 + ' ' + P2 + '" fill="' + p.outer + '" ' + sk + '/>';
      s += '<polygon points="' + P0 + ' ' + P1 + ' ' + P3 + '" fill="' + p.outerHi + '" opacity="0.6"/>';
      s += '<polygon points="' + pt(0.84, a - rad(3)) + ' ' + pt(0.95, a - rad(1)) + ' ' + pt(0.88, a + rad(4)) + '" fill="#fff" opacity="0.55"/>';
    }
    for (i = 0; i < 7; i++) {
      a = rad(i * 360 / 7 - 90 + 360 / 14); hw = rad(19); P0 = pt(0.26, a); P1 = pt(0.52, a - hw); P2 = pt(0.52, a + hw); P3 = pt(0.74, a);
      s += '<polygon points="' + P0 + ' ' + P1 + ' ' + P3 + ' ' + P2 + '" fill="' + p.mid + '" ' + sk + '/>';
      s += '<polygon points="' + P0 + ' ' + P1 + ' ' + P3 + '" fill="' + p.midHi + '" opacity="0.9"/>';
      s += '<polygon points="' + pt(0.40, a + rad(3)) + ' ' + pt(0.56, a + rad(9)) + ' ' + pt(0.66, a + rad(2)) + '" fill="' + p.ab + '" opacity="0.55"/>';
    }
    for (i = 0; i < 7; i++) {
      a = rad(i * 360 / 7 - 90); var xy = pt(0.50, a).split(','), bx = parseFloat(xy[0]), by = parseFloat(xy[1]);
      s += '<circle cx="' + ff(bx) + '" cy="' + ff(by) + '" r="0.075" fill="' + p.bead + '" ' + sk + '/>';
    }
    var oct = function (r, off) { var q = [], k; for (k = 0; k < 8; k++) q.push(pt(r, rad(k * 45 + off))); return q.join(' '); };
    s += '<polygon points="' + oct(0.33, 22.5) + '" fill="' + p.center + '" ' + sk + '/>';
    s += '<polygon points="' + oct(0.17, 0) + '" fill="' + p.centerHi + '" opacity="0.85" ' + sk + '/>';
    return s;
  }

  /* ---- calque complet (SVG 1280 x 704, posé sur la vidéo) ---- */
  var STAR = 'M0 -1Q0 0 1 0Q0 0 0 1Q0 0 -1 0Q0 0 0 -1Z';
  var HL = 'M0 0.95C-0.25 0.72 -1.05 0.20 -1.0 -0.28C-0.97 -0.72 -0.42 -0.92 -0.14 -0.62C-0.07 -0.54 -0.02 -0.48 0 -0.42';
  var HR = 'M0 0.95C0.25 0.72 1.05 0.20 1.0 -0.28C0.97 -0.72 0.42 -0.92 0.14 -0.62C0.07 -0.54 0.02 -0.48 0 -0.42';
  var HF = HL + 'C0.02 -0.48 0.07 -0.54 0.14 -0.62C0.42 -0.92 0.97 -0.72 1.0 -0.28C1.05 0.20 0.25 0.72 0 0.95Z';
  function at(a, k) {
    var o = a[k] || {}, s = '';
    if (o.transform) s += ' transform="' + o.transform + '"';
    var st = 'opacity:' + (o.opacity === undefined ? 1 : f(o.opacity));
    if (o.dash !== undefined) st += ';stroke-dashoffset:' + f(o.dash);
    return s + ' style="' + st + '"';
  }
  function overlayMarkup(color, custom, t, ringSrc) {
    var c = color, p = ringPalette(c, custom), a = attrsFor(t == null ? 0 : t), i;
    var star = function (k) { return '<path data-k="' + k + '" d="' + STAR + '" fill="' + c + '"' + at(a, k) + '/>'; };
    var s = '<defs><radialGradient id="rhvg"><stop offset="0" stop-color="' + c + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="rhvs"><stop offset="0.55" stop-color="#2a2020" stop-opacity="0.26"/><stop offset="1" stop-color="#2a2020" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="rhvh" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.6" stop-color="' + c + '" stop-opacity="1"/><stop offset="1" stop-color="' + c + '" stop-opacity="1"/></radialGradient></defs>';
    s += '<g data-k="heart"' + at(a, 'heart') + '>';
    s += '<circle data-k="heartGlow" r="1.45" cy="0.1" fill="url(#rhvg)"' + at(a, 'heartGlow') + '/>';
    s += '<path data-k="heartFill" d="' + HF + '" fill="url(#rhvh)"' + at(a, 'heartFill') + '/>';
    s += '<g fill="none" stroke="' + c + '" stroke-linecap="round" stroke-linejoin="round">';
    s += '<path data-k="heartL" d="' + HL + '" pathLength="1" stroke-width="0.026" stroke-dasharray="1"' + at(a, 'heartL') + '/>';
    s += '<path data-k="heartR" d="' + HR + '" pathLength="1" stroke-width="0.026" stroke-dasharray="1"' + at(a, 'heartR') + '/>';
    s += '<g transform="scale(0.86 0.86) translate(0 0.02)"><path data-k="heartIn" d="' + HF + '" pathLength="1" stroke-width="0.014" stroke-dasharray="1"' + at(a, 'heartIn') + '/></g>';
    s += '</g></g>';
    for (i = 0; i < TL.HSTARS.length; i++) s += star('hs' + i);
    var head = ringSrc
      ? '<ellipse cx="0.07" cy="0.11" rx="1.0" ry="0.96" fill="url(#rhvs)"/><image href="' + ringSrc + '" x="-1" y="-1" width="2" height="2" preserveAspectRatio="xMidYMid meet"/>'
      : ringMarkup(p);
    s += '<g data-k="ringA"' + at(a, 'ringA') + '>' + head + '</g>';
    s += '<circle data-k="halo" r="62" fill="url(#rhvg)"' + at(a, 'halo') + '/>';
    s += '<g data-k="ringC"' + at(a, 'ringC') + '>' + head + '</g>';
    s += star('glint');
    for (i = 0; i < TL.MSTARS.length; i++) s += star('ms' + i);
    return s;
  }
  function apply(refs, t) {
    var a = attrsFor(t), k, e, o;
    for (k in a) { e = refs[k]; if (!e) continue; o = a[k];
      if (o.transform) e.setAttribute('transform', o.transform);
      if (o.opacity !== undefined) e.style.opacity = o.opacity;
      if (o.dash !== undefined) e.style.strokeDashoffset = o.dash; }
  }
  return { W: W, H: H, DUR: DUR, TL: TL, attrsFor: attrsFor, overlayMarkup: overlayMarkup, apply: apply, ringPalette: ringPalette, RING: RING, HEART: HEART };
})();

export default function RingHandsVideo({
  crystalColor = "#9b7fd4", // couleur du cœur, du halo et des étincelles
  ringSrc = "/animations/ring-collection-violette.png", // photo détourée de la bague (PNG transparent, carré). null : bague dessinée
  ringColors = null,        // utilisé seulement si ringSrc est null : { outer, outerHi, mid, midHi, center, centerHi, bead, ab, line }
  speed = 1,                // rythme : 1 = normal
  src = "/animations/zenoria-geste.mp4",
  srcWebm = "/animations/zenoria-geste.webm",
  stillSrc = "/animations/zenoria-geste-fin.png",
  className = "",
  label = "Une main d'homme confie une bague à une main de femme, puis leurs mains s'enlacent sous un cœur",
}) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const svgRef = useRef(null);
  const refsRef = useRef({});
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const [still, setStill] = useState(false);

  // (Re)construit le calque quand la couleur change, puis le remet à l'instant courant
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = RHV.overlayMarkup(crystalColor, ringColors, still ? RHV.DUR : tRef.current, ringSrc);
    const refs = {};
    svg.querySelectorAll("[data-k]").forEach((e) => { refs[e.getAttribute("data-k")] = e; });
    refsRef.current = refs;
  }, [crystalColor, ringColors, ringSrc, still]);

  const paint = useCallback((t) => {
    tRef.current = t;
    RHV.apply(refsRef.current, t);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setStill(true);
      return undefined;
    }
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
    const loop = () => {
      if (!video) return;
      paint(video.currentTime);
      if (!video.paused && !video.ended) rafRef.current = requestAnimationFrame(loop);
    };
    const onPlay = () => { cancelAnimationFrame(rafRef.current); loop(); };
    const onEnded = () => paint(RHV.DUR);
    if (video) {
      video.addEventListener("play", onPlay);
      video.addEventListener("ended", onEnded);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect(); // lecture unique
          if (video) {
            video.playbackRate = speed;
            const p = video.play();
            if (p && p.catch) p.catch(() => setStill(true)); // lecture automatique refusée : image finale
          }
        }
      },
      { threshold: 0.4 }
    );
    io.observe(wrap);
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
      if (video) {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("ended", onEnded);
      }
    };
  }, [paint, speed]);

  const fill = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };

  return (
    <div
      ref={wrapRef}
      className={className}
      role="img"
      aria-label={label}
      style={{ position: "relative", width: "100%", aspectRatio: "1280 / 704" }}
    >
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stillSrc} alt="" style={{ ...fill, mixBlendMode: "multiply" }} />
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onError={() => setStill(true)}
          style={{ ...fill, mixBlendMode: "multiply" }}
        >
          <source src={srcWebm} type="video/webm" />
          <source src={src} type="video/mp4" />
        </video>
      )}
      <svg ref={svgRef} viewBox="0 0 1280 704" aria-hidden="true" style={{ ...fill, pointerEvents: "none", overflow: "visible" }} />
    </div>
  );
}
