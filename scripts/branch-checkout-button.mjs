// scripts/branch-checkout-button.mjs
//
// Chantier paiement (Stripe), etape 10 : relie le vrai bouton « Commander »
// du panier a la route /api/checkout, et ajoute une fenetre de confirmation
// affichee au retour reussi d'un paiement (?paiement=succes).
//
// Ce script :
//   1. Cree components/PaymentConfirmationModal.js (logo Zenoria, titre,
//      texte de remerciement, bouton « Continuer mes achats »).
//   2. Modifie pages/index.js :
//      - importe PaymentConfirmationModal
//      - ajoute 3 etats : checkoutLoading, checkoutError, paymentConfirmationOpen
//      - ajoute un useEffect qui detecte "?paiement=succes", vide le panier,
//        ouvre la fenetre de confirmation, puis nettoie l'adresse
//      - ajoute handleCheckout() : appelle /api/checkout avec le panier et
//        le code promo, puis redirige vers Stripe
//      - branche le bouton « Commander » sur handleCheckout (au lieu de
//        setCheckoutNotice(true))
//      - remplace la note "paiement de demonstration" par l'affichage
//        d'une eventuelle erreur de paiement
//      - affiche <PaymentConfirmationModal /> a la fin du rendu
//
// Garanties : verifie TOUS les reperes dans les DEUX fichiers avant
// d'ecrire quoi que ce soit ; n'ecrit rien si un seul manque ; liste tous
// les reperes manquants ; conserve les fins de ligne de pages/index.js ;
// peut etre relance sans effet.
//
// Usage : node scripts/branch-checkout-button.mjs

import fs from "node:fs";
import path from "node:path";

const indexPath = path.join("pages", "index.js");
const modalPath = path.join("components", "PaymentConfirmationModal.js");

const MODAL_CONTENT = [
  "// ZENORIA_PAYMENT_CONFIRMATION_MODAL_V1",
  "import React from \"react\";",
  "import { motion, AnimatePresence } from \"framer-motion\";",
  "import { X } from \"lucide-react\";",
  "",
  "// Logo Zenoria, d\u00e9j\u00e0 h\u00e9berg\u00e9 dans Supabase Storage (r\u00e9utilis\u00e9 depuis le",
  "// mod\u00e8le d'e-mail \u00ab mot de passe oubli\u00e9 \u00bb).",
  "const LOGO_URL =",
  "  \"https://dnzrssuclesccxgcurwz.supabase.co/storage/v1/object/public/product-media/Logos/zenoria_logo_horizontal_fond_blanc.png\";",
  "",
  "// Fen\u00eatre affich\u00e9e au retour r\u00e9ussi d'un paiement Stripe (voir le useEffect",
  "// qui d\u00e9tecte \"?paiement=succes\" dans pages/index.js). Ne contient encore",
  "// aucune mention d'e-mail de confirmation : cette promesse sera ajout\u00e9e",
  "// une fois cet e-mail r\u00e9ellement construit (chantier s\u00e9par\u00e9).",
  "export default function PaymentConfirmationModal({ open, onClose }) {",
  "  return (",
  "    <AnimatePresence>",
  "      {open && (",
  "        <>",
  "          <motion.div",
  "            initial={{ opacity: 0 }}",
  "            animate={{ opacity: 1 }}",
  "            exit={{ opacity: 0 }}",
  "            className=\"fixed inset-0 bg-black/50 z-[70]\"",
  "            onClick={onClose}",
  "          />",
  "          <motion.div",
  "            initial={{ opacity: 0, scale: 0.95 }}",
  "            animate={{ opacity: 1, scale: 1 }}",
  "            exit={{ opacity: 0, scale: 0.95 }}",
  "            className=\"fixed z-[70] inset-x-4 top-[10%] max-w-md mx-auto bg-[#fbf8f4] rounded-[2rem] shadow-2xl p-8 text-center\"",
  "          >",
  "            <button className=\"absolute right-5 top-5\" onClick={onClose} aria-label=\"Fermer\">",
  "              <X />",
  "            </button>",
  "",
  "            <img src={LOGO_URL} alt=\"Zenoria\" className=\"h-10 mx-auto mb-6 object-contain\" />",
  "",
  "            <div className=\"mx-auto mb-4 h-12 w-12 rounded-full bg-[#f5edf1] grid place-items-center text-[#8f6075] text-2xl\">",
  "              \u2713",
  "            </div>",
  "",
  "            <h3 className=\"font-serif text-3xl mb-4\">Merci pour votre confiance</h3>",
  "",
  "            <p className=\"text-sm text-[#54434c] leading-6 mb-8\">",
  "              Nous avons bien re\u00e7u votre commande et votre paiement. Votre bague sera fa\u00e7onn\u00e9e \u00e0 la main, avec la",
  "              m\u00eame attention que pour chacune de nos cr\u00e9ations. Merci de votre confiance.",
  "            </p>",
  "",
  "            <button",
  "              onClick={onClose}",
  "              className=\"w-full rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white text-sm font-medium h-12 transition\"",
  "            >",
  "              Continuer mes achats",
  "            </button>",
  "          </motion.div>",
  "        </>",
  "      )}",
  "    </AnimatePresence>",
  "  );",
  "}",
].join("\r\n") + "\r\n";

