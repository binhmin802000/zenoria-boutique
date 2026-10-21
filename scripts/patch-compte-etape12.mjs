// ============================================================
// scripts/patch-compte-etape12.mjs — ESPACE CLIENTE, étape 1.2 (bandeau « Fondu lumineux » modifiable)
// ZENORIA_ACCOUNT_STEP12_V1
//
// Prérequis : contrainte site_media_slot_check élargie à 'account_hero' (SQL) ;
//             image par défaut public/images/compte-fondu-lumineux.jpg ; étape 1.1 appliquée.
// Usage (dossier zenoria, branche espace-client) :
//   node scripts\patch-compte-etape12.mjs --dry-run   -> vérifie tout, n'écrit rien
//   node scripts\patch-compte-etape12.mjs             -> applique
// Modifie : lib/supabase.js (emplacement account_hero, taille max réglable), components/AdminSiteMedia.js
// (carte « Bandeau de l'espace cliente », cadrage 21:9), pages/compte.js (bandeau image + voile),
// lib/diagnostics.js (libellé, facultatif).
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_ACCOUNT_STEP12_V1";
const PREV = "ZENORIA_ACCOUNT_STEP11_V1";
const BRANCH = "espace-client";
const DRY = process.argv.includes("--dry-run");
const COMPTE = "// ZENORIA_ACCOUNT_STEP11_V1 · ZENORIA_ACCOUNT_STEP12_V1\nimport React, { useCallback, useEffect, useState } from \"react\";\nimport Head from \"next/head\";\nimport { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut } from \"lucide-react\";\nimport { supabase, getMediaUrl, SITE_MEDIA_TABLE, SITE_SLOT_ACCOUNT_HERO } from \"@/lib/supabase\";\nimport { fetchReviewsSetting, DEFAULT_REVIEWS } from \"@/lib/reviewsSettings\";\n\n// ============================================================\n// PAGE « MON COMPTE » — /compte (espace cliente)\n//\n// Page affichée côté navigateur (la session Supabase vit dans le navigateur), non indexée.\n// Non connectée ou session expirée : retour à l'accueil avec la fenêtre de connexion ouverte\n// (/?connexion=compte), puis retour automatique ici après la connexion (pages/index.js).\n// Rubriques accessibles par adresse directe : /compte#accueil, #commandes, #avis, #favoris, #profil, #donnees.\n// « Mes avis » : visible si l'interrupteur des avis est sur ON, ou pour l'administration.\n// Bandeau (étape 1.2) : image de l'emplacement « account_hero » (Admin › Contenu du site), sinon image par\n// défaut public/images/compte-fondu-lumineux.jpg. Voile ivoire à gauche (ordinateur) ou en bas (mobile).\n// Le contenu des rubriques arrive aux étapes suivantes (1.3 à 1.6 de la feuille de route).\n// ============================================================\n\nconst SECTIONS = [\n  { id: \"accueil\", label: \"Accueil\", icon: Home, step: \"1.3\" },\n  { id: \"commandes\", label: \"Mes commandes\", icon: Package, step: \"1.3\" },\n  { id: \"avis\", label: \"Mes avis\", icon: Star, step: \"1.4\", reviews: true },\n  { id: \"favoris\", label: \"Mes favoris\", icon: Heart, step: \"1.4\" },\n  { id: \"profil\", label: \"Profil & sécurité\", icon: UserCog, step: \"1.6\" },\n  { id: \"donnees\", label: \"Mes données\", icon: ShieldCheck, step: \"1.6\" },\n];\nconst RETURN_KEY = \"zenoria_return_to\";\nconst DEFAULT_HERO = \"/images/compte-fondu-lumineux.jpg\";\n\nfunction readHash() {\n  if (typeof window === \"undefined\") return \"accueil\";\n  const h = window.location.hash.replace(\"#\", \"\");\n  return SECTIONS.some((s) => s.id === h) ? h : \"accueil\";\n}\n\nexport default function Compte() {\n  const [user, setUser] = useState(undefined); // undefined : vérification en cours ; null : non connectée\n  const [isAdmin, setIsAdmin] = useState(false);\n  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS);\n  const [section, setSection] = useState(\"accueil\");\n  const [heroUrl, setHeroUrl] = useState(DEFAULT_HERO);\n\n  const goLogin = useCallback(() => {\n    try {\n      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ to: \"/compte\" + window.location.hash, at: Date.now() }));\n    } catch (e) {\n      // stockage indisponible : la cliente reviendra simplement à l'accueil\n    }\n    window.location.replace(\"/?connexion=compte\");\n  }, []);\n\n  useEffect(() => {\n    let alive = true;\n    supabase.auth.getSession().then(async ({ data }) => {\n      const u = data && data.session ? data.session.user : null;\n      if (!alive) return;\n      if (!u) {\n        setUser(null);\n        goLogin();\n        return;\n      }\n      setUser(u);\n      const [adm, cfg, hero] = await Promise.all([\n        supabase.from(\"admin_users\").select(\"user_id\").eq(\"user_id\", u.id).maybeSingle(),\n        fetchReviewsSetting(supabase),\n        supabase.from(SITE_MEDIA_TABLE).select(\"path\").eq(\"slot\", SITE_SLOT_ACCOUNT_HERO).maybeSingle(),\n      ]);\n      if (!alive) return;\n      setIsAdmin(Boolean(adm && !adm.error && adm.data));\n      setReviewsCfg(cfg);\n      if (hero && !hero.error && hero.data && hero.data.path) setHeroUrl(getMediaUrl(hero.data.path, \"site\"));\n    });\n    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {\n      if (event === \"SIGNED_OUT\" || !session) {\n        setUser(null);\n        window.location.replace(\"/\");\n      }\n    });\n    return () => {\n      alive = false;\n      if (listener && listener.subscription) listener.subscription.unsubscribe();\n    };\n  }, [goLogin]);\n\n  useEffect(() => {\n    const sync = () => setSection(readHash());\n    sync();\n    window.addEventListener(\"hashchange\", sync);\n    return () => window.removeEventListener(\"hashchange\", sync);\n  }, []);\n\n  const showReviews = Boolean(reviewsCfg.enabled || isAdmin);\n  const visible = SECTIONS.filter((s) => !s.reviews || showReviews);\n  const current = visible.find((s) => s.id === section) || visible[0];\n\n  const go = (id) => {\n    window.history.replaceState(null, \"\", \"#\" + id);\n    setSection(id);\n    window.scrollTo({ top: 0, behavior: \"smooth\" });\n  };\n\n  const logout = async () => {\n    await supabase.auth.signOut();\n    window.location.replace(\"/\");\n  };\n\n  return (\n    <div className=\"min-h-screen bg-[#fbf8f4] text-[#342b32]\">\n      <Head>\n        <title>Mon compte — Zenoria</title>\n        <meta name=\"robots\" content=\"noindex, nofollow\" />\n      </Head>\n\n      <header className=\"border-b border-[#eadfe4] bg-[#fbf8f4]/95\">\n        <div className=\"max-w-6xl mx-auto px-6 h-16 flex items-center justify-between\">\n          <a href=\"/\" className=\"font-serif text-xl tracking-[.22em] text-[#412f3b]\">ZENORIA</a>\n          <a href=\"/\" className=\"text-sm text-[#8f6075] underline\">Retour à la boutique</a>\n        </div>\n      </header>\n\n      {!user ? (\n        <main className=\"max-w-6xl mx-auto px-6 py-24 text-center text-sm text-[#8b737e]\" data-testid=\"account-loading\">\n          {user === null ? \"Redirection vers la connexion…\" : \"Chargement de votre espace…\"}\n        </main>\n      ) : (\n        <main className=\"max-w-6xl mx-auto px-4 sm:px-6 py-8\" data-testid=\"account-page\">\n          {/* BANDEAU D'ACCUEIL : image modifiable dans Admin › Contenu du site (emplacement account_hero) */}\n          <section\n            data-testid=\"account-hero\"\n            className=\"relative rounded-[1.5rem] overflow-hidden min-h-[200px] sm:min-h-[210px] flex items-end sm:items-center mb-6 bg-[#f6e4e6] bg-cover bg-no-repeat bg-[position:78%_center] sm:bg-[position:right_center]\"\n            style={{ backgroundImage: `url(${heroUrl})` }}\n          >\n            <div aria-hidden=\"true\" className=\"absolute inset-0 hidden sm:block\" style={{ background: \"linear-gradient(90deg,rgba(251,248,244,.97) 0%,rgba(251,248,244,.85) 36%,rgba(251,248,244,0) 64%)\" }} />\n            <div aria-hidden=\"true\" className=\"absolute inset-0 sm:hidden\" style={{ background: \"linear-gradient(0deg,rgba(251,248,244,.97) 0%,rgba(251,248,244,.8) 42%,rgba(251,248,244,0) 78%)\" }} />\n            <div className=\"relative px-6 sm:px-8 py-6 max-w-md\">\n              <p className=\"text-[11px] uppercase tracking-[.25em] text-[#b48a5a]\">Mon compte</p>\n              <h1 className=\"font-serif text-3xl sm:text-4xl text-[#412f3b] mt-1\">Bonjour</h1>\n              <p className=\"text-xs text-[#8b737e] mt-1 truncate\">{user.email}</p>\n            </div>\n          </section>\n\n          <div className=\"grid lg:grid-cols-[230px_1fr] gap-6\">\n            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile */}\n            <nav aria-label=\"Rubriques de mon compte\" className=\"lg:self-start lg:sticky lg:top-4\">\n              <div className=\"flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible rounded-full lg:rounded-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5\">\n                {visible.map((s) => {\n                  const Icon = s.icon;\n                  const on = current && current.id === s.id;\n                  return (\n                    <button\n                      key={s.id}\n                      type=\"button\"\n                      onClick={() => go(s.id)}\n                      aria-current={on ? \"page\" : undefined}\n                      data-testid={`account-nav-${s.id}`}\n                      className={`shrink-0 flex items-center gap-2 whitespace-nowrap rounded-full lg:rounded-xl px-3.5 py-2 text-sm text-left ${on ? \"bg-[#f5edf1] text-[#412f3b] font-medium\" : \"text-[#54434c] hover:bg-[#fbf7f9]\"}`}\n                    >\n                      <Icon size={16} className=\"text-[#8f6075]\" /> {s.label}\n                    </button>\n                  );\n                })}\n                <button\n                  type=\"button\"\n                  onClick={logout}\n                  data-testid=\"account-logout\"\n                  className=\"hidden lg:flex items-center gap-2 rounded-xl px-3.5 py-2 mt-1 text-sm text-[#8b737e] border-t border-[#eadfe4] hover:bg-[#fbf7f9]\"\n                >\n                  <LogOut size={16} /> Se déconnecter\n                </button>\n              </div>\n            </nav>\n\n            {/* CONTENU DE LA RUBRIQUE */}\n            <section data-testid={`account-section-${current ? current.id : \"accueil\"}`} className=\"rounded-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px]\">\n              <h2 className=\"font-serif text-2xl text-[#412f3b]\">{current ? current.label : \"Accueil\"}</h2>\n              <p className=\"text-sm text-[#8b737e] mt-2\">\n                Cette rubrique sera bientôt disponible.\n                {isAdmin && current && <span className=\"block text-[11px] mt-1\">(Admin : contenu prévu à l&apos;étape {current.step} de la feuille de route.)</span>}\n              </p>\n              <button\n                type=\"button\"\n                onClick={logout}\n                className=\"lg:hidden mt-8 inline-flex items-center gap-2 text-sm text-[#8b737e] underline\"\n              >\n                <LogOut size={15} /> Se déconnecter\n              </button>\n            </section>\n          </div>\n        </main>\n      )}\n    </div>\n  );\n}\n";

