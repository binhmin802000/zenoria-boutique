// ZENORIA - Lot A1 (panier) : corrections
// ============================================================
// Modifie UNIQUEMENT pages/index.js. Tout ou rien : si un controle echoue, rien n'est ecrit.
//
//  1. Le message d'erreur du panier est efface quand on ferme le panier.
//  2. Deconnexion : si le panier contient des articles, une fenetre demande de les garder.
//       Oui     -> articles gardes (seuls), deconnexion
//       Non     -> panier vide, deconnexion
//       Rester connectee -> rien ne change
//     Panier vide : deconnexion directe. Session expiree : aucune question, rien n'est efface.
//     Dans tous les cas : adresse saisie, case CGV, mode choisi, etape, erreurs et code promo sont effaces.
//  3. Total TTC plus petit et en gras (panier et ecran Livraison).
//  4. Quantite en vertical a droite de l'image ; la corbeille remplace le "-" quand la quantite vaut 1.
//     Une piece unique n'a pas de selecteur de quantite (comme avant).
//
// Usage : node scripts/patch-panier-a1-corrections.mjs --dry-run | --apply
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) { console.error("Utilisez --dry-run ou --apply."); process.exit(2); }

const file = path.join(process.cwd(), "pages", "index.js");
if (!fs.existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
const original = fs.readFileSync(file, "utf8");
const EOL = /\r\n/.test(original) ? "\r\n" : "\n";
const fail = (m) => { console.error(`ECHEC : ${m}\nAucune modification n'a ete ecrite.`); process.exit(1); };
const count = (h, n) => { let c = 0, p = 0; while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; } return c; };

if (original.includes("logoutAsk")) { console.log("Deja applique : rien a faire."); process.exit(0); }
for (const need of ["transferStep", "paymentMethodsLoaded", "submitTransferOrder"]) {
  if (!original.includes(need)) fail(`prerequis : "${need}" absent. Appliquez d'abord les patchs du parcours virement (3a, 3c/3d, ecran Livraison).`);
}

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}
function insertAfter(needle, label, build) {
  const i = findUnique(needle, label);
  lines = [...lines.slice(0, i + 1), ...build(indentOf(i)), ...lines.slice(i + 1)];
  console.log(`OK repere : ${label}`);
}
function insertBefore(needle, label, build) {
  const i = findUnique(needle, label);
  lines = [...lines.slice(0, i), ...build(indentOf(i)), ...lines.slice(i)];
  console.log(`OK repere : ${label}`);
}
function replaceInLine(needle, label, from, to) {
  const i = findUnique(needle, label);
  if (count(lines[i], from) !== 1) fail(`${label} : fragment a remplacer introuvable sur la ligne.`);
  lines[i] = lines[i].replace(from, to);
  console.log(`OK repere : ${label}`);
}

// 1a. etats
insertAfter('const [cartStep, setCartStep] = useState("cart");', "etats logoutAsk / logoutNotice", (ind) => [
  ind + 'const [logoutAsk, setLogoutAsk] = useState(false); // fenetre "garder le panier ?" a la deconnexion',
  ind + 'const [logoutNotice, setLogoutNotice] = useState(""); // message affiche apres la deconnexion',
]);

// 1b. erreur effacee a la fermeture du panier + message de deconnexion qui disparait seul
insertAfter("}, [cartOpen, paymentMethod, user, cartLines.length]);", "effets : erreur effacee a la fermeture, message de deconnexion", (ind) => [
  ind + "useEffect(() => {",
  ind + '  if (!cartOpen) setCheckoutError(""); // un message d erreur ne survit pas a la fermeture du panier',
  ind + "}, [cartOpen]);",
  ind + "useEffect(() => {",
  ind + "  if (!logoutNotice) return undefined;",
  ind + '  const t = setTimeout(() => setLogoutNotice(""), 5000);',
  ind + "  return () => clearTimeout(t);",
  ind + "}, [logoutNotice]);",
]);

// 1c. Echap ferme aussi la fenetre de deconnexion
insertAfter('if (e.key === "Escape") {', "touche Echap : ferme la fenetre de deconnexion", (ind) => [ind + "  setLogoutAsk(false);"]);