if (!fs.existsSync(indexPath)) {
  console.error(`✗ Fichier introuvable : ${indexPath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(indexPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

// ---------------------------------------------------------------------
// Idempotence globale
// ---------------------------------------------------------------------
const modalMarker = "// ZENORIA_PAYMENT_CONFIRMATION_MODAL_V1";
const modalExists = fs.existsSync(modalPath);
const modalAlreadyDone = modalExists && fs.readFileSync(modalPath, "utf8").includes(modalMarker);
const indexAlreadyDone = raw.includes("handleCheckout") && raw.includes("PaymentConfirmationModal");

if (modalAlreadyDone && indexAlreadyDone) {
  console.log("✓ Rien à modifier : le branchement du paiement est déjà en place.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// Vérification : le composant existe déjà mais avec un contenu différent ?
// ---------------------------------------------------------------------
if (modalExists && !modalAlreadyDone) {
  console.error(`✗ ${modalPath} existe déjà avec un contenu différent — rien n'a été écrit.`);
  console.error("Supprimez-le ou renommez-le si vous voulez le remplacer, puis relancez ce script.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Repères dans pages/index.js (chacun doit apparaître EXACTEMENT une fois)
// ---------------------------------------------------------------------
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = [
  {
    key: "import",
    label: "ligne d'import de AuthModal (pages/index.js)",
    needle: 'import AuthModal from "@/components/AuthModal";',
  },
  {
    key: "states",
    label: "déclaration de l'état checkoutNotice (pages/index.js)",
    needle: '  const [checkoutNotice, setCheckoutNotice] = useState(false);',
  },
  {
    key: "accessTokenEffect",
    label: "useEffect de nettoyage après lien d'e-mail (access_token) (pages/index.js)",
    needle:
      '  useEffect(() => {' + eol +
      '    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {' + eol +
      '      const timer = setTimeout(() => {' + eol +
      '        window.history.replaceState(null, "", window.location.pathname);' + eol +
      '      }, 1000);' + eol +
      '      return () => clearTimeout(timer);' + eol +
      '    }' + eol +
      '  }, []);',
  },
  {
    key: "clearCart",
    label: "fonction clearCart (pages/index.js)",
    needle:
      '  const clearCart = () => {' + eol +
      '    setCartNotice("");' + eol +
      '    setCheckoutNotice(false);' + eol +
      '    setCartItems([]);' + eol +
      '    setPromoCode("");' + eol +
      '    setPromoOpen(false);' + eol +
      '  };',
  },
  {
    key: "button",
    label: "bouton « Commander » (pages/index.js)",
    needle:
      '                    <button' + eol +
      '                      onClick={() => setCheckoutNotice(true)}' + eol +
      '                      disabled={shopPaused}' + eol +
      '                      data-testid="checkout-button"' + eol +
      '                      className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c] ${tightFooter ? "h-11" : "h-12"}`}' + eol +
      '                    >' + eol +
      '                      {shopPaused ? "Commandes temporairement fermées" : "Commander"}' + eol +
      '                    </button>',
  },
  {
    key: "note",
    label: "bloc de note sous le bouton « Commander » (pages/index.js)",
    needle:
      '                    {shopPaused ? (' + eol +
      '                      <p data-testid="pause-note" className="text-[11px] text-center rounded-lg bg-amber-50 text-amber-800 px-3 py-1.5">' + eol +
      "                        La boutique est en pause{pauseReturn ? ` jusqu'au ${pauseReturn}` : \"\"}. Votre panier est conservé sur cet appareil." + eol +
      '                      </p>' + eol +
      '                    ) : checkoutNotice ? (' + eol +
      '                      <p className="text-[11px] text-center rounded-lg bg-[#f5edf1] text-[#6b4a5b] px-3 py-1.5">' + eol +
      '                        Le paiement en ligne sera ajouté à la prochaine étape. Aucune transaction n&apos;est possible pour le moment.' + eol +
      '                      </p>' + eol +
      '                    ) : (' + eol +
      '                      <p className="text-[11px] text-center text-[#7e7378]">Paiement de démonstration, aucune transaction réelle.</p>' + eol +
      '                    )}',
  },
  {
    key: "authModalRender",
    label: "rendu de <AuthModal /> en fin de fichier (pages/index.js)",
    needle:
      '      {/* AUTHENTIFICATION */}' + eol +
      '      <AuthModal open={authModalOpen} onClose={() => { setAuthModalOpen(false); setAuthModalMode("login"); }} initialMode={authModalMode} />' + eol +
      '    </div>' + eol +
      '  );' + eol +
      '}',
  },
];

const missing = [];
for (const a of anchors) {
  const count = countOccurrences(raw, a.needle);
  if (count !== 1) {
    missing.push({ ...a, count });
  }
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • ${m.label}`);
    console.error(`    (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de pages/index.js et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Construction des remplacements (tout est vérifié, on peut écrire)
// ---------------------------------------------------------------------
let out = raw;

// 1) import
out = out.replace(
  'import AuthModal from "@/components/AuthModal";',
  'import AuthModal from "@/components/AuthModal";' + eol +
    'import PaymentConfirmationModal from "@/components/PaymentConfirmationModal";'
);

// 2) nouveaux états, juste après checkoutNotice
out = out.replace(
  '  const [checkoutNotice, setCheckoutNotice] = useState(false);',
  '  const [checkoutNotice, setCheckoutNotice] = useState(false);' + eol +
    '  const [checkoutLoading, setCheckoutLoading] = useState(false);' + eol +
    '  const [checkoutError, setCheckoutError] = useState("");' + eol +
    '  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);'
);

// 3) nouveau useEffect, juste après celui qui nettoie l'URL après access_token
{
  const original = anchors.find((a) => a.key === "accessTokenEffect").needle;
  const addition =
    eol + eol +
    "  // Détecte le retour réussi d'un paiement Stripe (paramètre ?paiement=succes)," + eol +
    "  // vide le panier, affiche la confirmation, puis nettoie l'adresse." + eol +
    "  useEffect(() => {" + eol +
    '    if (typeof window === "undefined") return;' + eol +
    "    const params = new URLSearchParams(window.location.search);" + eol +
    '    if (params.get("paiement") === "succes") {' + eol +
    "      clearCart();" + eol +
    "      setPaymentConfirmationOpen(true);" + eol +
    '      window.history.replaceState(null, "", window.location.pathname);' + eol +
    "    }" + eol +
    "  }, []);";
  out = out.replace(original, original + addition);
}

// 4) handleCheckout, juste après clearCart
{
  const original = anchors.find((a) => a.key === "clearCart").needle;
  const addition =
    eol + eol +
    "  const handleCheckout = async () => {" + eol +
    "    setCheckoutNotice(false);" + eol +
    '    setCheckoutError("");' + eol +
    "    setCheckoutLoading(true);" + eol +
    "    try {" + eol +
    '      const res = await fetch("/api/checkout", {' + eol +
    '        method: "POST",' + eol +
    '        headers: { "Content-Type": "application/json" },' + eol +
    "        body: JSON.stringify({" + eol +
    "          items: cartItems.map((it) => ({ id: it.id, qty: it.qty }))," + eol +
    "          promoCode: promoCode || null," + eol +
    "        })," + eol +
    "      });" + eol +
    "      const data = await res.json();" + eol +
    "      if (data && data.ok && data.url) {" + eol +
    "        window.location.href = data.url;" + eol +
    "      } else {" + eol +
    '        setCheckoutError((data && data.error) || "Impossible de lancer le paiement. Merci de réessayer.");' + eol +
    "        setCheckoutLoading(false);" + eol +
    "      }" + eol +
    "    } catch (e) {" + eol +
    '      setCheckoutError("Impossible de contacter le service de paiement. Vérifiez votre connexion et réessayez.");' + eol +
    "      setCheckoutLoading(false);" + eol +
    "    }" + eol +
    "  };";
  out = out.replace(original, original + addition);
}

// 5) bouton « Commander »
out = out.replace(
  anchors.find((a) => a.key === "button").needle,
  '                    <button' + eol +
    '                      onClick={handleCheckout}' + eol +
    '                      disabled={shopPaused || checkoutLoading}' + eol +
    '                      data-testid="checkout-button"' + eol +
    '                      className={`w-full rounded-full bg-[#82576c] hover:bg-[#6d4659] text-white text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#82576c] ${tightFooter ? "h-11" : "h-12"}`}' + eol +
    '                    >' + eol +
    '                      {shopPaused ? "Commandes temporairement fermées" : checkoutLoading ? "Redirection vers le paiement..." : "Commander"}' + eol +
    '                    </button>'
);

// 6) note sous le bouton
out = out.replace(
  anchors.find((a) => a.key === "note").needle,
  '                    {shopPaused ? (' + eol +
    '                      <p data-testid="pause-note" className="text-[11px] text-center rounded-lg bg-amber-50 text-amber-800 px-3 py-1.5">' + eol +
    "                        La boutique est en pause{pauseReturn ? ` jusqu'au ${pauseReturn}` : \"\"}. Votre panier est conservé sur cet appareil." + eol +
    '                      </p>' + eol +
    '                    ) : checkoutError ? (' + eol +
    '                      <p className="text-[11px] text-center rounded-lg bg-red-50 text-red-600 px-3 py-1.5">' + eol +
    '                        {checkoutError}' + eol +
    '                      </p>' + eol +
    '                    ) : (' + eol +
    '                      <p className="text-[11px] text-center text-[#7e7378]">Paiement sécurisé via Stripe.</p>' + eol +
    '                    )}'
);

// 7) rendu de la nouvelle fenêtre, juste après <AuthModal />
out = out.replace(
  anchors.find((a) => a.key === "authModalRender").needle,
  '      {/* AUTHENTIFICATION */}' + eol +
    '      <AuthModal open={authModalOpen} onClose={() => { setAuthModalOpen(false); setAuthModalMode("login"); }} initialMode={authModalMode} />' + eol +
    eol +
    '      {/* CONFIRMATION DE PAIEMENT (retour de Stripe Checkout) */}' + eol +
    '      <PaymentConfirmationModal open={paymentConfirmationOpen} onClose={() => setPaymentConfirmationOpen(false)} />' + eol +
    '    </div>' + eol +
    '  );' + eol +
    '}'
);

// ---------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------
if (!indexAlreadyDone) {
  fs.writeFileSync(indexPath, out, "utf8");
  console.log(`✓ ${indexPath} : 7 modification(s)`);
  console.log("  • import de PaymentConfirmationModal");
  console.log("  • 3 nouveaux états (checkoutLoading, checkoutError, paymentConfirmationOpen)");
  console.log("  • useEffect de détection « ?paiement=succes »");
  console.log("  • fonction handleCheckout (appelle /api/checkout, redirige vers Stripe)");
  console.log("  • bouton « Commander » branché sur handleCheckout");
  console.log("  • note sous le bouton : affiche désormais une erreur éventuelle de paiement");
  console.log("  • <PaymentConfirmationModal /> ajoutée en fin de rendu");
} else {
  console.log(`= ${indexPath} : déjà en place, inchangé.`);
}

if (!modalAlreadyDone) {
  fs.mkdirSync(path.dirname(modalPath), { recursive: true });
  fs.writeFileSync(modalPath, MODAL_CONTENT, "utf8");
  console.log(`✓ ${modalPath} : créé.`);
}

console.log("\nTerminé.");
