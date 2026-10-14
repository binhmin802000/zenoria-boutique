// ============================================================
// DÉTOURAGE DE LA PHOTO D'UNE BAGUE (dans le navigateur, sans service externe)
//
// Entrée : une photo de bague sur fond neutre (fond clair ou gris, cône ou plateau blanc).
// Sortie : un PNG carré de 224 px, fond transparent, bague centrée, et sa couleur dominante.
// Seule cette bague détourée (environ 100 Ko) est envoyée au stockage, jamais la photo d'origine.
//
// Deux modes :
//  - « auto »   : la bague est colorée (ou sombre), le fond est clair et peu coloré. On retient les pixels colorés,
//                 puis la zone la plus grande et la plus ronde ; on referme les petits creux (cristaux argentés ou
//                 irisés du bord) et on remplit l'intérieur. Le curseur « sensibilité » règle le seuil de couleur.
//  - « circle » : cercle réglé à la main (position et taille), pour les photos où l'automatique se trompe
//                 (fond coloré, objet qui touche la bague).
//
// Les fonctions de calcul (cutoutRing) ne dépendent pas du navigateur ; seules loadWorkImage, rgbaToPngBlob et
// drawRgba utilisent un canvas, et seulement quand elles sont appelées.
// ============================================================

export const OUT_SIZE = 224;
export const WORK_MAX_SIDE = 1024; // taille maximale de la photo de travail
const ANALYSIS_MAX = 320; // taille de l'image sur laquelle on cherche la bague
const MARGIN = 1.04; // petite marge autour de la bague
const DEFAULT_COLOR = "#2e75c6";

export const DEFAULT_CUTOUT = {
  mode: "auto",
  sat: 0.2, // seuil de saturation (0,10 à 0,40) : plus il est bas, plus on retient de pixels
  circle: { x: 0.5, y: 0.5, d: 0.5 }, // centre et diamètre, en fraction de la photo (diamètre / plus petit côté)
};

// ---------------- image réduite (moyenne par blocs) ----------------
function boxDownscale(src, w, h, maxSide) {
  const sc = Math.min(1, maxSide / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * sc));
  const nh = Math.max(1, Math.round(h * sc));
  const out = new Uint8ClampedArray(nw * nh * 4);
  const fx = w / nw;
  const fy = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * fy)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * fx)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
        }
      }
      const o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { data: out, width: nw, height: nh, scale: nw / w };
}

// ---------------- morphologie (3 x 3, bords : dilatation = 0, érosion = 1) ----------------
function dilate(m, w, h, cross) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = m[i];
      if (!v) {
        if (x > 0 && m[i - 1]) v = 1;
        else if (x < w - 1 && m[i + 1]) v = 1;
        else if (y > 0 && m[i - w]) v = 1;
        else if (y < h - 1 && m[i + w]) v = 1;
        else if (!cross) {
          if (x > 0 && y > 0 && m[i - w - 1]) v = 1;
          else if (x < w - 1 && y > 0 && m[i - w + 1]) v = 1;
          else if (x > 0 && y < h - 1 && m[i + w - 1]) v = 1;
          else if (x < w - 1 && y < h - 1 && m[i + w + 1]) v = 1;
        }
      }
      o[i] = v;
    }
  }
  return o;
}

function erode(m, w, h, cross) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = m[i];
      if (v) {
        if (x > 0 && !m[i - 1]) v = 0;
        else if (x < w - 1 && !m[i + 1]) v = 0;
        else if (y > 0 && !m[i - w]) v = 0;
        else if (y < h - 1 && !m[i + w]) v = 0;
        else if (!cross) {
          if (x > 0 && y > 0 && !m[i - w - 1]) v = 0;
          else if (x < w - 1 && y > 0 && !m[i - w + 1]) v = 0;
          else if (x > 0 && y < h - 1 && !m[i + w - 1]) v = 0;
          else if (x < w - 1 && y < h - 1 && !m[i + w + 1]) v = 0;
        }
      }
      o[i] = v;
    }
  }
  return o;
}

// Fermeture avec un disque approché (octogone) : r dilatations puis r érosions, carré et croix en alternance
function closeDisc(m, w, h, r) {
  let a = m;
  for (let k = 0; k < r; k++) a = dilate(a, w, h, k % 2 === 1);
  for (let k = r - 1; k >= 0; k--) a = erode(a, w, h, k % 2 === 1);
  return a;
}

// ---------------- zones connexes ----------------
function components(mask, w, h) {
  const labels = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  const list = [];
  let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue;
    id++;
    let head = 0, tail = 0;
    queue[tail++] = s;
    labels[s] = id;
    let area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (head < tail) {
      const p = queue[head++];
      const px = p % w;
      const py = (p - px) / w;
      area++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          const q = yy * w + xx;
          if (mask[q] && !labels[q]) {
            labels[q] = id;
            queue[tail++] = q;
          }
        }
      }
    }
    list.push({ id, area, x0, x1, y0, y1, per: 0 });
  }
  // périmètre : pixels de la zone qui touchent l'extérieur (4 voisins)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = labels[i];
      if (!l) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || labels[i - 1] !== l || labels[i + 1] !== l || labels[i - w] !== l || labels[i + w] !== l) {
        list[l - 1].per++;
      }
    }
  }
  return { labels, list };
}

