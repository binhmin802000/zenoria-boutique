#!/usr/bin/env node
// ============================================================
// PATCH LOT 5-BIS-A : journal de commande et corrections d'affichage (interface seule)
// Fichier modifie : components/AdminCrm.js  (aucun autre fichier, aucune base de donnees)
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node patch-lot5bis-a.mjs --dry-run   -> controle chaque ancre, n'ecrit RIEN
//   node patch-lot5bis-a.mjs --apply     -> applique si TOUTES les ancres sont trouvees une seule fois
//
// Garde-fous : s'arrete sans rien ecrire si une ancre est absente ou en double, ou si le patch est deja applique.
// Les ancres tolerent les differences d'espaces et de fins de ligne (Windows ou Unix) ; la fin de ligne du fichier est conservee.
// ============================================================
import fs from "node:fs";
import path from "node:path";

const TARGET = path.join("components", "AdminCrm.js");
const MARKER = "ZENORIA_ORDER_JOURNAL_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;

const PATCHES = [
  {
    "name": "P1 formatDateOnly (date seule, heure de Paris)",
    "find": [
      "function friendlyError(err) {"
    ],
    "replace": [
      "// ZENORIA_ORDER_JOURNAL_V1 : date seule (sans heure), en heure de Paris",
      "function formatDateOnly(value) {",
      "  if (!value) return \"—\";",
      "  return new Date(value).toLocaleDateString(\"fr-FR\", { timeZone: TIME_ZONE });",
      "}",
      "function friendlyError(err) {"
    ]
  },
  {
    "name": "P2 TransferPanel recoit l'historique de la commande",
    "find": [
      "function TransferPanel({ order, onDone }) {"
    ],
    "replace": [
      "function TransferPanel({ order, history, onDone }) {"
    ]
  },
  {
    "name": "P3 TransferPanel : l'erreur est effacee a chaque changement de formulaire ou de saisie",
    "find": [
      "}, [mode]);",
      "if (order.payment_method !== \"transfer\") return null;"
    ],
    "replace": [
      "}, [mode]);",
      "  // ZENORIA_ORDER_JOURNAL_V1 : le message d'erreur disparait des qu'on change de formulaire (Retour inclus) ou de saisie",
      "  useEffect(() => {",
      "    setError(\"\");",
      "  }, [mode, amount, received, note, days, reason]);",
      "  if (order.payment_method !== \"transfer\") return null;"
    ]
  },
  {
    "name": "P4 Carte d'annulation : lecture du motif dans le journal",
    "find": [
      "if (order.status === \"cancelled\" && order.cancelled_at) {",
      "return ("
    ],
    "replace": [
      "if (order.status === \"cancelled\" && order.cancelled_at) {",
      "    // ZENORIA_ORDER_JOURNAL_V1 : le motif est lu dans la derniere ligne d'annulation du journal de la commande",
      "    const cancelEntry = [...(history || [])].reverse().find((h) => h.status === \"cancelled\" && h.note);",
      "    const cancelReason = cancelEntry ? String(cancelEntry.note).replace(/^Annulée par l.administration\\s*:\\s*/i, \"Motif : \") : \"\";",
      "    return ("
    ]
  },
  {
    "name": "P5 Carte d'annulation : affichage du motif (remplace la phrase de renvoi)",
    "find": [
      "<span className=\"block text-[11px] text-[#8b737e] mt-0.5\">Le motif figure dans l&apos;historique de la commande.</span>"
    ],
    "replace": [
      "{cancelReason && (",
      "          <span data-testid=\"transfer-cancel-reason\" className=\"block text-[12px] text-[#54434c] mt-1\">{cancelReason}</span>",
      "        )}"
    ]
  },
  {
    "name": "P6 Composant OrderHistoryLog (journal de la commande)",
    "find": [
      "export function AdminOrders() {"
    ],
    "replace": [
      "// ZENORIA_ORDER_JOURNAL_V1 : historique complet d'une commande (order_status_history), date et heure de Paris.",
      "// Affiche pour toutes les commandes (carte comme virement) : le statut, la note enregistree et l'auteur de l'action.",
      "function OrderHistoryLog({ history }) {",
      "  const rows = [...(history || [])].sort((a, b) => {",
      "    const diff = new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime();",
      "    return diff !== 0 && !Number.isNaN(diff) ? diff : Number(a.id) - Number(b.id);",
      "  });",
      "  return (",
      "    <div data-testid=\"order-history\" className=\"mt-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3.5\">",
      "      <div className=\"text-xs font-medium text-[#8b737e] mb-2.5\">Historique de la commande</div>",
      "      {rows.length === 0 ? (",
      "        <p data-testid=\"order-history-empty\" className=\"text-[12px] text-[#8b737e]\">Aucun événement enregistré.</p>",
      "      ) : (",
      "        <ol className=\"space-y-2.5\">",
      "          {rows.map((h) => {",
      "            const info = orderStatusInfo(h.status);",
      "            return (",
      "              <li key={h.id} data-testid=\"order-history-row\" className=\"flex gap-3 text-[13px] text-[#54434c]\">",
      "                <span className=\"w-28 shrink-0 text-[11px] leading-5 text-[#8b737e]\">{formatDateTime(h.changed_at)}</span>",
      "                <span className=\"min-w-0\">",
      "                  <span className={\"rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap \" + info.className}>{info.label}</span>",
      "                  {h.note && <span className=\"block mt-1 leading-5\">{h.note}</span>}",
      "                  {h.actor_email && <span className=\"block text-[11px] text-[#8b737e]\">{h.actor_email}</span>}",
      "                </span>",
      "              </li>",
      "            );",
      "          })}",
      "        </ol>",
      "      )}",
      "    </div>",
      "  );",
      "}",
      "export function AdminOrders() {"
    ]
  },
  {
    "name": "P7 Parcours : le tableau d'etapes devient baseSteps",
    "find": [
      "const steps = [",
      "{ label: \"Panier validé\", done: true, date: o.created_at },"
    ],
    "replace": [
      "const baseSteps = [",
      "                            { label: \"Panier validé\", done: true, date: o.created_at },"
    ]
  },
  {
    "name": "P8 Parcours : date seule pour un virement (date de reception)",
    "find": [
      "{ label: \"Paiement confirmé\", done: Boolean(o.paid_at), date: o.paid_at },"
    ],
    "replace": [
      "{ label: \"Paiement confirmé\", done: Boolean(o.paid_at), date: o.paid_at, dateOnly: o.payment_method === \"transfer\" },"
    ]
  },
  {
    "name": "P9 Parcours : etape Annulée pour une commande annulée",
    "find": [
      "];",
      "return (",
      "<div className=\"flex items-start\">"
    ],
    "replace": [
      "];",
      "                          // ZENORIA_ORDER_JOURNAL_V1 : commande annulee -> Panier valide, (Paiement confirme), puis Annulée en rouge",
      "                          const cancelledEntry = (statusHistoryByOrder[o.id] || []).filter((h) => h.status === \"cancelled\").slice(-1)[0];",
      "                          const steps = o.status === \"cancelled\"",
      "                            ? [",
      "                                baseSteps[0],",
      "                                ...(o.paid_at ? [baseSteps[1]] : []),",
      "                                { label: \"Annulée\", done: true, danger: true, date: o.cancelled_at || (cancelledEntry ? cancelledEntry.changed_at : null) },",
      "                              ]",
      "                            : baseSteps;",
      "                          return (",
      "                            <div className=\"flex items-start\">"
    ]
  },
  {
    "name": "P10 Parcours : affichage de la date (date seule si dateOnly)",
    "find": [
      "{step.done && step.date ? formatDateTime(step.date) : step.done ? \"\" : \"En attente\"}"
    ],
    "replace": [
      "{step.done && step.date ? (step.dateOnly ? formatDateOnly(step.date) : formatDateTime(step.date)) : step.done ? \"\" : \"En attente\"}"
    ]
  },
  {
    "name": "P11 Parcours : pastille rouge pour l'etape Annulée",
    "find": [
      "h-3 w-3 rounded-full shrink-0 ${step.done ? \"bg-[#8f6075]\" : \"bg-[#eadfe4]\"}"
    ],
    "replace": [
      "h-3 w-3 rounded-full shrink-0 ${step.danger ? \"bg-red-500\" : step.done ? \"bg-[#8f6075]\" : \"bg-[#eadfe4]\"}"
    ]
  },
  {
    "name": "P12 Parcours : libelle rouge pour l'etape Annulée",
    "find": [
      "${step.done ? \"text-[#412f3b] font-medium\" : \"text-[#a79aa1]\"}"
    ],
    "replace": [
      "${step.danger ? \"text-red-700 font-medium\" : step.done ? \"text-[#412f3b] font-medium\" : \"text-[#a79aa1]\"}"
    ]
  },
  {
    "name": "P13 Appel de TransferPanel avec l'historique",
    "find": [
      "<TransferPanel order={o} onDone={(msg) => { setAdminNotice(msg); load(); }} />"
    ],
    "replace": [
      "<TransferPanel order={o} history={statusHistoryByOrder[o.id]} onDone={(msg) => { setAdminNotice(msg); load(); }} />"
    ]
  },
  {
    "name": "P14 Bloc Expedition masque sur une commande annulee (debut)",
    "find": [
      "<div className=\"mb-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3.5\">",
      "<div className=\"text-xs font-medium text-[#8b737e] mb-2.5\">Expédition</div>"
    ],
    "replace": [
      "{/* ZENORIA_ORDER_JOURNAL_V1 : le bloc Expédition n'a pas de sens sur une commande annulée */}",
      "                      {o.status !== \"cancelled\" && (",
      "                      <div className=\"mb-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3.5\">",
      "                        <div className=\"text-xs font-medium text-[#8b737e] mb-2.5\">Expédition</div>"
    ]
  },
  {
    "name": "P15 Bloc Expedition masque sur une commande annulee (fin)",
    "find": [
      "{invoiceErrorMsg}</div>",
      ")}",
      "</div>",
      "<div className=\"grid md:grid-cols-2 gap-4\">"
    ],
    "replace": [
      "{invoiceErrorMsg}</div>",
      "                        )}",
      "                      </div>",
      "                      )}",
      "                      <div className=\"grid md:grid-cols-2 gap-4\">"
    ]
  },
  {
    "name": "P16 Journal de la commande sous les articles et l'adresse",
    "find": [
      "<strong>Total : {formatOrderPrice(o.total)}</strong>",
      "</p>",
      "</div>",
      "</div>",
      "</td>"
    ],
    "replace": [
      "<strong>Total : {formatOrderPrice(o.total)}</strong>",
      "                          </p>",
      "                        </div>",
      "                      </div>",
      "                      <OrderHistoryLog history={statusHistoryByOrder[o.id]} />",
      "                    </td>"
    ]
  }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}

