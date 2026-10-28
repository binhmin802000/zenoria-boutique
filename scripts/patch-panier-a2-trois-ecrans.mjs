// ZENORIA - Lot A2 (panier, virement) : trois ecrans
// ============================================================
// Modifie pages/index.js et cree pages/api/transfer-terms.js (si absent).
// Tout ou rien : si un controle echoue, rien n'est ecrit.
//
// Virement :
//   Ecran 1  Panier et mode de paiement (aucun mode pre-choisi quand les deux sont proposes ;
//            texte "compte Zenoria necessaire" avec pastilles ; Creer mon compte = bouton principal)
//   Ecran 2  Livraison (sans les articles) ; lien en gras "Retour au mode de paiement"
//   Ecran 3  Recapitulatif : articles, montants, TVA, adresse sur une ligne, reservation et delai,
//            case CGV, bouton "Je commande et je regle par virement" + "commande avec obligation de paiement"
// Carte : le parcours ne change pas (Commander + case CGV sur l'ecran 1).
//
// La duree de reservation est lue en base par une petite route publique (/api/transfer-terms) qui ne
// renvoie QUE le nombre de jours : jamais l'IBAN.
//
// Usage : node scripts/patch-panier-a2-trois-ecrans.mjs --dry-run | --apply
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) { console.error("Utilisez --dry-run ou --apply."); process.exit(2); }

const file = path.join(process.cwd(), "pages", "index.js");
const routeFile = path.join(process.cwd(), "pages", "api", "transfer-terms.js");
if (!fs.existsSync(file)) { console.error(`Fichier introuvable : ${file}`); process.exit(1); }
const original = fs.readFileSync(file, "utf8");
const EOL = /\r\n/.test(original) ? "\r\n" : "\n";
const fail = (m) => { console.error(`ECHEC : ${m}\nAucune modification n'a ete ecrite.`); process.exit(1); };
const count = (h, n) => { let c = 0, p = 0; while ((p = h.indexOf(n, p)) !== -1) { c++; p += n.length; } return c; };

if (original.includes("recapStep")) { console.log("Deja applique : rien a faire."); process.exit(0); }
for (const need of ["logoutAsk", "transferStep", 'data-testid="transfer-shipping-form"', "paymentMethodsLoaded", "submitTransferOrder"])
  if (!original.includes(need)) fail(`prerequis : "${need}" absent. Appliquez d'abord le lot A1 et les patchs du parcours virement.`);

let lines = original.split(/\r\n|\n/);
const indentOf = (i) => lines[i].match(/^(\s*)/)[1];
function findUnique(needle, label) {
  const idxs = [];
  lines.forEach((l, i) => { if (l.includes(needle)) idxs.push(i); });
  if (idxs.length !== 1) fail(`${label} : attendu 1 ligne contenant ${JSON.stringify(needle)}, trouve ${idxs.length}.`);
  return idxs[0];
}
const put = (arr, ind) => arr.map((l) => (l === "" ? "" : ind + l));
function insertAfter(needle, label, build) { const i = findUnique(needle, label); lines = [...lines.slice(0, i + 1), ...put(build, indentOf(i)), ...lines.slice(i + 1)]; console.log(`OK repere : ${label}`); }
function insertBefore(needle, label, build) { const i = findUnique(needle, label); lines = [...lines.slice(0, i), ...put(build, indentOf(i)), ...lines.slice(i)]; console.log(`OK repere : ${label}`); }
function replaceInLine(needle, label, from, to) {
  const i = findUnique(needle, label);
  if (count(lines[i], from) !== 1) fail(`${label} : fragment a remplacer introuvable sur la ligne.`);
  lines[i] = lines[i].replace(from, to);
  console.log(`OK repere : ${label}`);
}
function blockEnd(start, trimmed, label) {
  const ind = indentOf(start);
  for (let k = start + 1; k < lines.length; k++) if (lines[k].trim() === trimmed && indentOf(k) === ind) return k;
  return fail(`${label} : fin de bloc (${JSON.stringify(trimmed)}) introuvable.`);
}
const raw = (s) => s.replace(/^\n/, "").replace(/\n$/, "").split("\n");

