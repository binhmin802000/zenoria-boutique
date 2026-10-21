// ============================================================
// scripts/patch-compte-etape11.mjs — ESPACE CLIENTE, étape 1.1 (page /compte, navigation, menu compte)
// ZENORIA_ACCOUNT_STEP11_V1
//
// Usage (dossier zenoria, branche espace-client) :
//   node scripts\patch-compte-etape11.mjs --dry-run   -> vérifie tout, n'écrit rien
//   node scripts\patch-compte-etape11.mjs             -> applique
// Crée pages/compte.js ; modifie pages/index.js (lien « Mon compte » dans le menu compte et le menu mobile,
// ouverture de la connexion via /?connexion=compte, retour automatique vers /compte après connexion).
// Sécurités habituelles : branche, fichier propre, repères uniques, rejouable, UTF-8 et fins de ligne conservés.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_ACCOUNT_STEP11_V1";
const BRANCH = "espace-client";
const DRY = process.argv.includes("--dry-run");
const NEW_FILES = {
  "pages/compte.js": "// ZENORIA_ACCOUNT_STEP11_V1\nimport React, { useCallback, useEffect, useState } from \"react\";\nimport Head from \"next/head\";\nimport { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut } from \"lucide-react\";\nimport { supabase } from \"@/lib/supabase\";\nimport { fetchReviewsSetting, DEFAULT_REVIEWS } from \"@/lib/reviewsSettings\";\n\n// ============================================================\n// PAGE « MON COMPTE » — /compte (espace cliente) · étape 1.1 : structure et navigation\n//\n// Page affichée côté navigateur (la session Supabase vit dans le navigateur), non indexée.\n// Non connectée ou session expirée : retour à l'accueil avec la fenêtre de connexion ouverte\n// (/?connexion=compte), puis retour automatique ici après la connexion (pages/index.js).\n// Rubriques accessibles par adresse directe : /compte#accueil, #commandes, #avis, #favoris, #profil, #donnees.\n// « Mes avis » : visible si l'interrupteur des avis est sur ON, ou pour l'administration.\n// Le contenu des rubriques arrive aux étapes suivantes (1.2 à 1.6 de la feuille de route).\n// ============================================================\n\nconst SECTIONS = [\n  { id: \"accueil\", label: \"Accueil\", icon: Home, step: \"1.3\" },\n  { id: \"commandes\", label: \"Mes commandes\", icon: Package, step: \"1.3\" },\n  { id: \"avis\", label: \"Mes avis\", icon: Star, step: \"1.4\", reviews: true },\n  { id: \"favoris\", label: \"Mes favoris\", icon: Heart, step: \"1.4\" },\n  { id: \"profil\", label: \"Profil & sécurité\", icon: UserCog, step: \"1.6\" },\n  { id: \"donnees\", label: \"Mes données\", icon: ShieldCheck, step: \"1.6\" },\n];\nconst RETURN_KEY = \"zenoria_return_to\";\n\nfunction readHash() {\n  if (typeof window === \"undefined\") return \"accueil\";\n  const h = window.location.hash.replace(\"#\", \"\");\n  return SECTIONS.some((s) => s.id === h) ? h : \"accueil\";\n}\n\nexport default function Compte() {\n  const [user, setUser] = useState(undefined); // undefined : vérification en cours ; null : non connectée\n  const [isAdmin, setIsAdmin] = useState(false);\n  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS);\n  const [section, setSection] = useState(\"accueil\");\n\n  const goLogin = useCallback(() => {\n    try {\n      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ to: \"/compte\" + window.location.hash, at: Date.now() }));\n    } catch (e) {\n      // stockage indisponible : la cliente reviendra simplement à l'accueil\n    }\n    window.location.replace(\"/?connexion=compte\");\n  }, []);\n\n  useEffect(() => {\n    let alive = true;\n    supabase.auth.getSession().then(async ({ data }) => {\n      const u = data && data.session ? data.session.user : null;\n      if (!alive) return;\n      if (!u) {\n        setUser(null);\n        goLogin();\n        return;\n      }\n      setUser(u);\n      const [adm, cfg] = await Promise.all([\n        supabase.from(\"admin_users\").select(\"user_id\").eq(\"user_id\", u.id).maybeSingle(),\n        fetchReviewsSetting(supabase),\n      ]);\n      if (!alive) return;\n      setIsAdmin(Boolean(adm && !adm.error && adm.data));\n      setReviewsCfg(cfg);\n    });\n    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {\n      if (event === \"SIGNED_OUT\" || !session) {\n        setUser(null);\n        window.location.replace(\"/\");\n      }\n    });\n    return () => {\n      alive = false;\n      if (listener && listener.subscription) listener.subscription.unsubscribe();\n    };\n  }, [goLogin]);\n\n  useEffect(() => {\n    const sync = () => setSection(readHash());\n    sync();\n    window.addEventListener(\"hashchange\", sync);\n    return () => window.removeEventListener(\"hashchange\", sync);\n  }, []);\n\n  const showReviews = Boolean(reviewsCfg.enabled || isAdmin);\n  const visible = SECTIONS.filter((s) => !s.reviews || showReviews);\n  const current = visible.find((s) => s.id === section) || visible[0];\n\n  const go = (id) => {\n    window.history.replaceState(null, \"\", \"#\" + id);\n    setSection(id);\n    window.scrollTo({ top: 0, behavior: \"smooth\" });\n  };\n\n  const logout = async () => {\n    await supabase.auth.signOut();\n    window.location.replace(\"/\");\n  };\n\n  return (\n    <div className=\"min-h-screen bg-[#fbf8f4] text-[#342b32]\">\n      <Head>\n        <title>Mon compte — Zenoria</title>\n        <meta name=\"robots\" content=\"noindex, nofollow\" />\n      </Head>\n\n      <header className=\"border-b border-[#eadfe4] bg-[#fbf8f4]/95\">\n        <div className=\"max-w-6xl mx-auto px-6 h-16 flex items-center justify-between\">\n          <a href=\"/\" className=\"font-serif text-xl tracking-[.22em] text-[#412f3b]\">ZENORIA</a>\n          <a href=\"/\" className=\"text-sm text-[#8f6075] underline\">Retour à la boutique</a>\n        </div>\n      </header>\n\n      {!user ? (\n        <main className=\"max-w-6xl mx-auto px-6 py-24 text-center text-sm text-[#8b737e]\" data-testid=\"account-loading\">\n          {user === null ? \"Redirection vers la connexion…\" : \"Chargement de votre espace…\"}\n        </main>\n      ) : (\n        <main className=\"max-w-6xl mx-auto px-4 sm:px-6 py-8\" data-testid=\"account-page\">\n          {/* BANDEAU D'ACCUEIL (image modifiable à l'étape 1.2) */}\n          <section\n            data-testid=\"account-hero\"\n            className=\"relative rounded-[1.5rem] overflow-hidden min-h-[170px] sm:min-h-[190px] flex items-end sm:items-center mb-6\"\n            style={{ background: \"linear-gradient(120deg,#fbf3ef 0%,#f6e4e6 55%,#efd9df 100%)\" }}\n          >\n            <div className=\"relative px-6 sm:px-8 py-6 max-w-md\">\n              <p className=\"text-[11px] uppercase tracking-[.25em] text-[#b48a5a]\">Mon compte</p>\n              <h1 className=\"font-serif text-3xl sm:text-4xl text-[#412f3b] mt-1\">Bonjour</h1>\n              <p className=\"text-xs text-[#8b737e] mt-1 truncate\">{user.email}</p>\n            </div>\n          </section>\n\n          <div className=\"grid lg:grid-cols-[230px_1fr] gap-6\">\n            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile */}\n            <nav aria-label=\"Rubriques de mon compte\" className=\"lg:self-start lg:sticky lg:top-4\">\n              <div className=\"flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible rounded-full lg:rounded-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5\">\n                {visible.map((s) => {\n                  const Icon = s.icon;\n                  const on = current && current.id === s.id;\n                  return (\n                    <button\n                      key={s.id}\n                      type=\"button\"\n                      onClick={() => go(s.id)}\n                      aria-current={on ? \"page\" : undefined}\n                      data-testid={`account-nav-${s.id}`}\n                      className={`shrink-0 flex items-center gap-2 whitespace-nowrap rounded-full lg:rounded-xl px-3.5 py-2 text-sm text-left ${on ? \"bg-[#f5edf1] text-[#412f3b] font-medium\" : \"text-[#54434c] hover:bg-[#fbf7f9]\"}`}\n                    >\n                      <Icon size={16} className=\"text-[#8f6075]\" /> {s.label}\n                    </button>\n                  );\n                })}\n                <button\n                  type=\"button\"\n                  onClick={logout}\n                  data-testid=\"account-logout\"\n                  className=\"hidden lg:flex items-center gap-2 rounded-xl px-3.5 py-2 mt-1 text-sm text-[#8b737e] border-t border-[#eadfe4] hover:bg-[#fbf7f9]\"\n                >\n                  <LogOut size={16} /> Se déconnecter\n                </button>\n              </div>\n            </nav>\n\n            {/* CONTENU DE LA RUBRIQUE */}\n            <section data-testid={`account-section-${current ? current.id : \"accueil\"}`} className=\"rounded-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px]\">\n              <h2 className=\"font-serif text-2xl text-[#412f3b]\">{current ? current.label : \"Accueil\"}</h2>\n              <p className=\"text-sm text-[#8b737e] mt-2\">\n                Cette rubrique sera bientôt disponible.\n                {isAdmin && current && <span className=\"block text-[11px] mt-1\">(Admin : contenu prévu à l&apos;étape {current.step} de la feuille de route.)</span>}\n              </p>\n              <button\n                type=\"button\"\n                onClick={logout}\n                className=\"lg:hidden mt-8 inline-flex items-center gap-2 text-sm text-[#8b737e] underline\"\n              >\n                <LogOut size={15} /> Se déconnecter\n              </button>\n            </section>\n          </div>\n        </main>\n      )}\n    </div>\n  );\n}\n"
};

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
function once(text, re, replacer, label) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const n = (text.match(g) || []).length;
  if (n !== 1) fail(`repère « ${label} » trouvé ${n} fois dans pages/index.js (1 attendu)`);
  return text.replace(re, replacer);
}