// Remplit l'intérieur : tout ce qui n'est pas relié au bord de l'image
function fillHoles(m, w, h) {
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (i) => {
    if (!m[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++];
    const px = p % w;
    const py = (p - px) / w;
    if (px > 0) push(p - 1);
    if (px < w - 1) push(p + 1);
    if (py > 0) push(p - w);
    if (py < h - 1) push(p + w);
  }
  const o = new Uint8Array(w * h);
  for (let i = 0; i < o.length; i++) o[i] = outside[i] ? 0 : 1;
  return o;
}

// ---------------- recherche automatique de la bague ----------------
function autoMask(small, sat) {
  const { data, width: w, height: h } = small;
  let fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    const v = mx / 255;
    fg[i] = s > sat || v < 0.3 ? 1 : 0;
  }
  fg = dilate(erode(fg, w, h, false), w, h, false); // ouverture : retire les points isolés
  const { labels, list } = components(fg, w, h);
  let best = null;
  let bestScore = -1;
  for (const c of list) {
    if (c.area < 0.01 * w * h) continue;
    const per = c.per * 0.9 || 1;
    const compact = Math.min(1, (4 * Math.PI * c.area) / (per * per));
    const score = c.area * compact * compact; // grande ET ronde
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  let m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = labels[i] === best.id ? 1 : 0;
  const r = Math.max(1, Math.round(Math.max(best.x1 - best.x0 + 1, best.y1 - best.y0 + 1) * 0.07));
  m = closeDisc(m, w, h, r); // reprend les cristaux argentés du bord
  m = fillHoles(m, w, h);
  return m;
}

function maskBox(m, w, h) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}

// Adoucit le bord : érosion d'un pixel, puis flou 3 x 3 (valeurs 0 à 1)
function softMask(m, w, h) {
  const e = erode(m, w, h, true);
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = e[i];
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += f[yy * w + xx];
          n++;
        }
      }
      o[y * w + x] = s / n;
    }
  }
  return o;
}

// ---------------- échantillonnage ----------------
function bilinear(data, w, h, x, y, ch) {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const get = (xx, yy) => {
    xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
    yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
    return data[(yy * w + xx) * ch];
  };
  return (get(x0, y0) * (1 - tx) + get(x0 + 1, y0) * tx) * (1 - ty) + (get(x0, y0 + 1) * (1 - tx) + get(x0 + 1, y0 + 1) * tx) * ty;
}

function bilinearMask(f, w, h, x, y) {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const get = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : f[yy * w + xx]);
  return (get(x0, y0) * (1 - tx) + get(x0 + 1, y0) * tx) * (1 - ty) + (get(x0, y0 + 1) * (1 - tx) + get(x0 + 1, y0 + 1) * tx) * ty;
}

// ---------------- couleur dominante ----------------
function rgbToHls(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, l, 0];
  const d = mx - mn;
  const s = l <= 0.5 ? d / (mx + mn) : d / (2 - mx - mn);
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return [h, l, s];
}

function hlsToRgb(h, l, s) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

const hex2 = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

// Teinte la plus présente parmi les pixels bien colorés de la bague, ramenée à une luminosité et une saturation
// lisibles sur un fond clair (un cœur trop pâle ou trop sombre se lirait mal)
export function dominantColor(rgba, size) {
  const bins = new Array(36).fill(0);
  const idx = [];
  for (let i = 0; i < size * size; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (a <= 200) continue;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    if (mx === 0 || Math.round((255 * d) / mx) <= 110 || mx <= 140) continue;
    let hue;
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
    const bin = Math.min(35, Math.floor(hue / 10));
    bins[bin]++;
    idx.push([i, bin]);
  }
  let best = -1;
  let bestN = 0;
  bins.forEach((n, k) => {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  });
  if (best < 0) return DEFAULT_COLOR;
  const rs = [], gs = [], bs = [];
  for (const [i, bin] of idx) {
    if (bin !== best) continue;
    rs.push(rgba[i * 4]); gs.push(rgba[i * 4 + 1]); bs.push(rgba[i * 4 + 2]);
  }
  const med = (a) => {
    a.sort((x, y) => x - y);
    const n = a.length;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  };
  let [h, l, s] = rgbToHls(med(rs), med(gs), med(bs));
  l = Math.min(Math.max(l, 0.48), 0.58);
  s = Math.min(Math.max(s, 0.62), 0.9);
  const [r, g, b] = hlsToRgb(h, l, s);
  return "#" + hex2(r * 255) + hex2(g * 255) + hex2(b * 255);
}

