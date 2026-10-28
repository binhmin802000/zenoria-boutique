// ZENORIA - Lot A3 (panier) : allegement de l'ecran 1
// ============================================================
// Modifie UNIQUEMENT pages/index.js. Tout ou rien : si un controle echoue, rien n'est ecrit.
//
//  1. "Livraison offerte" passe dans l'en-tete, a droite, a cote de la croix ; la barre de progression
//     devient un filet sous l'en-tete. Sur petit ecran (< 430 px), le texte passe sous le titre.
//  2. Le code promo et le detail des montants (sous-total, remise, livraison) passent dans la zone qui
//     defile, sous les articles. Le pied de panier ne garde que le total.
//  3. Virement : un seul bloc de texte (compte Zenoria necessaire + coordonnees bancaires apres validation),
//     sans pastilles. Les tuiles Carte / Virement n'ont plus de sous-titre. "Choisir la carte" disparait.
//  4. Visiteuse sans compte (virement) : un seul bouton "Creer mon compte" + lien "Me connecter".
//     Cliente connectee : le texte sur le compte disparait.
//  Stripe, case CGV, ligne "Deja cliente ?", ecrans Livraison / Recapitulatif et deconnexion ne changent pas.
//
// Usage : node scripts/patch-panier-a3-allegement.mjs --dry-run | --apply
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

if (original.includes('data-testid="transfer-info"')) { console.log("Deja applique : rien a faire."); process.exit(0); }
for (const need of ["recapStep", 'data-testid="transfer-recap-step"', "goToTransferRecap", "logoutAsk", 'data-testid="payment-method-choice"', "cart-qty-"])
  if (!original.includes(need)) fail(`prerequis : "${need}" absent. Appliquez d'abord les lots A1 et A2.`);

// Les classes "min-[430px]:" exigent Tailwind 3.2 ou plus.
try {
  const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", "tailwindcss", "package.json"), "utf8")).version;
  const [maj, min] = v.split(".").map(Number);
  if (maj < 3 || (maj === 3 && min < 2)) fail(`prerequis : Tailwind ${v} detecte ; la version 3.2 ou plus est necessaire (classes min-[430px]:).`);
  console.log(`OK prerequis : Tailwind ${v}`);
} catch (e) {
  console.log("Attention : version de Tailwind introuvable (node_modules absent ?). Verifiez qu'elle est >= 3.2.");
}

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
const pad = (arr, ind) => arr.map((l) => (l === "" ? "" : ind + l));
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}
function closeAt(start, trimmed, label) {
  const ind = indentOf(start);
  for (let k = start + 1; k < lines.length; k++) if (lines[k].trim() === trimmed && indentOf(k) === ind) return k;
  return fail(`${label} : fermeture ${JSON.stringify(trimmed)} introuvable.`);
}
function balanced(arr) {
  const t = arr.join("\n");
  const o = (t.match(/<div[\s>]/g) || []).length, c = (t.match(/<\/div>/g) || []).length;
  return o === c;
}
function mustContain(arr, list, label) {
  const t = arr.join("\n");
  for (const s of list) if (!t.includes(s)) fail(`${label} : "${s}" absent du bloc repere.`);
}
const EMOJI = "\u{1F389}";

// ---------- 1. constante showShipHeader
{
  const i = findUnique('const recapStep = paymentMethod === "transfer" && Boolean(user) && cartStep === "recap";', "etape recapitulatif");
  const iCart = lines.findIndex((l) => /^\s*const cartLines = /.test(l));
  const iShip = lines.findIndex((l) => l.includes("const [shippingCfg, setShippingCfg]"));
  if (iCart < 0 || iCart > i || iShip < 0 || iShip > i) fail("cartLines et shippingCfg doivent etre declares avant recapStep.");
  lines.splice(i + 1, 0, indentOf(i) + "const showShipHeader = !transferStep && !recapStep && cartLines.length > 0 && shippingCfg.enabled; // livraison offerte dans l'en-tete");
  console.log("OK repere : constante showShipHeader");
}