// ---------- 1. aucun mode pre-choisi quand les deux sont proposes
replaceInLine('const [paymentMethod, setPaymentMethod] = useState("card");', "mode de paiement : aucun choix d'avance", 'useState("card")', "useState(null)");
{
  const e = findUnique("}, [paymentMethodsCfg.stripe_enabled, paymentMethodsCfg.transfer_enabled]);", "effet de selection automatique");
  if (lines[e - 3].trim() !== "useEffect(() => {" || !lines[e - 2].includes('setPaymentMethod("card")') || !lines[e - 1].includes('setPaymentMethod("transfer")'))
    fail("effet de selection automatique : contenu inattendu.");
  const ind = indentOf(e - 3);
  lines = [...lines.slice(0, e - 3), ...put(raw(String.raw`
useEffect(() => {
  if (!paymentMethodsLoaded) return; // quand les deux modes sont proposes, la cliente choisit elle-meme
  if (paymentMethodsCfg.stripe_enabled && !paymentMethodsCfg.transfer_enabled) setPaymentMethod("card");
  else if (!paymentMethodsCfg.stripe_enabled && paymentMethodsCfg.transfer_enabled) setPaymentMethod("transfer");
}, [paymentMethodsLoaded, paymentMethodsCfg.stripe_enabled, paymentMethodsCfg.transfer_enabled]);
`), ind), ...lines.slice(e + 1)];
  console.log("OK repere : selection automatique seulement si un seul mode est propose");
}
replaceInLine('setPaymentMethod(paymentMethodsCfg.stripe_enabled ? "card" : "transfer");', "deconnexion : mode de paiement remis a zero",
  'paymentMethodsCfg.stripe_enabled ? "card" : "transfer"',
  '(paymentMethodsCfg.stripe_enabled && paymentMethodsCfg.transfer_enabled) ? null : (paymentMethodsCfg.stripe_enabled ? "card" : "transfer")');

// ---------- 2. etats, effet de lecture du delai, validation de l'ecran Livraison
insertAfter('const [logoutNotice, setLogoutNotice] = useState("");', "etat transferDelayDays", ['const [transferDelayDays, setTransferDelayDays] = useState(null); // duree de reservation (jours), lue en base']);
insertAfter('const transferStep = paymentMethod === "transfer" && Boolean(user) && cartStep === "shipping";', "etape recapitulatif",
  ['const recapStep = paymentMethod === "transfer" && Boolean(user) && cartStep === "recap";']);
insertAfter("}, [logoutNotice]);", "lecture de la duree de reservation", raw(String.raw`
useEffect(() => {
  if (!recapStep || transferDelayDays !== null) return undefined;
  let alive = true;
  fetch("/api/transfer-terms")
    .then((r) => r.json())
    .then((d) => { if (alive && d && d.ok && Number.isInteger(d.delayDays)) setTransferDelayDays(d.delayDays); })
    .catch(() => {});
  return () => { alive = false; };
}, [recapStep, transferDelayDays]);
`));
{
  const c = findUnique("// Virement : la commande est creee cote serveur", "commentaire de submitTransferOrder");
  if (!lines[c + 1].includes("const submitTransferOrder = async () => {")) fail("submitTransferOrder : fonction attendue juste apres son commentaire.");
  lines = [...lines.slice(0, c), ...put(raw(String.raw`
// Ecran Livraison -> Recapitulatif : l'adresse doit etre complete avant de continuer.
const goToTransferRecap = () => {
  const okAddress = transferShipping.fullName.trim() && transferShipping.line1.trim() && transferShipping.city.trim() && /^[0-9]{5}$/.test(transferShipping.postalCode.trim());
  if (!okAddress) {
    setCheckoutError("Merci de compléter votre adresse de livraison (code postal à 5 chiffres).");
    return;
  }
  setCheckoutError("");
  setCartStep("recap");
};
`), indentOf(c)), ...lines.slice(c)];
  console.log("OK repere : validation Livraison -> Recapitulatif");
}

// ---------- 3. titre du panneau
replaceInLine('{transferStep ? "Livraison" : "Votre panier"}', "titre du panneau", '{transferStep ? "Livraison" : "Votre panier"}', '{transferStep ? "Livraison" : recapStep ? "Récapitulatif" : "Votre panier"}');