const ok = (m) => console.log("  \u2713 " + m);
const info = (m) => console.log("  \u00b7 " + m);
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

function read(rel) {
  if (!fs.existsSync(rel)) fail(`fichier introuvable : ${rel} (lancez le script depuis le dossier zenoria)`);
  let text = fs.readFileSync(rel, "utf8");
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { rel, bom, eol, text: text.replace(/\r\n/g, "\n") };
}
const toDisk = (f, text) => (f.bom ? "\uFEFF" : "") + (f.eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text);
function once(text, re, replacer, label, file) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const n = (text.match(g) || []).length;
  if (n !== 1) fail(`repère « ${label} » trouvé ${n} fois dans ${file} (1 attendu)`);
  return text.replace(re, replacer);
}

const PATCHES = {
  "lib/supabase.js": (t) => {
    const f = "lib/supabase.js";
    t = once(t, /^export const SITE_SLOT_SAVOIR_FAIRE = "savoir_faire_photo";[^\n]*$/m,
      (m) => `${m}\nexport const SITE_SLOT_ACCOUNT_HERO = "account_hero"; // ${MARK} : bandeau de l'espace cliente (/compte), format 21:9`, "SITE_SLOT_SAVOIR_FAIRE", f);
    t = once(t, /maxSide: CIRCLE_PHOTO_MAX_SIDE,/,
      `maxSide: options.maxSide || CIRCLE_PHOTO_MAX_SIDE, // ${MARK} : taille réglable (bandeau large)`, "maxSide: CIRCLE_PHOTO_MAX_SIDE", f);
    return t;
  },

  "components/AdminSiteMedia.js": (t) => {
    const f = "components/AdminSiteMedia.js";
    t = once(t, /^([ \t]*)SITE_SLOT_SAVOIR_FAIRE,\n\} from "@\/lib\/supabase";/m,
      (m, ind) => `${ind}SITE_SLOT_SAVOIR_FAIRE,\n${ind}SITE_SLOT_ACCOUNT_HERO, // ${MARK}\n} from "@/lib/supabase";`, "import SITE_SLOT_SAVOIR_FAIRE", f);
    // constantes du bandeau
    t = once(t, /^const SAVOIR_VIEWS = [^\n]*$/m, (m) => [
      m,
      `// ${MARK} : bandeau de l'espace cliente (/compte), format large 21:9`,
      `const ACCOUNT_HERO_ASPECT = 21 / 9;`,
      `const ACCOUNT_HERO_MAX_SIDE = 1900;`,
      `const ACCOUNT_HERO_VIEWS = [`,
      `  { key: "hero-pc", label: "Mon compte, ordinateur", w: 448, h: 192 },`,
      `  { key: "hero-mobile", label: "Mon compte, mobile", w: 280, h: 200 },`,
      `];`,
    ].join("\n"), "const SAVOIR_VIEWS", f);
    // nouvelle carte, en fin de liste SLOTS
    t = once(t, /(replaceLabel: "Remplacer la photo",\n[ \t]*\},\n)(\];)/,
      (m, a, b) => a + [
        `  {`,
        `    // ${MARK}`,
        `    slot: SITE_SLOT_ACCOUNT_HERO,`,
        `    kind: "photo",`,
        `    wide: true,`,
        `    title: "Bandeau de l'espace cliente",`,
        `    description: "Affiché en haut de la page « Mon compte ». Format large ; un voile ivoire est ajouté à gauche (ordinateur) ou en bas (mobile) : placez le bijou plutôt à droite.",`,
        `    fallback: "Aucune image dédiée : la page « Mon compte » affiche l'image par défaut « Fondu lumineux ».",`,
        `    addLabel: "Ajouter une image",`,
        `    replaceLabel: "Remplacer l'image",`,
        `  },`,
      ].join("\n") + "\n" + b,
      "fin de la liste SLOTS (carte Savoir-faire)", f);
    // état + publication du cadrage large
    t = once(t, /^([ \t]*)const \[videoRequest, setVideoRequest\] = useState\(null\);[^\n]*$/m,
      (m, ind) => `${m}\n${ind}const [wideRequest, setWideRequest] = useState(null); // ${MARK} : { file, slot } (bandeau 21:9)`, "état videoRequest", f);
    t = once(t, /^([ \t]*)else setPhotoRequest\(\{ file, slot: cfg\.slot \}\);[ \t]*$/m,
      (m, ind) => `${ind}else if (cfg.wide) setWideRequest({ file, slot: cfg.slot }); // ${MARK}\n${m}`, "setPhotoRequest", f);
    t = once(t, /^([ \t]*)const finishVideo = \(result\) => \{/m,
      (m, ind) => [
        `// ${MARK} : bandeau large — recadrage 21:9, 1 900 px`,
        `const finishWide = (result) => {`,
        `  const req = wideRequest;`,
        `  setWideRequest(null);`,
        `  if (!req || result.action !== "crop") return;`,
        `  publish(req.slot, req.file, { crop: result.crop, maxSide: ACCOUNT_HERO_MAX_SIDE });`,
        `};`,
      ].map((l) => ind + l).join("\n") + "\n" + m, "const finishVideo", f);
    // aperçu : rectangle pour le bandeau, cercle pour les autres
    t = once(t, /className="h-36 w-36 shrink-0 rounded-full overflow-hidden bg-\[#f5edf1\] border border-white shadow-md grid place-items-center"/,
      'className={`${cfg.wide ? "h-24 w-56 rounded-xl" : "h-36 w-36 rounded-full"} shrink-0 overflow-hidden bg-[#f5edf1] border border-white shadow-md grid place-items-center`}',
      "aperçu en cercle (h-36 w-36)", f);
    // messages de retrait adaptés
    t = once(t, /Le site reviendra au média de la première collection\.`/,
      "${cfg.wide ? \"La page Mon compte reviendra à l'image par défaut.\" : \"Le site reviendra au média de la première collection.\"}`", "confirmation de retrait", f);
    // note sous la carte
    t = once(t, /^([ \t]*)Cadrage carré, découpé en cercle par le site\. Filigrane « © 2026 ZENORIA » au centre, tout en bas du cercle\.[ \t]*$/m,
      (m, ind) => `${ind}{cfg.wide ? "Cadrage large (21:9). Filigrane « © 2026 ZENORIA » centré en bas." : "Cadrage carré, découpé en cercle par le site. Filigrane « © 2026 ZENORIA » au centre, tout en bas du cercle."}`,
      "note « Cadrage carré… »", f);
    // fenêtre de cadrage large
    t = once(t, /^([ \t]*)\{\/\* CADRAGE ET TRAITEMENT DE LA VID[^\n]*\*\/\}[ \t]*$/m,
      (m, ind) => [
        `{/* ${MARK} : CADRAGE DU BANDEAU DE L'ESPACE CLIENTE (21:9) */}`,
        `{wideRequest && (`,
        `  <PhotoCropper`,
        `    file={wideRequest.file}`,
        `    onResult={finishWide}`,
        `    aspect={ACCOUNT_HERO_ASPECT}`,
        `    maxFrameW={640}`,
        `    views={ACCOUNT_HERO_VIEWS}`,
        `    position="cercle"`,
        `    watermarkUrl={WATERMARK_CIRCLE_URL}`,
        `    maxSide={ACCOUNT_HERO_MAX_SIDE}`,
        `    allowWhole={false}`,
        `  />`,
        `)}`,
      ].map((l) => ind + l).join("\n") + "\n" + m, "commentaire CADRAGE ET TRAITEMENT DE LA VIDÉO", f);
    return t;
  },
};