// ---------- 2. en-tete du panneau
{
  const t = findUnique('{transferStep ? "Livraison" : recapStep ? "Récapitulatif" : "Votre panier"}', "titre du panneau");
  const hs = t - 2;
  if (lines[t - 1].trim() !== '<div className="min-w-0">') fail('en-tete : <div className="min-w-0"> attendu juste avant le titre.');
  const HEAD = '<div className="flex-none flex justify-between items-center px-5 py-4 border-b border-[#eadfe4]">';
  if (lines[hs].trim() !== HEAD) fail("en-tete : ligne d'ouverture inattendue.");
  const hInd = indentOf(hs), tInd = indentOf(t);
  let metaEnd = -1;
  for (let k = t + 1; k < lines.length; k++) if (lines[k].trim() === ")}" && indentOf(k) === tInd) { metaEnd = k; break; }
  if (metaEnd < 0 || lines[metaEnd + 1].trim() !== "</div>" || indentOf(metaEnd + 1) !== indentOf(t - 1)) fail("en-tete : fin de la zone titre/compteur introuvable.");
  mustContain(lines.slice(t, metaEnd + 1), ["Vider le panier", "clearCart"], "en-tete (compteur)");
  const xi = findUnique('aria-label="Fermer le panier"', "bouton de fermeture du panier");
  if (!lines[xi].trim().startsWith('<button onClick={() => setCartOpen(false)} className="h-10 w-10')) fail("bouton de fermeture : forme inattendue.");
  if (lines[xi + 1].trim() !== "<X />" || lines[xi + 2].trim() !== "</button>" || lines[xi + 3].trim() !== "</div>" || indentOf(xi + 3) !== hInd || xi < metaEnd) fail("bouton de fermeture : structure inattendue.");

  const bInd = indentOf(xi);
  const xButton = lines.slice(xi, xi + 3).map((l) => "  " + l);
  const track = pad([
    "{showShipHeader && (",
    '  <div className="absolute left-0 right-0 -bottom-px h-[3px] bg-[#f0e6ea]" aria-hidden="true">',
    '    <div className="h-full bg-[#8f6075] transition-all" style={{ width: `${totals.freeShipping ? 100 : progress}%` }} />',
    "  </div>",
    ")}",
  ], bInd.slice(0, hInd.length + 2));
  const wrapper = [
    bInd + '<div className="flex items-center gap-2 shrink-0">',
    ...pad([
      "{showShipHeader && (",
      '  <div data-testid="ship-progress-right" className="hidden min-[430px]:flex items-center gap-1.5 text-[11px] leading-tight text-right text-[#54434c]">',
      '    <Truck size={14} className="text-[#8f6075] shrink-0" />',
      "    {totals.freeShipping ? (",
      `      <strong className="text-[12px] text-[#412f3b]">Livraison offerte ${EMOJI}</strong>`,
      "    ) : (",
      '      <div><strong className="block text-[12px] text-[#412f3b]">Plus que {formatPrice(totals.remaining)}</strong>pour la livraison offerte</div>',
      "    )}",
      "  </div>",
      ")}",
    ], bInd + "  "),
    ...xButton,
    bInd + "</div>",
  ];
  const narrow = pad([
    "{showShipHeader && (",
    '  <div data-testid="ship-progress-line" className="mt-2 flex items-center gap-1.5 text-xs text-[#54434c] min-[430px]:hidden">',
    '    <Truck size={14} className="text-[#8f6075] shrink-0" />',
    "    {totals.freeShipping ? (",
    `      <span className="font-semibold">Livraison offerte ${EMOJI}</span>`,
    "    ) : (",
    "      <span>Plus que <strong>{formatPrice(totals.remaining)}</strong> pour la livraison offerte</span>",
    "    )}",
    "  </div>",
    ")}",
  ], indentOf(t));
  // de bas en haut, pour garder les numeros de ligne valides
  lines.splice(xi + 3, 0, ...track);
  lines.splice(xi, 3, ...wrapper);
  lines.splice(metaEnd + 1, 0, ...narrow);
  lines[hs] = lines[hs].replace(HEAD, '<div className="relative flex-none flex justify-between items-center gap-3 px-5 py-4 border-b border-[#eadfe4]">');
  console.log("OK repere : en-tete (livraison offerte a droite, filet de progression, ligne sous le titre sur petit ecran)");
}

// ---------- 3. ancien bloc "livraison offerte" du corps : on ne garde que le message d'information
{
  const s = findUnique('<div className="flex-none px-5 pt-3 pb-2">', "ancien bloc livraison offerte");
  const e = closeAt(s, "</div>", "ancien bloc livraison offerte");
  const old = lines.slice(s, e + 1);
  mustContain(old, ["shippingCfg.enabled", "<Truck", "cartNotice", "Livraison offerte dès"], "ancien bloc livraison offerte");
  const ind = indentOf(s);
  lines.splice(s, e - s + 1, ...pad([
    "{cartNotice && (",
    '  <div className="flex-none px-5 pt-3">',
    '    <div className="text-xs rounded-lg bg-amber-50 text-amber-700 px-3 py-2">{cartNotice}</div>',
    "  </div>",
    ")}",
  ], ind));
  console.log("OK repere : ancien bloc livraison offerte retire du corps (message d'information conserve)");
}

