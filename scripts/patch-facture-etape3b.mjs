// ============================================================
// scripts/patch-facture-etape3b.mjs — FACTURATION, étape 3b (bouton « Télécharger la facture » côté admin)
// ZENORIA_INVOICE_STEP3B_V1
//
// Prérequis : étape 3 appliquée (lib/invoicePdf.js, pages/api/invoice/[orderId].js existants).
// Ajoute un bouton dans Admin › CRM › Commandes, à côté de « Marquer comme expédiée / livrée »,
// pour chaque commande payée, expédiée ou livrée. Réutilise la même route API que côté cliente :
// la fonction SQL issue_invoice_for_order autorise déjà les comptes administrateurs à générer la
// facture de N'IMPORTE QUELLE commande (pas seulement les leurs).
//
// Usage (dossier zenoria, branche facturation-pdf) :
//   node scripts\patch-facture-etape3b.mjs --dry-run
//   node scripts\patch-facture-etape3b.mjs
// ============================================================
import fs from "node:fs";
import { execSync } from "node:child_process";

const MARK = "ZENORIA_INVOICE_STEP3B_V1";
const BRANCH = "facturation-pdf";
const REL = "components/AdminCrm.js";
const DRY = process.argv.includes("--dry-run");

const ok = (m) => console.log("  \u2713 " + m);
class Stop extends Error {}
const fail = (m) => { throw new Stop(m); };
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

function once(text, needle, replacer, label) {
  const n = text.split(needle).length - 1;
  if (n !== 1) fail(`repère « ${label} » trouvé ${n} fois dans ${REL} (1 attendu)`);
  return text.replace(needle, replacer);
}