// ---------- 4. ecran 1 : texte "compte Zenoria necessaire"
{
  const s = findUnique('{paymentMethod === "transfer" && !user && (', "bloc de connexion du virement");
  if (!lines[s + 1].includes('data-testid="transfer-auth-required"')) fail("bloc de connexion : data-testid attendu juste apres.");
  const e = blockEnd(s, ")}", "bloc de connexion du virement");
  const ind = indentOf(s);
  lines = [...lines.slice(0, s), ...put(raw(String.raw`
{paymentMethod === "transfer" && !user && (
  <div data-testid="transfer-auth-required" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-3 text-[12px] text-[#54434c] leading-5">
    <div className="text-[13px] font-medium text-[#412f3b]">Pour ce mode de paiement, un compte Zenoria est nécessaire.</div>
    <p className="mt-1">Rien de compliqué : il se crée en quelques secondes, sans quitter votre panier.</p>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {["Créer le compte sans quitter le panier", "Retrouver vos commandes", "Suivre votre livraison", "Gérer vos données"].map((t) => (
        <span key={t} className="rounded-full border border-[#e6d8de] bg-white px-2 py-0.5 text-[11px] text-[#54434c]">{t}</span>
      ))}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => { setAuthModalMode("signup"); setAuthModalOpen(true); }} data-testid="transfer-auth-signup" className="rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white px-4 h-9 text-[12px] font-medium transition">Créer mon compte</button>
      <button type="button" onClick={() => { setAuthModalMode("login"); setAuthModalOpen(true); }} data-testid="transfer-auth-login" className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#f5edf1] px-4 h-9 text-[12px] font-medium transition">Me connecter</button>
      {paymentMethodsCfg.stripe_enabled && (
        <button type="button" onClick={() => setPaymentMethod("card")} data-testid="transfer-auth-back-card" className="underline text-[#8f6075]">Choisir la carte</button>
      )}
    </div>
  </div>
)}
`), ind), ...lines.slice(e + 1)];
  console.log("OK repere : ecran 1 - texte du compte Zenoria, pastilles, boutons principal et secondaire");
}

// ---------- 5. ecran 1 : case CGV et bouton (la carte ne change pas)
replaceInLine('{paymentMethod !== "transfer" && (', "case CGV de l'ecran 1 : reservee a la carte", '{paymentMethod !== "transfer" && (', '{paymentMethod === "card" && (');
replaceInLine('(paymentMethod !== "transfer" && !cgvAccepted)', "bouton Commander : bloque tant qu'aucun mode n'est choisi", '(paymentMethod !== "transfer" && !cgvAccepted)', '!paymentMethod || (paymentMethod === "card" && !cgvAccepted)');
replaceInLine('? "Continuer vers la livraison" : "Commander"}', "bouton Commander : libelle sans mode", '? "Continuer vers la livraison" : "Commander"}', '? "Continuer vers la livraison" : !paymentMethod ? "Choisissez un mode de paiement" : "Commander"}');