function patchIndex(t) {
  if (/href="\/compte"/.test(t)) fail("pages/index.js contient déjà un lien /compte : vérifiez à la main");
  if (!/\bUser\b[^\n]*from "lucide-react"/.test(t) && !/import\s*\{[^}]*\bUser\b[^}]*\}\s*from\s*"lucide-react"/.test(t)) fail("icône User de lucide-react introuvable dans pages/index.js");

  // 1. Menu compte (ordinateur) : « Mon compte » en premier lien
  t = once(
    t,
    /^([ \t]*)\{\/\* ZENORIA_REVIEWS_STEP1_V1 : avis ouverts, ou administration \(tests\) \*\/\}[ \t]*$/m,
    (m, ind) =>
      `${ind}{/* ${MARK} : espace cliente */}\n` +
      `${ind}<a href="/compte" data-testid="menu-account-link" className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b] mb-2">\n` +
      `${ind}  <User size={16} /> Mon compte\n` +
      `${ind}</a>\n${m}`,
    "commentaire ZENORIA_REVIEWS_STEP1_V1 du menu compte"
  );

  // 2. Menu mobile : « Mon compte » après « Administration »
  t = once(
    t,
    /^([ \t]*)\{isAdmin && <a href="\/admin" className="text-left text-\[#8f6075\]">Administration<\/a>\}[ \t]*$/m,
    (m, ind) => `${m}\n${ind}<a href="/compte" className="text-left text-[#8f6075]">Mon compte</a>`,
    "lien Administration du menu mobile"
  );

  // 3. Ouverture de la connexion (/?connexion=compte) et retour vers /compte après connexion
  t = once(
    t,
    /^([ \t]*)const \[reviewsPanelOpen, setReviewsPanelOpen\] = useState\(false\);[^\n]*$/m,
    (m, ind) =>
      `${m}\n` +
      [
        `// ${MARK} : arrivée depuis /compte sans session -> fenêtre de connexion ouverte`,
        `useEffect(() => {`,
        `  if (typeof window === "undefined") return;`,
        `  const params = new URLSearchParams(window.location.search);`,
        `  if (params.get("connexion") === "compte") {`,
        `    setAuthModalMode("login");`,
        `    setAuthModalOpen(true);`,
        `    window.history.replaceState(null, "", window.location.pathname + window.location.hash);`,
        `  }`,
        `}, []);`,
        `// ${MARK} : connexion réussie après une demande venant de /compte -> retour à l'espace cliente (10 min max)`,
        `useEffect(() => {`,
        `  if (!user || typeof window === "undefined") return;`,
        `  try {`,
        `    const raw = window.sessionStorage.getItem("zenoria_return_to");`,
        `    if (!raw) return;`,
        `    window.sessionStorage.removeItem("zenoria_return_to");`,
        `    const r = JSON.parse(raw);`,
        `    if (r && typeof r.to === "string" && r.to.startsWith("/compte") && Date.now() - r.at < 600000) window.location.href = r.to;`,
        `  } catch (e) {`,
        `    // valeur illisible : on reste sur l'accueil`,
        `  }`,
        `}, [user]);`,
      ].map((l) => ind + l).join("\n"),
    "état reviewsPanelOpen"
  );
  return t;
}

