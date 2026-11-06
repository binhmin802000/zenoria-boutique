#!/usr/bin/env node
// ============================================================
// patch-lotH5b-compte-panier.mjs  -  ZENORIA_ACCOUNT_PANIER_V1
//
// Lot H5b : icone compte fonctionnelle partout (quiz, 4 pages legales, Mon compte) et panier
// sur les 4 pages legales et Mon compte. « Option 2 » retenue : chaque page hors accueil lit sa
// propre session pour choisir le bon lien (connectee -> /compte ; sinon -> /?connexion=compte,
// mecanisme existant de pages/index.js). Aucune autre logique de session (fusion des favoris,
// reinitialisation de mot de passe) n'est dupliquee : elle reste reservee a l'accueil.
//
//  - lib/accountLink.js (nouveau) : fetchAccountHref(client), DEFAULT_ACCOUNT_HREF, safeLocalStorage()
//  - pages/quiz.js : reutilise la session DEJA lue (effet existant pour l'admin), sans appel
//    reseau supplementaire. Icone compte activee.
//  - pages/cgv.js, charte-des-avis.js, confidentialite.js, mentions-legales.js :
//    nouvel appel fetchAccountHref() au chargement (lecture locale dans la grande majorite des cas,
//    cf. doc Supabase sur getSession) ; panier active (showCart, lien "/#panier", deja gere par index.js)
//  - pages/compte.js : icone compte reactivee et mise en evidence (aucune action : on y est deja) ;
//    panier active, nouvel etat alimente par la fonction readCartCount() deja presente dans le fichier
//
// Hors perimetre : les favoris de Mon compte restent inchanges (coeur -> rubrique locale, lot H4).
//
// Utilisation (depuis la racine du projet) :
//   node scripts/patch-lotH5b-compte-panier.mjs --dry-run   (controle les ancres, n'ecrit rien)
//   node scripts/patch-lotH5b-compte-panier.mjs             (applique)
//
// Le script s'arrete sans rien ecrire si une ancre est absente, en double ou inattendue.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const MARK = "ZENORIA_ACCOUNT_PANIER_V1";

function stop(msg) {
  console.error("\nARRET : " + msg + "\nRien n'a ete ecrit.");
  process.exit(1);
}
const count = (s, sub) => s.split(sub).length - 1;

function read(rel) {
  const p = path.join(ROOT, ...rel.split("/"));
  if (!fs.existsSync(p)) stop(rel + " introuvable (lance le script depuis la racine du projet).");
  const raw = fs.readFileSync(p, "utf8");
  const crlf = (raw.match(/\r\n/g) || []).length;
  const lf = (raw.match(/\n/g) || []).length - crlf;
  if (crlf > 0 && lf > 0) stop(rel + " melange des fins de ligne CRLF et LF : je ne touche pas a un fichier dans cet etat.");
  return { rel, path: p, eol: crlf > 0 ? "\r\n" : "\n", text: raw.replace(/\r\n/g, "\n") };
}
function applyEdits(f, edits) {
  let t = f.text;
  for (const e of edits) {
    const n = count(t, e.from);
    if (n !== 1) stop(f.rel + " : ancre « " + e.label + " » trouvee " + n + " fois (attendu : 1). Le fichier a change depuis l'audit.");
    t = t.replace(e.from, () => e.to);
  }
  return t;
}
const toDisk = (f, t) => (f.eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t);
const results = [];

// ---------- 1. lib/accountLink.js (nouveau fichier) ----------
const ACCOUNT_LINK_PATH = path.join(ROOT, "lib", "accountLink.js");
if (fs.existsSync(ACCOUNT_LINK_PATH)) stop("lib/accountLink.js existe deja.");
const ACCOUNT_LINK_SRC = `// ============================================================
// lib/accountLink.js — ${MARK}
//
// Lien vers l'icone compte du header partage, pour les pages qui ne connaissent pas deja
// la session (quiz, pages legales) : connectee -> /compte ; sinon -> /?connexion=compte
// (l'accueil ouvre alors la fenetre de connexion, mecanisme existant : voir pages/index.js,
// ZENORIA_ACCOUNT_STEP11_V1). « Version simple » : un seul appel a la connexion de la page,
// sans suivre les changements de session ensuite (pas de onAuthStateChange ici).
// ============================================================
export const DEFAULT_ACCOUNT_HREF = "/?connexion=compte";

export async function fetchAccountHref(client) {
  try {
    const { data } = await client.auth.getSession();
    return data && data.session ? "/compte" : DEFAULT_ACCOUNT_HREF;
  } catch (e) {
    return DEFAULT_ACCOUNT_HREF;
  }
}

// Lecture du navigateur sans jamais lever d'erreur (meme principe que getLocalStorage() de pages/quiz.js)
export function safeLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}
`;