// ---------- 6. ecrans Livraison et Recapitulatif
{
  const s = findUnique(") : transferStep ? (", "debut de l'ecran Livraison");
  const e = blockEnd(s, ") : (", "fin de l'ecran Livraison");
  const old = lines.slice(s, e).join("\n");
  for (const t of ['data-testid="transfer-recap"', 'data-testid="transfer-shipping-form"', 'data-testid="transfer-submit-button"', 'data-testid="transfer-back-to-cart"'])
    if (!old.includes(t)) fail(`ecran Livraison : ${t} absent du bloc repere.`);
  const f0 = lines.slice(s, e).findIndex((l) => l.includes('data-testid="transfer-shipping-form"')) + s;
  const f1 = blockEnd(f0, "</div>", "formulaire de livraison");
  const form = lines.slice(f0, f1 + 1); // formulaire existant, repris tel quel
  const ind = indentOf(s);
  const recap = raw(String.raw`
) : recapStep ? (
  <>
    <div data-testid="transfer-recap-step" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
      <button type="button" onClick={() => { setCartStep("shipping"); setCheckoutError(""); }} data-testid="transfer-recap-back" className="text-sm font-bold text-[#8f6075] underline">← Retour à la livraison</button>
      <div className="rounded-xl bg-white border border-[#eee2e5] px-3 py-2">
        {cartLines.map(({ product: p, qty }) => (
          <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
            <CartThumb product={p} size="h-9 w-9" />
            <div className="flex-1 min-w-0 truncate">{p.name}<span className="text-[#8b737e]"> × {qty}</span></div>
            <div className="font-medium">{formatPrice(effectivePrice(p) * qty)}</div>
          </div>
        ))}
        <div className="border-t border-[#f0e6ea] mt-1 pt-2 text-[13px] text-[#54434c] space-y-0.5">
          <div className="flex justify-between"><span>Sous-total</span><span>{formatPrice(totals.subtotal)}</span></div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-emerald-700"><span>{"Remise" + (promoCode ? " (" + promoCode + ")" : "")}</span><span>-{formatPrice(totals.discount)}</span></div>
          )}
          <div className="flex justify-between"><span>Livraison (France)</span><span>{totals.shipping === 0 ? "Offerte" : formatPrice(totals.shipping)}</span></div>
          <div className="text-[11px] text-[#8b737e]">TVA non applicable, art. 293 B du CGI</div>
        </div>
      </div>
      <div data-testid="transfer-recap-address" className="rounded-xl bg-white border border-[#eee2e5] px-3 py-2 text-[13px] text-[#54434c] flex items-start gap-2">
        <div className="flex-1 min-w-0"><span className="font-medium text-[#412f3b]">Livraison</span> · {transferShipping.fullName.trim()}, {transferShipping.line1.trim()}{transferShipping.line2.trim() ? " (" + transferShipping.line2.trim() + ")" : ""}, {transferShipping.postalCode.trim()} {transferShipping.city.trim()}</div>
        <button type="button" onClick={() => { setCartStep("shipping"); setCheckoutError(""); }} className="shrink-0 underline text-[#8f6075]">Modifier</button>
      </div>
      <div data-testid="transfer-recap-payment" className="rounded-xl bg-[#fbf7f9] border border-[#eee2e5] px-3 py-3 text-[12px] leading-5 text-[#54434c]">
        <div className="text-[13px] font-medium text-[#412f3b]">Paiement par virement bancaire</div>
        <p className="mt-1">Une fois la commande validée, nous vous donnons l&apos;IBAN, le BIC et la référence à indiquer dans votre virement.</p>
        <p className="mt-1.5">Nous réservons vos pièces pour vous pendant <strong>{transferDelayDays ? transferDelayDays + " jour" + (transferDelayDays > 1 ? "s" : "") : "le délai indiqué à la confirmation"}</strong> après validation. Passé ce délai sans virement reçu, la commande est annulée automatiquement et les pièces sont remises en vente. La date et l&apos;heure exactes vous sont données à la confirmation.</p>
      </div>
    </div>
    <div className="flex-none border-t border-[#eadfe4] bg-white/80 px-5 py-4 space-y-3">
      <label className="flex items-start gap-2 text-[12px] text-[#54434c] leading-5">
        <input type="checkbox" checked={cgvAccepted} onChange={(e) => { setCgvAccepted(e.target.checked); setCheckoutError(""); }} data-testid="cgv-checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#8f6075]" />
        <span>J&apos;ai lu et j&apos;accepte les{" "}<a href="/cgv" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">conditions générales de vente</a>{" "}et les{" "}<a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline text-[#8f6075]">mentions légales</a></span>
      </label>
      <div className="flex justify-between font-bold text-base text-[#342b32]"><span>Total TTC</span><span>{formatPrice(totals.total)}</span></div>
      <button onClick={handleCheckout} disabled={shopPaused || checkoutLoading || !cgvAccepted} data-testid="transfer-submit-button" className="w-full h-14 rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c]">
        {shopPaused ? (
          <span className="text-sm font-medium">Commandes temporairement fermées</span>
        ) : checkoutLoading ? (
          <span className="text-sm font-medium">Enregistrement de la commande...</span>
        ) : (
          <>
            <span className="block text-sm font-medium">Je commande et je règle par virement</span>
            <span className="block text-[11px] font-normal opacity-90">commande avec obligation de paiement</span>
          </>
        )}
      </button>
      {checkoutError && (
        <p role="alert" className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">{checkoutError}</p>
      )}
    </div>
  </>
`);
  const shipHead = raw(String.raw`
) : transferStep ? (
  <>
    <div data-testid="transfer-shipping-step" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
      <button type="button" onClick={() => { setCartStep("cart"); setCheckoutError(""); }} data-testid="transfer-back-to-cart" className="text-sm font-bold text-[#8f6075] underline">← Retour au mode de paiement</button>
`);
  const shipTail = raw(String.raw`
    </div>
    <div className="flex-none border-t border-[#eadfe4] bg-white/80 px-5 py-4 space-y-3">
      <button type="button" onClick={goToTransferRecap} disabled={shopPaused} data-testid="transfer-continue-button" className="w-full h-12 rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed">Continuer vers le récapitulatif</button>
      {checkoutError && (
        <p role="alert" className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">{checkoutError}</p>
      )}
    </div>
  </>
`);
  lines = [...lines.slice(0, s), ...put(recap, ind), ...put(shipHead, ind), ...form, ...put(shipTail, ind), ...lines.slice(e)];
  console.log("OK repere : ecran Livraison (sans articles) et ecran Recapitulatif");
}