// 2. deconnexion
{
  const i = findUnique("const handleLogout = async () => {", "fonction handleLogout");
  if (lines[i + 1].trim() !== "await supabase.auth.signOut();" || lines[i + 2].trim() !== "setAccountMenuOpen(false);" || lines[i + 3].trim() !== "};")
    fail("handleLogout : contenu inattendu (3 lignes attendues).");
  const ind = indentOf(i);
  const block = [
    "// Deconnexion : avec des articles dans le panier, une fenetre demande s ils sont gardes.",
    "// Une session expiree ne passe pas par ici : rien n est efface dans ce cas.",
    "const resetCartPersonalState = () => {",
    '  setTransferShipping({ fullName: "", line1: "", line2: "", postalCode: "", city: "", phone: "" });',
    "  setCgvAccepted(false);",
    '  setCheckoutError("");',
    '  setCartStep("cart");',
    '  setCartNotice("");',
    '  setPromoCode("");',
    '  setPromoInput("");',
    '  setPromoError("");',
    "  setPromoOpen(false);",
    '  setPaymentMethod(paymentMethodsCfg.stripe_enabled ? "card" : "transfer");',
    "};",
    "const finishLogout = async (mode) => {",
    "  setLogoutAsk(false);",
    "  setAccountMenuOpen(false);",
    "  setMenu(false);",
    "  resetCartPersonalState();",
    '  if (mode === "clear") setCartItems([]);',
    "  await supabase.auth.signOut();",
    '  if (mode === "keep") setLogoutNotice("Vous êtes déconnectée. Votre panier est conservé sur cet appareil.");',
    '  else if (mode === "clear") setLogoutNotice("Vous êtes déconnectée. Votre panier a été vidé.");',
    '  else setLogoutNotice("Vous êtes déconnectée.");',
    "};",
    "const handleLogout = async () => {",
    "  setAccountMenuOpen(false);",
    "  if (cartItems.length > 0) {",
    "    setLogoutAsk(true);",
    "    return;",
    "  }",
    '  await finishLogout("empty");',
    "};",
  ].map((l) => ind + l);
  lines = [...lines.slice(0, i), ...block, ...lines.slice(i + 4)];
  console.log("OK repere : deconnexion (fenetre garder / vider)");
}

// 3. total TTC
replaceInLine('font-serif text-[#342b32] border-t border-[#eadfe4] ${tightFooter ? "text-lg pt-1.5" : "text-xl pt-2"}', "total TTC du panier",
  'font-serif text-[#342b32] border-t border-[#eadfe4] ${tightFooter ? "text-lg pt-1.5" : "text-xl pt-2"}',
  'font-bold text-[#342b32] border-t border-[#eadfe4] ${tightFooter ? "text-base pt-1.5" : "text-base pt-2"}');
replaceInLine("font-serif text-lg text-[#342b32] border-t border-[#eadfe4] pt-2 mt-2", "total a virer (ecran Livraison)",
  "font-serif text-lg", "font-bold text-base");

// 4a. corbeille du haut : reservee aux pieces uniques (pour les autres, la corbeille est dans le selecteur)
{
  const i = findUnique("onClick={() => removeLine(p)}", "corbeille du haut de la ligne d'article");
  if (lines[i - 1].trim() !== "<button") fail("corbeille du haut : <button attendu juste avant.");
  let close = -1;
  for (let k = i; k < Math.min(lines.length, i + 8); k++) if (lines[k].trim() === "</button>") { close = k; break; }
  if (close === -1) fail("corbeille du haut : fermeture </button> introuvable.");
  if (!lines.slice(i, close + 1).join(" ").includes("Trash2")) fail("corbeille du haut : icone Trash2 absente du bloc.");
  const ind = indentOf(i - 1);
  const inner = lines.slice(i - 1, close + 1).map((l) => "  " + l);
  lines = [...lines.slice(0, i - 1), ind + "{p.isUnique === true && (", ...inner, ind + ")}", ...lines.slice(close + 1)];
  console.log("OK repere : corbeille du haut reservee aux pieces uniques");
}

// 4b. ligne du bas : l'ancien selecteur horizontal disparait (le prix reste a droite)
{
  const u = findUnique("1 exemplaire</span>", "texte piece unique du panier");
  const start = u - 1;
  if (lines[start].trim() !== "{p.isUnique === true ? (") fail("ligne piece unique : debut de ternaire attendu juste avant.");
  const price = findUnique("formatPrice(effectivePrice(p) * qty)", "prix de la ligne d'article");
  if (lines[price - 1].trim() !== ")}") fail("prix : fermeture du ternaire attendue juste avant.");
  const old = lines.slice(start, price).join(" ");
  for (const t of ["changeQty(p, -1)", "changeQty(p, 1)", "Minus", "Plus"]) if (!old.includes(t)) fail(`ancien selecteur : ${t} absent du bloc repere.`);
  const ind = indentOf(start);
  const block = [
    "{p.isUnique === true ? (",
    '  <span className="text-xs text-[#8b737e]">Pièce unique · 1 exemplaire</span>',
    ") : (",
    "  <span />",
    ")}",
  ].map((l) => ind + l);
  lines = [...lines.slice(0, start), ...block, ...lines.slice(price)];
  console.log("OK repere : ancien selecteur de quantite retire de la ligne du bas");
}