// ---------- 4. code promo et montants : dans la zone qui defile ; total seul dans le pied
{
  const f = findUnique('flex-none border-t border-[#eadfe4] bg-white/80 px-5 ${tightFooter ?', "pied du panier");
  if (lines[f - 1].trim() !== "</div>") fail("pied du panier : fin de la zone qui defile attendue juste avant.");
  const ps = f + 1;
  if (lines[ps].trim() !== "{promo ? (") fail("code promo : debut de bloc attendu au debut du pied.");
  const pe = closeAt(ps, ")}", "code promo");
  const promoBlock = lines.slice(ps, pe + 1);
  mustContain(promoBlock, ["Vous avez un code promo ?", "applyPromo", "removePromo", "setPromoOpen"], "code promo");
  const as = pe + 1;
  if (!lines[as].trim().startsWith("<div className={`text-[#54434c] ${tightFooter ?")) fail("montants : debut de bloc attendu apres le code promo.");
  const ae = closeAt(as, "</div>", "montants");
  const amtBlock = lines.slice(as, ae + 1);
  mustContain(amtBlock, ["Sous-total", "Remise", "Livraison (France)", "Total TTC", "formatPrice(totals.total)"], "montants");
  const ts = lines.findIndex((l, i) => i > as && i < ae && l.includes("flex justify-between font-bold text-[#342b32] border-t"));
  if (ts < 0) fail("montants : ligne du total introuvable.");
  const rows = lines.slice(as + 1, ts); // sous-total, remise, livraison
  if (!balanced(rows) || !balanced(promoBlock)) fail("blocs promo / montants desequilibres.");
  const ind = indentOf(ps);

  const scrollAdd = [
    ...promoBlock,
    lines[as],
    ...rows,
    lines[ae],
    ...pad([
      "{shippingCfg.enabled && !totals.freeShipping && (",
      '  <div className="text-[11px] text-[#8b737e]">Livraison offerte dès {shippingCfg.threshold} € en France</div>',
      ")}",
    ], ind),
  ];
  const totalRow = pad([
    '<div data-testid="cart-total" className="flex justify-between font-bold text-base text-[#342b32]">',
    "  <span>Total TTC</span>",
    "  <span>{formatPrice(totals.total)}</span>",
    "</div>",
  ], ind);
  // un seul decoupage : [... zone qui defile + ajouts][fin de zone][ouverture du pied][total][suite du pied]
  lines = [...lines.slice(0, f - 1), ...scrollAdd, lines[f - 1], lines[f], ...totalRow, ...lines.slice(ae + 1)];
  console.log("OK repere : code promo et montants dans la zone qui defile ; total seul dans le pied");
}

// ---------- 5. choix du mode de paiement et bloc virement
{
  const s = findUnique("{paymentMethodsLoaded && paymentMethodsCfg.transfer_enabled && (", "bloc de choix du mode de paiement");
  if (!lines[s + 1].includes('data-testid="payment-method-choice"')) fail("choix du mode : data-testid attendu juste apres.");
  const e = closeAt(s, ")}", "bloc de choix du mode de paiement");
  const old = lines.slice(s, e + 1);
  mustContain(old, ['data-testid="payment-method-card"', 'data-testid="payment-method-transfer"', 'data-testid="transfer-only-notice"', 'data-testid="transfer-auth-required"', 'data-testid="transfer-auth-signup"', 'data-testid="transfer-auth-login"', 'data-testid="transfer-auth-back-card"'], "bloc de choix du mode");
  // les deux tuiles sont reprises telles quelles, sans leur sous-titre
  function tile(testid) {
    const rel = old.findIndex((l) => l.includes(`data-testid="${testid}"`));
    let b = rel; while (b >= 0 && old[b].trim() !== "<button") b--;
    let k = rel; while (k < old.length && old[k].trim() !== "</button>") k++;
    if (b < 0 || k >= old.length) fail(`tuile ${testid} : balises <button> introuvables.`);
    const chunk = old.slice(b, k + 1).filter((l) => !l.includes("text-[11px] text-[#8b737e] mt-0.5"));
    const base = chunk[0].match(/^(\s*)/)[1].length;
    return chunk.map((l) => l.slice(Math.min(base, l.match(/^(\s*)/)[1].length)));
  }
  const card = tile("payment-method-card"), tr = tile("payment-method-transfer");
  if (card.join("").includes("Paiement immédiat") || tr.join("").includes("à régler après validation")) fail("tuiles : un sous-titre n'a pas ete retire.");
  const ind = indentOf(s);
  const block = [
    "{paymentMethodsLoaded && paymentMethodsCfg.transfer_enabled && (",
    '  <div data-testid="payment-method-choice" className="space-y-2">',
    "    {paymentMethodsCfg.stripe_enabled && (",
    "      <>",
    '        <div className="sr-only">Moyen de paiement</div>',
    '        <div className="grid grid-cols-2 gap-2">',
    ...card.map((l) => "          " + l),
    ...tr.map((l) => "          " + l),
    "        </div>",
    "      </>",
    "    )}",
    '    {(paymentMethod === "transfer" || !paymentMethodsCfg.stripe_enabled) && (',
    '      <div data-testid="transfer-info" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-3 text-[12px] text-[#54434c] leading-5 space-y-1.5">',
    "        {!paymentMethodsCfg.stripe_enabled && (",
    '          <div data-testid="transfer-only-notice" className="text-[13px] font-medium text-[#412f3b]">Paiement par virement bancaire</div>',
    "        )}",
    "        {!user && (",
    '          <p data-testid="transfer-auth-required">Un compte Zenoria est nécessaire. Il se crée en quelques secondes, sans quitter votre panier, et vous donne accès à vos commandes, vos factures et au suivi de votre livraison.</p>',
    "        )}",
    "        <p>Après la validation de votre commande, vous recevez les coordonnées bancaires pour effectuer le virement.</p>",
    "      </div>",
    "    )}",
    "  </div>",
    ")}",
  ];
  if (!balanced(block)) fail("nouveau bloc de choix : balises desequilibrees.");
  lines.splice(s, e - s + 1, ...pad(block, ind));
  console.log("OK repere : choix du mode et bloc virement fusionne");
}