// ---------- 2. pages/quiz.js : reutilise la session deja lue, aucun appel reseau ajoute ----------
{
  const f = read("pages/quiz.js");
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans pages/quiz.js : lot deja applique.");
  const next = applyEdits(f, [
    {
      label: "import DEFAULT_ACCOUNT_HREF",
      from: 'import { readLocalFavorites } from "@/lib/favorites"; // ZENORIA_FAVORIS_V1\n',
      to:
        'import { readLocalFavorites } from "@/lib/favorites"; // ZENORIA_FAVORIS_V1\n' +
        'import { DEFAULT_ACCOUNT_HREF } from "@/lib/accountLink"; // ' + MARK + "\n",
    },
    {
      label: "etat accountHref",
      from: "  const [favCount, setFavCount] = useState(0);\n",
      to: "  const [favCount, setFavCount] = useState(0);\n  const [accountHref, setAccountHref] = useState(DEFAULT_ACCOUNT_HREF);\n",
    },
    {
      label: "lien compte dans l'effet admin existant (aucun appel reseau ajoute)",
      from:
        "        const { data } = await supabase.auth.getSession();\n" +
        "        const u = data && data.session ? data.session.user : null;\n" +
        "        if (!u) return;\n",
      to:
        "        const { data } = await supabase.auth.getSession();\n" +
        "        const u = data && data.session ? data.session.user : null;\n" +
        "        if (active) setAccountHref(u ? \"/compte\" : DEFAULT_ACCOUNT_HREF);\n" +
        "        if (!u) return;\n",
    },
    {
      label: "balise SiteHeader du quiz (showAccount)",
      from:
        "      <SiteHeader\n" +
        '        current="quiz"\n' +
        '        logoHref="/"\n' +
        "        showSearch={false}\n" +
        "        showAccount={false}\n" +
        "        showFavorites={true}\n" +
        "        favCount={favCount}\n" +
        '        onFavClick={() => window.location.assign("/#favoris")}\n' +
        "        cartCount={cartCount}\n" +
        "        onCartClick={openCart}\n" +
        "      />",
      to:
        "      <SiteHeader\n" +
        '        current="quiz"\n' +
        '        logoHref="/"\n' +
        "        showSearch={false}\n" +
        "        showAccount={true}\n" +
        '        onAccountClick={() => window.location.assign(accountHref)}\n' +
        "        showFavorites={true}\n" +
        "        favCount={favCount}\n" +
        '        onFavClick={() => window.location.assign("/#favoris")}\n' +
        "        cartCount={cartCount}\n" +
        "        onCartClick={openCart}\n" +
        "      />",
    },
  ]);
  results.push({ f, next });
}

// ---------- 3. Les 4 pages legales : compte + panier ----------
const LEGAL_PAGES = [
  { rel: "pages/cgv.js", needsSupabaseImport: false },
  { rel: "pages/charte-des-avis.js", needsSupabaseImport: false },
  { rel: "pages/confidentialite.js", needsSupabaseImport: true },
  { rel: "pages/mentions-legales.js", needsSupabaseImport: true },
];

const FAV_IMPORT_ANCHOR = 'import { readLocalFavorites } from "@/lib/favorites";\n';
const FAV_STATE_ANCHOR = "  const [favCount, setFavCount] = useState(0);\n";
const FAV_EFFECT_ANCHOR = "  useEffect(() => {\n    setFavCount(readLocalFavorites().length);\n  }, []);\n";
const SITE_HEADER_LEGAL_FROM =
  "      <SiteHeader\n" +
  '        logoHref="/"\n' +
  "        showSearch={false}\n" +
  "        showAccount={false}\n" +
  "        showFavorites={true}\n" +
  "        showCart={false}\n" +
  "        favCount={favCount}\n" +
  '        onFavClick={() => window.location.assign("/#favoris")}\n' +
  "      />";
const SITE_HEADER_LEGAL_TO =
  "      <SiteHeader\n" +
  '        logoHref="/"\n' +
  "        showSearch={false}\n" +
  "        showAccount={true}\n" +
  '        onAccountClick={() => window.location.assign(accountHref)}\n' +
  "        showFavorites={true}\n" +
  "        favCount={favCount}\n" +
  '        onFavClick={() => window.location.assign("/#favoris")}\n' +
  "        showCart={true}\n" +
  "        cartCount={cartCount}\n" +
  '        onCartClick={() => window.location.assign("/#panier")}\n' +
  "      />";