if (!mode) fail("indiquez --dry-run ou --apply.");
if (!fs.existsSync(TARGET)) fail(TARGET + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");

const original = fs.readFileSync(TARGET, "utf8");
const usesCrlf = original.includes("\r\n");
let content = original.replace(/\r\n/g, "\n");

if (content.includes(MARKER)) fail("le patch est deja applique (marqueur " + MARKER + " present).");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+"), "g");

console.log("Fichier : " + TARGET + " (fins de ligne " + (usesCrlf ? "Windows CRLF" : "Unix LF") + ")");
console.log("Mode    : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");

const problems = [];
for (const p of PATCHES) {
  const matches = content.match(toRegex(p.find));
  const count = matches ? matches.length : 0;
  console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
  if (count !== 1) problems.push(p.name + " (" + count + " occurrence(s) au lieu de 1)");
}
if (problems.length > 0) fail("ancre(s) a verifier :\n  - " + problems.join("\n  - "));

for (const p of PATCHES) {
  const replacement = p.replace.join("\n");
  content = content.replace(toRegex(p.find), () => replacement);
}

if ((content.match(new RegExp(MARKER, "g")) || []).length < 6) fail("controle final : marqueurs inattendus.");
for (const needle of ["OrderHistoryLog", "formatDateOnly", "baseSteps", "transfer-cancel-reason"]) {
  if (!content.includes(needle)) fail("controle final : " + needle + " absent apres patch.");
}

if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + PATCHES.length + " ancres sont trouvees une seule fois. Rien n'a ete ecrit.");
  console.log("Etape suivante : node patch-lot5bis-a.mjs --apply");
  process.exit(0);
}

fs.writeFileSync(TARGET, usesCrlf ? content.replace(/\n/g, "\r\n") : content, "utf8");
console.log("\nPATCH APPLIQUE : " + PATCHES.length + " modifications dans " + TARGET + ".");
console.log("Etapes suivantes : git diff --stat, puis npm run build, puis npm run dev.");