// ---------- 6. bouton principal : visiteuse + virement -> "Creer mon compte"
{
  const c = findUnique('onClick={paymentMethod === "transfer" ? () => {', "bouton principal du panier");
  if (lines[c - 1].trim() !== "<button") fail("bouton principal : <button attendu juste avant onClick.");
  const s = c - 1, e = closeAt(s, "</button>", "bouton principal");
  const old = lines.slice(s, e + 1);
  mustContain(old, ['data-testid="checkout-button"', "handleCheckout", "!paymentMethod"], "bouton principal");
  const ind = indentOf(s);
  const out = [
    ...pad([
      '{paymentMethod === "transfer" && !user ? (',
      "  <>",
      '    <button type="button" onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }} data-testid="transfer-auth-signup" className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition ${tightFooter ? "h-11" : "h-12"}`}>Créer mon compte</button>',
      '    <div className="text-[12px] text-center text-[#54434c]">',
      "      J&apos;ai déjà un compte · {\" \"}",
      '      <button type="button" onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }} data-testid="transfer-auth-login" className="underline text-[#8f6075]">Me connecter</button>',
      "    </div>",
      "  </>",
      ") : (",
    ], ind),
    ...old.map((l) => "  " + l),
    ind + ")}",
  ];
  lines.splice(s, e - s + 1, ...out);
  console.log('OK repere : bouton principal (visiteuse + virement : "Creer mon compte")');
}

const text = lines.join(EOL);

// ---------- garde-fous finaux
const same = ['fetch("/api/checkout"', 'fetch("/api/checkout-transfer"', 'data-testid="checkout-button"', 'data-testid="cgv-checkbox"', "const handleCheckout", "const submitTransferOrder", "const handleLogout", "const finishLogout",
  'data-testid="logout-keep"', 'data-testid="account-choice-line"', 'data-testid="no-payment-method-available"', "applyPromo", "removePromo", "Sous-total", "Total TTC", "formatPrice(totals.total)", "cartNotice", "setPromoOpen", "Vous avez un code promo ?",
  'data-testid="payment-method-card"', 'data-testid="payment-method-transfer"', 'data-testid="transfer-recap-step"', 'data-testid="transfer-submit-button"', "Je commande et je règle par virement", "cart-qty-"];
for (const n of same) if (count(text, n) !== count(original, n)) fail(`garde-fou final : ${JSON.stringify(n)} ne doit pas changer (avant ${count(original, n)}, apres ${count(text, n)}).`);
const exact = [['data-testid="transfer-info"', 1], ['data-testid="transfer-auth-required"', 1], ['data-testid="transfer-auth-signup"', 1], ['data-testid="transfer-auth-login"', 1], ['data-testid="transfer-auth-back-card"', 0],
  ["Pour ce mode de paiement", 0], ["Retrouver vos commandes", 0], ["Gérer vos données", 0], ["Commande réservée, à régler après validation", 0], ["Paiement immédiat et sécurisé", 0],
  ["Livraison offerte dès", 1], ["Plus que", 2], ["showShipHeader", 4], ['data-testid="cart-total"', 1], ['data-testid="ship-progress-right"', 1], ['data-testid="ship-progress-line"', 1], ["min-[430px]:", 2]];
for (const [n, c] of exact) if (count(text, n) !== c) fail(`garde-fou final : ${JSON.stringify(n)} attendu ${c} fois, trouve ${count(text, n)}.`);
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : Stripe, CGV, ecrans Livraison / Recapitulatif et deconnexion intacts ; nouveaux blocs presents");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else { fs.writeFileSync(file, text, "utf8"); console.log("Fichier modifie : pages\\index.js"); }