function patchDiagnostics(t) {
  const re = /label: row\.slot === "hero_video" \? "Vidéo d'accueil" : "Photo Savoir-faire"/;
  if (!re.test(t)) return null;
  return t.replace(re, `label: ({ hero_video: "Vidéo d'accueil", savoir_faire_photo: "Photo Savoir-faire", ring_animation_photo: "Photo de l'animation", account_hero: "Bandeau Mon compte" })[row.slot] || row.slot /* ${MARK} */`);
}

try {
  console.log(`\nEspace cliente · étape 1.2 (bandeau modifiable)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : passez sur ${BRANCH}`);
  ok(`branche ${BRANCH}`);
  if (!fs.existsSync("public/images/compte-fondu-lumineux.jpg")) fail("image par défaut absente : public/images/compte-fondu-lumineux.jpg");
  ok("image par défaut présente");
  const cropper = read("components/PhotoCropper.js").text;
  if (!/onResult/.test(cropper) || !/maxFrameW/.test(cropper) || !/allowWhole/.test(cropper)) fail("components/PhotoCropper.js n'a pas les réglages attendus (onResult, maxFrameW, allowWhole)");
  ok("fenêtre de cadrage compatible");

  const compte = read("pages/compte.js");
  if (!compte.text.includes(PREV)) fail("pages/compte.js ne vient pas de l'étape 1.1 (marqueur absent)");
  const touched = ["lib/supabase.js", "components/AdminSiteMedia.js", "pages/compte.js"].filter((r) => !read(r).text.includes(MARK));
  const dirty = touched.length ? git(`status --porcelain -- ${touched.join(" ")}`) : "";
  if (dirty) fail(`modifications locales non commitées :\n${dirty}\n  (commitez l'étape 1.1 avant de lancer ce script)`);
  ok("fichiers concernés identiques au dernier commit");

  const writes = [];
  for (const [rel, patch] of Object.entries(PATCHES)) {
    const f = read(rel);
    if (f.text.includes(MARK)) { info(`${rel} : déjà modifié, laissé tel quel`); continue; }
    writes.push({ rel, data: toDisk(f, patch(f.text)), label: "modifié" });
  }
  if (compte.text.includes(MARK)) info("pages/compte.js : déjà à jour, laissé tel quel");
  else writes.push({ rel: "pages/compte.js", data: toDisk(compte, COMPTE), label: "mis à jour" });

  if (fs.existsSync("lib/diagnostics.js")) {
    const d = read("lib/diagnostics.js");
    if (d.text.includes(MARK)) info("lib/diagnostics.js : déjà modifié");
    else {
      const nt = patchDiagnostics(d.text);
      if (nt) writes.push({ rel: "lib/diagnostics.js", data: toDisk(d, nt), label: "modifié (libellé des médias)" });
      else info("lib/diagnostics.js : repère du libellé non trouvé, laissé tel quel (sans conséquence)");
    }
  }

  ok("tous les repères ont été trouvés");
  if (DRY) { console.log(`\nVérification réussie : ${writes.length} fichier(s) seraient écrits. Rien n'a été modifié.\n`); process.exit(0); }
  for (const w of writes) { fs.writeFileSync(w.rel, w.data, "utf8"); ok(`${w.rel} ${w.label}`); }
  console.log(`\nTerminé : ${writes.length} fichier(s) écrit(s). Suite : npm run build, puis git status -sb.\n`);
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