// ---------------- détourage ----------------
// work : { data: Uint8ClampedArray RGBA, width, height } (photo réduite à 1024 px au plus)
// Renvoie { ok, rgba (224 x 224 x 4), size, color } ou { ok: false, reason }
export function cutoutRing(work, options) {
  const o = Object.assign({}, DEFAULT_CUTOUT, options || {});
  const circle = Object.assign({}, DEFAULT_CUTOUT.circle, (options && options.circle) || {});
  const W = work.width;
  const H = work.height;

  let cx, cy, half;
  let maskAt; // (x, y) en pixels de la photo de travail -> opacité de 0 à 1

  if (o.mode === "circle") {
    const r = (Math.min(W, H) * Math.min(1, Math.max(0.05, circle.d))) / 2;
    cx = circle.x * W;
    cy = circle.y * H;
    half = r * MARGIN;
    const edge = Math.max(1, (2 * half) / OUT_SIZE) * 1.6; // bord adouci d'environ 1,5 pixel de sortie
    maskAt = (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      return Math.min(1, Math.max(0, (r - d) / edge + 0.5));
    };
  } else {
    const small = boxDownscale(work.data, W, H, ANALYSIS_MAX);
    const m = autoMask(small, Math.min(0.6, Math.max(0.05, o.sat)));
    if (!m) return { ok: false, reason: "Aucune bague repérée : essayez de baisser la sensibilité, ou passez au cercle manuel." };
    const box = maskBox(m, small.width, small.height);
    if (!box) return { ok: false, reason: "Aucune bague repérée : essayez de baisser la sensibilité, ou passez au cercle manuel." };
    const soft = softMask(m, small.width, small.height);
    const k = small.scale; // pixels « petite image » par pixel de la photo de travail
    cx = ((box.x0 + box.x1 + 1) / 2) / k;
    cy = ((box.y0 + box.y1 + 1) / 2) / k;
    half = (Math.max(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1) / 2 / k) * MARGIN;
    maskAt = (x, y) => bilinearMask(soft, small.width, small.height, x * k, y * k);
  }

  const out = new Uint8ClampedArray(OUT_SIZE * OUT_SIZE * 4);
  const dR = work.data;
  const dG = work.data.subarray(1);
  const dB = work.data.subarray(2);
  const step = (2 * half) / OUT_SIZE;
  const taps = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
  for (let j = 0; j < OUT_SIZE; j++) {
    for (let i = 0; i < OUT_SIZE; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const t of taps) {
        const sx = cx - half + (i + 0.5 + t[0]) * step;
        const sy = cy - half + (j + 0.5 + t[1]) * step;
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue; // hors de la photo : transparent
        const al = maskAt(sx, sy);
        r += bilinear(dR, W, H, sx, sy, 4) * al;
        g += bilinear(dG, W, H, sx, sy, 4) * al;
        b += bilinear(dB, W, H, sx, sy, 4) * al;
        a += al;
      }
      const p = (j * OUT_SIZE + i) * 4;
      if (a > 0) {
        // moyenne pondérée par l'opacité (pas de frange claire sur les bords), puis léger coup de contraste
        out[p] = (r / a - 8) * 1.06 + 6;
        out[p + 1] = (g / a - 8) * 1.06 + 6;
        out[p + 2] = (b / a - 8) * 1.06 + 6;
        out[p + 3] = (a / 4) * 255;
      }
    }
  }
  return { ok: true, rgba: out, size: OUT_SIZE, color: dominantColor(out, OUT_SIZE) };
}

// ============================================================
// Parties qui utilisent le navigateur (canvas) : appelées seulement depuis l'administration
// ============================================================

// Lit une photo choisie et la réduit à 1024 px au plus (l'orientation EXIF est respectée)
export async function loadWorkImage(file, maxSide = WORK_MAX_SIDE) {
  let bmp = null;
  let url = null;
  if (typeof createImageBitmap === "function") {
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      bmp = null;
    }
  }
  if (!bmp) {
    url = URL.createObjectURL(file);
    bmp = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Cette image n'a pas pu être lue."));
      img.src = url;
    });
  }
  const w0 = bmp.width || bmp.naturalWidth;
  const h0 = bmp.height || bmp.naturalHeight;
  const sc = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * sc));
  const h = Math.max(1, Math.round(h0 * sc));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  if (url) URL.revokeObjectURL(url);
  if (bmp.close) bmp.close();
  return { data, width: w, height: h };
}

// Dessine le résultat dans un canvas existant (aperçu)
export function drawRgba(canvas, rgba, size) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
}

// PNG à envoyer au stockage
export function rgbaToPngBlob(rgba, size) {
  const canvas = document.createElement("canvas");
  drawRgba(canvas, rgba, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Le PNG n'a pas pu être créé."))), "image/png");
  });
}