const text = lines.join(EOL);

// ---------- garde-fous finaux
for (const n of ['fetch("/api/checkout"', 'fetch("/api/checkout-transfer"', 'data-testid="cgv-checkbox"', 'data-testid="checkout-button"', "const submitTransferOrder", "const handleCheckout", "const handleLogout", "const finishLogout"])
  if (count(text, n) !== count(original, n)) fail(`garde-fou final : ${JSON.stringify(n)} ne doit pas changer (avant ${count(original, n)}, apres ${count(text, n)}).`);
const exact = [['data-testid="transfer-recap-step"', 1], ['data-testid="transfer-shipping-step"', 1], ['data-testid="transfer-continue-button"', 1], ['data-testid="transfer-submit-button"', 1],
  ['data-testid="transfer-recap"', 0], ["← Retour au panier", 0], ['Valider la commande avec obligation de paiement', 0], ["Je commande et je règle par virement", 1],
  ['const [paymentMethod, setPaymentMethod] = useState(null);', 1], ["const goToTransferRecap", 1], ["const recapStep", 1], ['data-testid="transfer-shipping-form"', 1],
  ['data-testid="payment-method-card"', 1], ['data-testid="payment-method-transfer"', 1], ['data-testid="transfer-auth-signup"', 1], ['data-testid="transfer-auth-login"', 1]];
for (const [n, c] of exact) if (count(text, n) !== c) fail(`garde-fou final : ${JSON.stringify(n)} attendu ${c} fois, trouve ${count(text, n)}.`);
if (text === original) fail("aucune modification produite.");
console.log("OK garde-fou : Stripe, CGV, deconnexion et formulaire existants intacts ; nouveaux ecrans presents");

// ---------- route de lecture de la duree de reservation
const routeSource = String.raw`// ZENORIA - Lot A2 : duree de reservation du virement
// Route PUBLIQUE qui ne renvoie QUE le nombre de jours (reglage "delay_days" de bank_transfer).
// L'IBAN, le BIC et le beneficiaire ne sortent jamais d'ici : ils restent reserves aux administratrices.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseBankTransfer, BANK_TRANSFER_KEY } from "@/lib/paymentSettings";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  try {
    const { data, error } = await supabaseAdmin.from("site_settings").select("value").eq("key", BANK_TRANSFER_KEY).maybeSingle();
    if (error) throw error;
    const cfg = parseBankTransfer(data ? data.value : null);
    return res.status(200).json({ ok: true, delayDays: cfg.delay_days });
  } catch (err) {
    console.error("[transfer-terms]", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "durée indisponible" });
  }
}
`;
const routeExists = fs.existsSync(routeFile);
if (routeExists && !fs.readFileSync(routeFile, "utf8").includes("Lot A2")) fail("pages/api/transfer-terms.js existe deja avec un autre contenu : je ne l'ecrase pas.");
console.log(routeExists ? "OK route : pages/api/transfer-terms.js deja presente" : "OK route : pages/api/transfer-terms.js sera creee");

console.log(`\nMode : ${dryRun ? "DRY-RUN" : "APPLY"}\nTous les controles sont conformes.`);
if (dryRun) console.log("VERIFICATION SEULE : aucun fichier modifie.");
else {
  if (!routeExists) { fs.mkdirSync(path.dirname(routeFile), { recursive: true }); fs.writeFileSync(routeFile, routeSource, "utf8"); console.log("Fichier cree : pages\\api\\transfer-terms.js"); }
  fs.writeFileSync(file, text, "utf8");
  console.log("Fichier modifie : pages\\index.js");
}
