// ZENORIA - Lot A1b : deconnexion depuis Mon compte (meme fenetre que l'accueil)
// ============================================================
// Modifie UNIQUEMENT pages/compte.js. Tout ou rien : si un controle echoue, rien n'est ecrit.
//
// Le panier vit dans le navigateur (localStorage "zenoria_cart_v2", comme sur l'accueil).
//  - Panier vide : deconnexion directe (comme avant).
//  - Articles dans le panier : fenetre "Voulez-vous garder votre panier ?"
//       Oui     -> articles gardes, code promo retire, deconnexion
//       Non     -> panier vide, deconnexion
//       Rester connectee -> rien ne change
//  Les 2 boutons "Se deconnecter" (menu et mobile) passent par la meme fonction : aucun n'est modifie.
//
// Usage : node scripts/patch-compte-deconnexion-panier.mjs --dry-run | --apply
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) { console.error("Utilisez --dry-run ou --apply."); process.exit(2); }

const file = path.join(process.cwd(), "pages", "compte.js");
if (!fs.existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
const original = fs.readFileSync(file, "utf8");
const EOL = /\r\n/.test(original) ? "\r\n" : "\n";
const fail = (m) => { console.error(`ECHEC : ${m}\nAucune modification n'a ete ecrite.`); process.exit(1); };
const count = (h, n) => { let c = 0, p = 0; while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; } return c; };

if (original.includes("logoutAsk")) { console.log("Deja applique : rien a faire."); process.exit(0); }
if (!/import React, \{[^}]*useEffect[^}]*useState[^}]*\} from "react";|import React, \{[^}]*useState[^}]*useEffect[^}]*\} from "react";/.test(original))
  fail('prerequis : useEffect et useState doivent etre importes depuis "react".');

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}

// A — etats + touche Echap
{
  const i = findUnique("const [questionOpenId, setQuestionOpenId] = useState(null);", "etat questionOpenId (ancre)");
  const ind = indentOf(i);
  const block = [
    "const [logoutAsk, setLogoutAsk] = useState(false); // fenetre \"garder le panier ?\" a la deconnexion",
    "const [logoutCartCount, setLogoutCartCount] = useState(0);",
    "useEffect(() => {",
    "  if (!logoutAsk) return undefined;",
    "  const onKey = (e) => { if (e.key === \"Escape\") setLogoutAsk(false); };",
    "  window.addEventListener(\"keydown\", onKey);",
    "  return () => window.removeEventListener(\"keydown\", onKey);",
    "}, [logoutAsk]);",
  ].map((l) => ind + l);
  lines = [...lines.slice(0, i + 1), ...block, ...lines.slice(i + 1)];
  console.log("OK repere : etats de la fenetre de deconnexion");
}

// B — remplacement de la fonction logout
{
  const i = findUnique("const logout = async () => {", "fonction logout");
  if (lines[i + 1].trim() !== "await supabase.auth.signOut();" || lines[i + 2].trim() !== 'window.location.replace("/");' || lines[i + 3].trim() !== "};")
    fail("fonction logout : contenu inattendu (3 lignes attendues : signOut, replace, fermeture).");
  const ind = indentOf(i);
  const block = [
    "// Le panier est enregistre dans le navigateur (meme cle que pages/index.js).",
    "const CART_KEY = \"zenoria_cart_v2\";",
    "const readCartCount = () => {",
    "  try {",
    "    const raw = window.localStorage.getItem(CART_KEY);",
    "    const saved = raw ? JSON.parse(raw) : null;",
    "    return saved && Array.isArray(saved.items) ? saved.items.reduce((n, it) => n + (Number(it && it.qty) || 0), 0) : 0;",
    "  } catch (e) {",
    "    return 0;",
    "  }",
    "};",
    "const finishLogout = async (mode) => {",
    "  setLogoutAsk(false);",
    "  try {",
    "    const raw = window.localStorage.getItem(CART_KEY);",
    "    const saved = raw ? JSON.parse(raw) : null;",
    "    const items = mode === \"clear\" ? [] : saved && Array.isArray(saved.items) ? saved.items : [];",
    "    window.localStorage.setItem(CART_KEY, JSON.stringify({ items, promo: \"\" })); // le code promo ne suit jamais",
    "  } catch (e) {",
    "    // stockage illisible : on se deconnecte quand meme",
    "  }",
    "  await supabase.auth.signOut();",
    "  window.location.replace(\"/\");",
    "};",
    "const logout = async () => {",
    "  const n = readCartCount();",
    "  if (n > 0) {",
    "    setLogoutCartCount(n);",
    "    setLogoutAsk(true);",
    "    return;",
    "  }",
    "  await finishLogout(\"empty\");",
    "};",
  ].map((l) => ind + l);
  lines = [...lines.slice(0, i), ...block, ...lines.slice(i + 4)];
  console.log("OK repere : fonction logout remplacee (fenetre si le panier contient des articles)");
}

// C — fenetre, juste avant le bouton "Se deconnecter" mobile
{
  const i = findUnique('onClick={logout} className="lg:hidden', "bouton Se deconnecter mobile (ancre d'insertion)");
  const ind = indentOf(i);
  const block = [
    "{logoutAsk && (",
    '  <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="logout-cart-title" data-testid="logout-cart-dialog">',
    '    <div className="w-full max-w-sm rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">',
    '      <h3 id="logout-cart-title" className="font-serif text-xl text-[#412f3b]">Voulez-vous garder votre panier ?</h3>',
    '      <p className="mt-2 text-sm text-[#54434c]">Vous avez {logoutCartCount} article{logoutCartCount > 1 ? "s" : ""} dans votre panier.</p>',
    '      <button type="button" onClick={() => finishLogout("keep")} data-testid="logout-keep" className="mt-5 w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white h-11 text-sm font-medium transition">Oui, garder mes articles</button>',
    '      <button type="button" onClick={() => finishLogout("clear")} data-testid="logout-clear" className="mt-2 w-full rounded-full border border-[#82576c] text-[#82576c] hover:bg-[#f5edf1] h-11 text-sm font-medium transition">Non, vider le panier</button>',
    '      <button type="button" onClick={() => setLogoutAsk(false)} data-testid="logout-cancel" className="mt-3 block mx-auto text-sm text-[#8f6075] underline">Rester connectée</button>',
    "    </div>",
    "  </div>",
    ")}",
  ].map((l) => ind + l);
  lines = [...lines.slice(0, i), ...block, ...lines.slice(i)];
  console.log("OK repere : fenetre de deconnexion ajoutee");
}

const text = lines.join(EOL);

// Garde-fous finaux
for (const n of ["onClick={logout}"]) if (count(text, n) !== count(original, n)) fail(`garde-fou final : ${JSON.stringify(n)} ne doit pas changer (les boutons existants restent tels quels).`);
for (const [n, c] of [['data-testid="logout-keep"', 1], ['data-testid="logout-clear"', 1], ['data-testid="logout-cancel"', 1], ["const logout = async", 1], ["const finishLogout", 1], ["const readCartCount", 1]])
  if (count(text, n) !== c) fail(`garde-fou final : ${JSON.stringify(n)} attendu ${c} fois, trouve ${count(text, n)}.`);
if (count(text, "finishLogout(") !== 3) fail(`garde-fou final : finishLogout( attendu 3 fois (oui, non, panier vide), trouve ${count(text, "finishLogout(")}.`);
if (count(text, 'window.location.replace("/")') !== count(original, 'window.location.replace("/")')) fail("garde-fou final : le nombre de redirections vers l'accueil a change.");
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : boutons existants intacts, une seule redirection, fenetre branchee");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\compte.js"); }