try {
  console.log(`\nEspace cliente · étape 1.1 (page /compte)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : créez-la ou passez dessus (git switch -c ${BRANCH})`);
  ok(`branche ${BRANCH}`);
  if (!fs.existsSync("lib/reviewsSettings.js") || !read("lib/reviewsSettings.js").text.includes("fetchReviewsSetting")) fail("lib/reviewsSettings.js (module avis) introuvable");
  ok("module avis présent");

  const index = read("pages/index.js");
  if (!index.text.includes(MARK)) {
    const dirty = git("status --porcelain -- pages/index.js");
    if (dirty) fail(`modifications locales non commitées sur pages/index.js :\n${dirty}`);
  }
  ok("pages/index.js identique au dernier commit");

  const writes = [];
  for (const [rel, content] of Object.entries(NEW_FILES)) {
    if (fs.existsSync(rel)) {
      if (read(rel).text === content) { info(`${rel} : déjà présent, identique`); continue; }
      fail(`${rel} existe déjà avec un contenu différent : renommez-le ou supprimez-le, puis relancez`);
    }
    writes.push({ rel, data: index.eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content, label: "créé" });
  }
  if (index.text.includes(MARK)) info("pages/index.js : déjà modifié, laissé tel quel");
  else writes.push({ rel: "pages/index.js", data: toDisk(index, patchIndex(index.text)), label: "modifié" });

  ok("tous les repères ont été trouvés");
  if (DRY) { console.log(`\nVérification réussie : ${writes.length} fichier(s) seraient écrits. Rien n'a été modifié.\n`); process.exit(0); }
  for (const w of writes) {
    fs.mkdirSync(path.dirname(w.rel), { recursive: true });
    fs.writeFileSync(w.rel, w.data, "utf8");
    ok(`${w.rel} ${w.label}`);
  }
  console.log(`\nTerminé : ${writes.length} fichier(s) écrit(s). Suite : npm run build, puis git status -sb.\n`);
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