for (const page of LEGAL_PAGES) {
  const f = read(page.rel);
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans " + page.rel + " : lot deja applique.");
  if (!f.text.includes(FAV_IMPORT_ANCHOR)) stop(page.rel + " : le lot H5a (favoris) ne semble pas applique (import readLocalFavorites introuvable).");

  const edits = [];
  if (page.needsSupabaseImport) {
    edits.push({
      label: "import supabase",
      from: FAV_IMPORT_ANCHOR,
      to: 'import { supabase } from "@/lib/supabase";\n' + FAV_IMPORT_ANCHOR,
    });
  }
  edits.push({
    label: "imports accountLink et quizState",
    from: FAV_IMPORT_ANCHOR,
    to:
      FAV_IMPORT_ANCHOR +
      'import { fetchAccountHref, DEFAULT_ACCOUNT_HREF, safeLocalStorage } from "@/lib/accountLink"; // ' + MARK + "\n" +
      'import { cartCount as readCartCount } from "@/lib/quizState";\n',
  });
  edits.push({
    label: "etats accountHref et cartCount",
    from: FAV_STATE_ANCHOR,
    to: FAV_STATE_ANCHOR + "  const [accountHref, setAccountHref] = useState(DEFAULT_ACCOUNT_HREF);\n  const [cartCount, setCartCount] = useState(0);\n",
  });
  edits.push({
    label: "effet de lecture du lien compte et du panier",
    from: FAV_EFFECT_ANCHOR,
    to:
      FAV_EFFECT_ANCHOR +
      "  useEffect(() => {\n" +
      "    let alive = true;\n" +
      "    fetchAccountHref(supabase).then((href) => {\n" +
      "      if (alive) setAccountHref(href);\n" +
      "    });\n" +
      "    setCartCount(readCartCount(safeLocalStorage()));\n" +
      "    return () => {\n" +
      "      alive = false;\n" +
      "    };\n" +
      "  }, []);\n",
  });
  edits.push({ label: "balise SiteHeader (showAccount, showCart)", from: SITE_HEADER_LEGAL_FROM, to: SITE_HEADER_LEGAL_TO });

  const next = applyEdits(f, edits);
  results.push({ f, next });
}

// ---------- 4. pages/compte.js : icone compte en evidence (sans action), panier active ----------
{
  const f = read("pages/compte.js");
  if (f.text.includes(MARK)) stop("le marqueur " + MARK + " est deja present dans pages/compte.js : lot deja applique.");
  const next = applyEdits(f, [
    {
      label: "etat et lecture du panier, apres readCartCount()",
      from:
        "  const readCartCount = () => {\n" +
        "    try {\n" +
        '      const raw = window.localStorage.getItem(CART_KEY);\n' +
        "      const saved = raw ? JSON.parse(raw) : null;\n" +
        '      return saved && Array.isArray(saved.items) ? saved.items.reduce((n, it) => n + (Number(it && it.qty) || 0), 0) : 0;\n' +
        "    } catch (e) {\n" +
        "      return 0;\n" +
        "    }\n" +
        "  };\n",
      to:
        "  const readCartCount = () => {\n" +
        "    try {\n" +
        '      const raw = window.localStorage.getItem(CART_KEY);\n' +
        "      const saved = raw ? JSON.parse(raw) : null;\n" +
        '      return saved && Array.isArray(saved.items) ? saved.items.reduce((n, it) => n + (Number(it && it.qty) || 0), 0) : 0;\n' +
        "    } catch (e) {\n" +
        "      return 0;\n" +
        "    }\n" +
        "  };\n" +
        "  // " + MARK + " : badge du panier dans le header partage\n" +
        "  const [headerCartCount, setHeaderCartCount] = useState(0);\n" +
        "  useEffect(() => {\n" +
        "    setHeaderCartCount(readCartCount());\n" +
        "  }, []);\n",
    },
    {
      label: "balise SiteHeader de Mon compte (showAccount, showCart)",
      from: '      <SiteHeader logoHref="/" showSearch={false} showAccount={false} showCart={false} onFavClick={() => go("favoris")} />\n',
      to:
        "      <SiteHeader\n" +
        '        logoHref="/"\n' +
        "        showSearch={false}\n" +
        "        showAccount={true}\n" +
        '        onFavClick={() => go("favoris")}\n' +
        "        showCart={true}\n" +
        "        cartCount={headerCartCount}\n" +
        '        onCartClick={() => window.location.assign("/#panier")}\n' +
        "      />\n",
    },
  ]);
  results.push({ f, next });
}

// ---------- Rapport et ecriture ----------
console.log("Lot H5b - icone compte partout, panier sur les pages legales et Mon compte");
console.log(" - lib/accountLink.js : nouveau fichier (" + ACCOUNT_LINK_SRC.split("\n").length + " lignes)");
for (const { f, next } of results) {
  console.log(" - " + f.rel + " : " + f.text.split("\n").length + " -> " + next.split("\n").length + " lignes");
}

if (DRY) {
  console.log("\nDRY-RUN OK : toutes les ancres sont uniques et conformes. Rien n'a ete ecrit.");
  process.exit(0);
}
fs.writeFileSync(ACCOUNT_LINK_PATH, ACCOUNT_LINK_SRC, "utf8");
for (const { f, next } of results) fs.writeFileSync(f.path, toDisk(f, next), "utf8");
console.log("\nOK : fichiers ecrits. Lance maintenant : npm run build");
