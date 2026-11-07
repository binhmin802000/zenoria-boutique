// ============================================================
// patch-confirmation-reception-client.mjs
// ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1
//
// Ajoute dans pages/compte.js le bouton "Confirmer la réception"
// (visible uniquement quand order.status === "shipped"), qui appelle
// la fonction SQL customer_confirm_delivery via supabase.rpc.
//
// Pré-requis : avoir exécuté en base supabase_customer_confirm_delivery.sql
//
// Usage :
//   node scripts/patch-confirmation-reception-client.mjs
//
// Le script est idempotent : si les marqueurs de la V1 sont déjà
// présents, il s'arrête sans rien modifier.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "pages", "compte.js");

function fail(message) {
  console.error("[patch-confirmation-reception-client] " + message);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`fichier introuvable : ${FILE} (lancez le script depuis la racine du projet)`);
}

const original = fs.readFileSync(FILE, "utf8");

if (original.includes("ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1")) {
  console.log("[patch-confirmation-reception-client] déjà appliqué, rien à faire.");
  process.exit(0);
}

// Le fichier peut être en CRLF (Windows) ; on travaille en interne en LF
// puis on restitue le style de fin de ligne d'origine avant d'écrire.
const usesCRLF = original.includes("\r\n");
let content = original.replace(/\r\n/g, "\n");

// ------------------------------------------------------------
// 1) Déclaration des states, juste après ceux de l'annulation
// ------------------------------------------------------------
const stateAnchor =
  '  const [cancelBusy, setCancelBusy] = useState(false);\n' +
  '  const [cancelError, setCancelError] = useState("");\n';

const stateCount = content.split(stateAnchor).length - 1;
if (stateCount !== 1) {
  fail(`ancre des states (cancelBusy/cancelError) trouvée ${stateCount} fois au lieu de 1. Fichier modifié depuis ? Patch arrêté sans rien écrire.`);
}

content = content.replace(
  stateAnchor,
  stateAnchor +
    '  const [deliverBusy, setDeliverBusy] = useState(false); // ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1\n' +
    '  const [deliverError, setDeliverError] = useState(""); // ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1\n'
);

// ------------------------------------------------------------
// 2) Fonction confirmDelivery, juste après cancelOrder (avant le "return (")
// ------------------------------------------------------------
const fnAnchor =
  '    setCancelBusy(false);\n' +
  '  };\n' +
  '  return (\n' +
  '    <div data-testid={`order-detail-${order.id}`}>\n';

const fnCount = content.split(fnAnchor).length - 1;
if (fnCount !== 1) {
  fail(`ancre de fin de cancelOrder / début du return trouvée ${fnCount} fois au lieu de 1. Fichier modifié depuis ? Patch arrêté sans rien écrire.`);
}

content = content.replace(
  fnAnchor,
  '    setCancelBusy(false);\n' +
    '  };\n' +
    '  // ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1 : confirmation de réception par la cliente (uniquement depuis "shipped")\n' +
    '  const confirmDelivery = async () => {\n' +
    '    setDeliverBusy(true);\n' +
    '    setDeliverError("");\n' +
    '    try {\n' +
    '      const { error: err } = await supabase.rpc("customer_confirm_delivery", { p_order_id: order.id });\n' +
    '      if (err) throw err;\n' +
    '      if (onOrderChanged) onOrderChanged();\n' +
    '    } catch (err) {\n' +
    '      setDeliverError("Impossible de confirmer la réception pour le moment. Réessayez, ou contactez-nous.");\n' +
    '    }\n' +
    '    setDeliverBusy(false);\n' +
    '  };\n' +
    '  return (\n' +
    '    <div data-testid={`order-detail-${order.id}`}>\n'
);

// ------------------------------------------------------------
// 3) Bouton, juste après le bloc transporteur/suivi existant
// ------------------------------------------------------------
const blockAnchor =
  '      {order.carrier && (\n' +
  '        <div className="mt-4 rounded-xl bg-[#fbf7f9] px-4 py-3 flex items-center gap-2 text-sm text-[#54434c]">\n' +
  '          <Truck size={16} className="text-[#8f6075]" /> {order.carrier}\n' +
  '          {order.tracking_number && <span className="text-[#8b737e]">· suivi {order.tracking_number}</span>}\n' +
  '        </div>\n' +
  '      )}\n';

const blockCount = content.split(blockAnchor).length - 1;
if (blockCount !== 1) {
  fail(`ancre du bloc transporteur/suivi trouvée ${blockCount} fois au lieu de 1. Fichier modifié depuis ? Patch arrêté sans rien écrire.`);
}

content = content.replace(
  blockAnchor,
  blockAnchor +
    '\n' +
    '      {/* ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1 : bouton visible uniquement si la commande est expédiée mais pas encore livrée */}\n' +
    '      {order.status === "shipped" && (\n' +
    '        <div className="mt-3">\n' +
    '          <button\n' +
    '            type="button"\n' +
    '            onClick={confirmDelivery}\n' +
    '            disabled={deliverBusy}\n' +
    '            data-testid="confirm-delivery"\n' +
    '            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"\n' +
    '          >\n' +
    '            {deliverBusy ? "Confirmation…" : "Confirmer la réception"}\n' +
    '          </button>\n' +
    '          {deliverError && <p className="mt-2 text-[12px] text-red-600">{deliverError}</p>}\n' +
    '        </div>\n' +
    '      )}\n'
);

if (usesCRLF) content = content.replace(/\n/g, "\r\n");

fs.writeFileSync(FILE, content, "utf8");
console.log("[patch-confirmation-reception-client] pages/compte.js mis à jour avec succès (3 insertions).");
console.log("[patch-confirmation-reception-client] rappel : exécuter supabase_customer_confirm_delivery.sql en base avant de tester.");