// 4c. nouveau selecteur vertical, a droite de l'image
{
  const price = findUnique("formatPrice(effectivePrice(p) * qty)", "prix de la ligne d'article (2e passage)");
  const closes = [lines[price + 1], lines[price + 2], lines[price + 3]].map((l) => l.trim());
  if (closes.join("|") !== "</div>|</div>|</div>" || lines[price + 4].trim() !== ");")
    fail("fin de la carte d'article : structure </div></div></div>); attendue apres le prix.");
  const ind = indentOf(price + 2); // fermeture de la colonne d'informations
  const block = [
    "{p.isUnique !== true && (",
    '  <div data-testid={"cart-qty-" + p.id} className="flex flex-col items-center justify-between self-stretch shrink-0 w-8 rounded-full border border-[#d9c5cc] py-0.5">',
    "    <button",
    "      onClick={() => changeQty(p, 1)}",
    '      className="h-6 w-6 grid place-items-center rounded-full hover:bg-[#f5edf1]"',
    '      aria-label="Augmenter la quantité"',
    "    >",
    "      <Plus size={13} />",
    "    </button>",
    '    <span className="text-sm leading-none">{qty}</span>',
    "    <button",
    "      onClick={() => (qty <= 1 ? removeLine(p) : changeQty(p, -1))}",
    '      className="h-6 w-6 grid place-items-center rounded-full hover:bg-[#f5edf1]"',
    '      aria-label={qty <= 1 ? "Retirer " + p.name + " du panier" : "Diminuer la quantité"}',
    "    >",
    "      {qty <= 1 ? <Trash2 size={13} /> : <Minus size={13} />}",
    "    </button>",
    "  </div>",
    ")}",
  ].map((l) => ind + l);
  lines = [...lines.slice(0, price + 3), ...block, ...lines.slice(price + 3)];
  console.log("OK repere : selecteur de quantite vertical ajoute a droite de l'image");
}

// 2b. fenetre de deconnexion + message
insertBefore("{/* CONFIRMATION DE COMMANDE PAR VIREMENT", "fenetre de deconnexion et message", (ind) => [
  "{/* DECONNEXION : garder ou vider le panier ? */}",
  "{logoutAsk && (",
  '  <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="logout-cart-title" data-testid="logout-cart-dialog">',
  '    <div className="w-full max-w-sm rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl">',
  '      <h3 id="logout-cart-title" className="font-serif text-xl text-[#412f3b]">Voulez-vous garder votre panier ?</h3>',
  '      <p className="mt-2 text-sm text-[#54434c]">Vous avez {cartCount} article{cartCount > 1 ? "s" : ""} dans votre panier.</p>',
  '      <button type="button" onClick={() => finishLogout("keep")} data-testid="logout-keep" className="mt-5 w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white h-11 text-sm font-medium transition">Oui, garder mes articles</button>',
  '      <button type="button" onClick={() => finishLogout("clear")} data-testid="logout-clear" className="mt-2 w-full rounded-full border border-[#82576c] text-[#82576c] hover:bg-[#f5edf1] h-11 text-sm font-medium transition">Non, vider le panier</button>',
  '      <button type="button" onClick={() => setLogoutAsk(false)} data-testid="logout-cancel" className="mt-3 block mx-auto text-sm text-[#8f6075] underline">Rester connectée</button>',
  "    </div>",
  "  </div>",
  ")}",
  "{logoutNotice && (",
  '  <div role="status" data-testid="logout-notice" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] max-w-[90vw] rounded-full bg-[#412f3b] text-white text-sm px-5 py-2.5 shadow-lg text-center">{logoutNotice}</div>',
  ")}",
].map((l) => ind + l));

const text = lines.join(EOL);

// Garde-fous finaux
const same = ['data-testid="checkout-button"', 'data-testid="cgv-checkbox"', 'fetch("/api/checkout"', 'fetch("/api/checkout-transfer"', "Valider la commande avec obligation de paiement", "transfer-shipping-step", "submitTransferOrder"];
for (const n of same) if (count(text, n) !== count(original, n)) fail(`garde-fou final : ${JSON.stringify(n)} ne doit pas changer (avant ${count(original, n)}, apres ${count(text, n)}).`);
const exact = [['data-testid="logout-keep"', 1], ['data-testid="logout-clear"', 1], ['data-testid="logout-cancel"', 1], ['data-testid="logout-cart-dialog"', 1],
  ["changeQty(p, 1)", 1], ["changeQty(p, -1)", 1], ["const handleLogout", 1], ["const finishLogout", 1], ["text-xl pt-2", 0], ["font-serif text-lg text-[#342b32]", 0]];
for (const [n, c] of exact) if (count(text, n) !== c) fail(`garde-fou final : ${JSON.stringify(n)} attendu ${c} fois, trouve ${count(text, n)}.`);
if (count(text, "removeLine(p)") !== 2) fail(`garde-fou final : removeLine(p) attendu 2 fois (piece unique + selecteur), trouve ${count(text, "removeLine(p)")}.`);
if (count(text, "finishLogout(") !== 3) fail(`garde-fou final : finishLogout( attendu 3 fois (oui, non, panier vide), trouve ${count(text, "finishLogout(")}.`);
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : Stripe, virement, CGV et boutons existants inchanges ; nouveaux blocs presents");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\index.js"); }