try {
  console.log(`\nFacturation · étape 3b (bouton admin)${DRY ? " — VÉRIFICATION SEULE" : ""}\n`);
  let branch = "";
  try { branch = git("rev-parse --abbrev-ref HEAD"); } catch (e) { fail("git introuvable ou dossier hors dépôt"); }
  if (branch !== BRANCH) fail(`branche actuelle « ${branch} » : passez sur ${BRANCH}`);
  ok(`branche ${BRANCH}`);

  if (!fs.existsSync("lib/invoicePdf.js") || !fs.existsSync("pages/api/invoice/[orderId].js")) {
    fail("l'étape 3 n'est pas appliquée (lib/invoicePdf.js ou pages/api/invoice/[orderId].js manquant)");
  }
  ok("étape 3 présente");

  if (!fs.existsSync(REL)) fail(`${REL} introuvable (lancez le script depuis le dossier zenoria)`);
  const raw = fs.readFileSync(REL, "utf8");
  const bom = raw.charCodeAt(0) === 0xfeff;
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let t = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");

  if (t.includes(MARK)) { console.log("  \u00b7 déjà appliqué, rien à faire.\n"); process.exit(0); }

  const dirty = git(`status --porcelain -- ${REL}`);
  if (dirty) fail(`modifications locales non commitées sur ${REL} :\n${dirty}\n  (commit ou git restore avant de relancer)`);
  ok(`${REL} identique au dernier commit`);

  // 1. Import des dépendances nécessaires (icône + hook d'état local au composant AdminOrders)
  t = once(
    t,
    'import { RefreshCw } from "lucide-react";',
    `import { RefreshCw, FileDown } from "lucide-react"; // ${MARK}`,
    "import RefreshCw"
  );
  t = once(
    t,
    'import { supabase, getMediaUrl } from "@/lib/supabase";',
    `import { supabase, getMediaUrl } from "@/lib/supabase";\n\n// ${MARK} : télécharge la facture PDF d'une commande depuis l'admin (même route que l'espace cliente ;\n// issue_invoice_for_order autorise un compte administrateur à générer la facture de n'importe quelle commande).\nasync function downloadInvoiceAdmin(orderId, onError) {\n  try {\n    const { data } = await supabase.auth.getSession();\n    const token = data && data.session ? data.session.access_token : null;\n    if (!token) { onError("Session expirée : reconnectez-vous."); return; }\n    const res = await fetch(\`/api/invoice/\${orderId}\`, { headers: { Authorization: \`Bearer \${token}\` } });\n    if (!res.ok) {\n      let message = "Impossible de générer la facture pour le moment.";\n      try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* réponse non JSON */ }\n      onError(message);\n      return;\n    }\n    const blob = await res.blob();\n    const url = window.URL.createObjectURL(blob);\n    const a = document.createElement("a");\n    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");\n    a.href = url;\n    a.download = match ? match[1] : \`facture-\${orderId}.pdf\`;\n    document.body.appendChild(a);\n    a.click();\n    a.remove();\n    window.URL.revokeObjectURL(url);\n  } catch (e) {\n    onError("Impossible de générer la facture pour le moment.");\n  }\n}`,
    "import supabase, getMediaUrl"
  );

  // 2. État local (une seule ligne "en cours" à la fois) dans AdminOrders
  t = once(
    t,
    "  const [shippingBusyId, setShippingBusyId] = useState(null);",
    `  const [shippingBusyId, setShippingBusyId] = useState(null);\n  const [invoiceBusyId, setInvoiceBusyId] = useState(null); // ${MARK}\n  const [invoiceErrorId, setInvoiceErrorId] = useState(null); // ${MARK}\n  const [invoiceErrorMsg, setInvoiceErrorMsg] = useState(""); // ${MARK}`,
    "const [shippingBusyId, setShippingBusyId]"
  );

  // 3. Le bouton, juste après « Marquer comme livrée », avant la fermeture du groupe de boutons
  const old = `                            data-testid="mark-delivered"
                            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Marquer comme livrée
                          </button>
                        </div>
                      </div>`;
  const next = `                            data-testid="mark-delivered"
                            className="rounded-full border border-[#8f6075] text-[#8f6075] hover:bg-[#8f6075] hover:text-white text-xs font-medium px-4 h-9 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Marquer comme livrée
                          </button>
                          {/* ${MARK} : facture générée à la demande (recomposée depuis des données figées) */}
                          {["paid", "shipped", "delivered"].includes(o.status) && (
                            <button
                              type="button"
                              onClick={async () => {
                                setInvoiceBusyId(o.id);
                                setInvoiceErrorId(null);
                                await downloadInvoiceAdmin(o.id, (msg) => { setInvoiceErrorId(o.id); setInvoiceErrorMsg(msg); });
                                setInvoiceBusyId(null);
                              }}
                              disabled={invoiceBusyId === o.id}
                              data-testid="invoice-download-admin"
                              className="flex items-center gap-1.5 rounded-full border border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1] text-xs font-medium px-4 h-9 transition disabled:opacity-50"
                            >
                              <FileDown size={13} /> {invoiceBusyId === o.id ? "Génération…" : "Facture"}
                            </button>
                          )}
                        </div>
                        {invoiceErrorId === o.id && (
                          <div role="alert" className="mt-2 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-xs">{invoiceErrorMsg}</div>
                        )}
                      </div>`;
  const n = t.split(old).length - 1;
  if (n !== 1) fail(`repère « groupe de boutons Marquer comme livrée » trouvé ${n} fois (1 attendu)`);
  t = t.replace(old, next);

  ok("tous les repères ont été trouvés");
  if (DRY) { console.log("\nVérification réussie : 1 fichier serait écrit. Rien n'a été modifié.\n"); process.exit(0); }
  fs.writeFileSync(REL, (bom ? "\uFEFF" : "") + (eol === "\r\n" ? t.replace(/\n/g, "\r\n") : t), "utf8");
  ok(`${REL} modifié`);
  console.log("\nTerminé : 1 fichier écrit. Suite : npm run build, puis testez le bouton « Facture » dans Admin > CRM > Commandes.\n");
} catch (e) {
  if (e instanceof Stop) { console.error(`\n\u2717 ARRÊT : ${e.message}\nAucun fichier n'a été modifié.\n`); process.exit(1); }
  throw e;
}
