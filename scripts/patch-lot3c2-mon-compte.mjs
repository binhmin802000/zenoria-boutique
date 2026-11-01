#!/usr/bin/env node
// ============================================================
// PATCH SOUS-LOT 3c-2 : etape 3 du virement - Mon compte (pages/compte.js)
// Modifie : pages/compte.js uniquement. Reutilise components/TransferInstructions.js (lot 3c-1, deja cree).
// Prerequis : lots 3a, 3a-bis, 3b et 3c-1 appliques en base et en code.
//
// Contenu :
//   - Liste des commandes : toutes les commandes par virement (tout statut) + commandes carte abouties
//     + les 5 dernieres commandes carte non abouties ("Paiement non finalisé")
//   - Detail d'une commande en attente de virement : coordonnees (TransferInstructions) + bouton « Annuler ma commande »
//     (avec confirmation et note facultative, 500 caracteres), via customer_cancel_transfer_order
//   - Detail d'une commande annulee : plus de suivi, message « Commande annulée » avec la raison si elle existe
//   - « Total payé » -> « Total » ; bouton facture reserve aux commandes abouties
//   - Mises a jour (prolongation, confirmation, annulation) via customer_order_events, sans jamais l'adresse e-mail de l'auteur
//   - Accueil : le compteur ne porte que sur les commandes abouties ; une carte « en attente de virement » si besoin
//
// Usage, depuis la racine du projet (dossier zenoria) :
//   node scripts/patch-lot3c2-mon-compte.mjs --dry-run   -> controle chaque repere, n'ecrit RIEN
//   node scripts/patch-lot3c2-mon-compte.mjs --apply     -> ecrit si TOUT est conforme
// Garde-fous : rien n'est ecrit si un repere est absent ou en double, ou si le patch est deja applique.
// ============================================================
import fs from "node:fs";

const MARKER = "ZENORIA_STEP3C2_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "pages/compte.js",
  "patches": [
   {
    "name": "C1 import du composant partage",
    "find": [
     "import AccountDataSection from \"@/components/AccountDataSection\";"
    ],
    "replace": [
     "import AccountDataSection from \"@/components/AccountDataSection\";",
     "import TransferInstructions from \"@/components/TransferInstructions\"; // ZENORIA_STEP3C2_V1"
    ]
   },
   {
    "name": "C2 fonction d'affichage du statut pour une cliente (carte non finalisee)",
    "find": [
     "function formatEUR(n) {",
     "return new Intl.NumberFormat(\"fr-FR\", { style: \"currency\", currency: \"EUR\" }).format(Number(n) || 0);",
     "}"
    ],
    "replace": [
     "function formatEUR(n) {",
     "  return new Intl.NumberFormat(\"fr-FR\", { style: \"currency\", currency: \"EUR\" }).format(Number(n) || 0);",
     "}",
     "// ZENORIA_STEP3C2_V1 : une commande par carte non finalisee (pending, expiree, annulee) n'affiche pas son statut technique",
     "function customerOrderBadge(o) {",
     "  if (o.payment_method !== \"transfer\" && !CUSTOMER_VISIBLE_STATUSES.includes(o.status)) {",
     "    return { label: \"Paiement non finalisé\", className: \"bg-[#f3f1f5] text-[#8b737e]\" };",
     "  }",
     "  return orderStatusInfo(o.status);",
     "}"
    ]
   },
   {
    "name": "C3 OrderDetail : etats et logique (remplace info/total)",
    "find": [
     "const info = orderStatusInfo(order.status);",
     "const total = Number(order.total) || 0;"
    ],
    "replace": [
     "const isTransfer = order.payment_method === \"transfer\"; // ZENORIA_STEP3C2_V1",
     "  const isFinished = CUSTOMER_VISIBLE_STATUSES.includes(order.status);",
     "  const isCancelled = order.status === \"cancelled\";",
     "  const badge = isTransfer || isFinished ? orderStatusInfo(order.status) : { label: \"Paiement non finalisé\", className: \"bg-[#f3f1f5] text-[#8b737e]\" };",
     "  const total = Number(order.total) || 0;",
     "  const [events, setEvents] = useState([]);",
     "  const [cancelOpen, setCancelOpen] = useState(false);",
     "  const [cancelNote, setCancelNote] = useState(\"\");",
     "  const [cancelBusy, setCancelBusy] = useState(false);",
     "  const [cancelError, setCancelError] = useState(\"\");",
     "  useEffect(() => {",
     "    if (!isTransfer) { setEvents([]); return undefined; }",
     "    let alive = true;",
     "    supabase.rpc(\"customer_order_events\", { p_order_id: order.id }).then((res) => {",
     "      if (alive) setEvents(res && !res.error && res.data ? res.data : []);",
     "    });",
     "    return () => { alive = false; };",
     "  }, [order.id, isTransfer]);",
     "  const cancelEvent = [...events].reverse().find((e) => e.event_status === \"cancelled\" && e.message);",
     "  const cancelOrder = async () => {",
     "    setCancelBusy(true);",
     "    setCancelError(\"\");",
     "    try {",
     "      const { error: err } = await supabase.rpc(\"customer_cancel_transfer_order\", { p_order_id: order.id, p_note: cancelNote.trim() || null });",
     "      if (err) throw err;",
     "      setCancelOpen(false);",
     "      if (onOrderChanged) onOrderChanged();",
     "    } catch (err) {",
     "      setCancelError(\"Impossible d'annuler la commande pour le moment. Réessayez, ou contactez-nous.\");",
     "    }",
     "    setCancelBusy(false);",
     "  };"
    ]
   },
   {
    "name": "C4 signature OrderDetail : ajout de onOrderChanged",
    "find": [
     "function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack }) {"
    ],
    "replace": [
     "function OrderDetail({ order, contactCfg, questionOpen, setQuestionOpen, onBack, onOrderChanged }) { // ZENORIA_STEP3C2_V1"
    ]
   },
   {
    "name": "C5 badge du statut dans l'en-tete du detail",
    "find": [
     "<span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${info.className}`}>{info.label}</span>"
    ],
    "replace": [
     "<span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${badge.className}`}>{badge.label}</span>"
    ]
   },
   {
    "name": "C6 suivi : virement en attente, annulee, ou abouti (remplace le suivi inconditionnel)",
    "find": [
     "<div className=\"mt-5\"><Timeline order={order} /></div>"
    ],
    "replace": [
     "{isTransfer && order.status === \"pending_transfer\" ? (",
     "        <div className=\"mt-5 space-y-3\">",
     "          <TransferInstructions orderId={order.id} contactCfg={contactCfg} />",
     "          <button type=\"button\" onClick={() => setCancelOpen(true)} data-testid=\"account-cancel-transfer\" className=\"rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1]\">Annuler ma commande</button>",
     "        </div>",
     "      ) : isCancelled ? (",
     "        <div className=\"mt-5 rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-sm text-[#54434c]\" data-testid=\"order-cancelled-note\">",
     "          <div className=\"font-medium text-[#412f3b]\">Commande annulée</div>",
     "          {cancelEvent && <div className=\"mt-1\">{cancelEvent.message}</div>}",
     "        </div>",
     "      ) : isFinished ? (",
     "        <div className=\"mt-5\"><Timeline order={order} /></div>",
     "      ) : null}"
    ]
   },
   {
    "name": "C7 libelle « Total » (plus « Total payé », car une commande peut etre en attente)",
    "find": [
     "<span>Total payé</span>"
    ],
    "replace": [
     "<span>Total</span>"
    ]
   },
   {
    "name": "C8 bouton facture reserve aux commandes abouties + bloc Mises a jour",
    "find": [
     "{/* ZENORIA_INVOICE_STEP3_V1 : facture PDF, générée à la demande (recomposée depuis des données figées) */}",
     "<button",
     "type=\"button\"",
     "onClick={async () => { setInvoiceBusy(true); setInvoiceError(\"\"); await downloadInvoice(order.id, setInvoiceError); setInvoiceBusy(false); }}",
     "disabled={invoiceBusy}",
     "data-testid=\"invoice-download-btn\"",
     "className=\"flex items-center gap-2 rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50\"",
     ">",
     "<FileDown size={15} /> {invoiceBusy ? \"Génération…\" : \"Télécharger la facture\"}",
     "</button>",
     "</div>"
    ],
    "replace": [
     "{/* ZENORIA_INVOICE_STEP3_V1 : facture PDF, générée à la demande (recomposée depuis des données figées) */}",
     "        {isFinished && (",
     "          <button",
     "            type=\"button\"",
     "            onClick={async () => { setInvoiceBusy(true); setInvoiceError(\"\"); await downloadInvoice(order.id, setInvoiceError); setInvoiceBusy(false); }}",
     "            disabled={invoiceBusy}",
     "            data-testid=\"invoice-download-btn\"",
     "            className=\"flex items-center gap-2 rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50\"",
     "          >",
     "            <FileDown size={15} /> {invoiceBusy ? \"Génération…\" : \"Télécharger la facture\"}",
     "          </button>",
     "        )}",
     "      </div>",
     "      {/* ZENORIA_STEP3C2_V1 : mises a jour du vendeur (prolongation, confirmation, annulation), note facultative visible */}",
     "      {isTransfer && events.filter((e) => e.message).length > 0 && (",
     "        <div className=\"mt-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3\" data-testid=\"order-updates\">",
     "          <div className=\"text-xs font-medium text-[#8b737e] mb-2\">Mises à jour</div>",
     "          <ul className=\"space-y-1.5\">",
     "            {events.filter((e) => e.message).map((e, i) => (",
     "              <li key={i} className=\"text-[13px] text-[#54434c]\"><span className=\"text-[11px] text-[#8b737e]\">{formatDate(e.event_at)}</span> — {e.message}</li>",
     "            ))}",
     "          </ul>",
     "        </div>",
     "      )}"
    ]
   },
   {
    "name": "C9 fenetre de confirmation d'annulation (apres le panneau de question)",
    "find": [
     "{questionOpen === order.id && <QuestionPanel order={order} contactCfg={contactCfg} onClose={() => setQuestionOpen(null)} />}"
    ],
    "replace": [
     "{questionOpen === order.id && <QuestionPanel order={order} contactCfg={contactCfg} onClose={() => setQuestionOpen(null)} />}",
     "      {cancelOpen && (",
     "        <div className=\"fixed inset-0 z-[60] grid place-items-center bg-black/40 px-4\" role=\"dialog\" aria-modal=\"true\" data-testid=\"account-cancel-dialog\">",
     "          <div className=\"w-full max-w-md rounded-2xl bg-[#fbf8f4] p-6 shadow-2xl\">",
     "            <h3 className=\"font-serif text-xl text-[#412f3b]\">Annuler cette commande ?</h3>",
     "            <p className=\"mt-2 text-sm text-[#54434c]\">Votre bijou sera remis en vente. Cette action est définitive.</p>",
     "            <label className=\"mt-3 block text-[12px] text-[#54434c]\">",
     "              Pouvez-vous nous dire pourquoi ? (facultatif)",
     "              <textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={500} rows={3} data-testid=\"account-cancel-note\" className=\"mt-1 w-full rounded-xl border border-[#eadfe4] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#8f6075]\" />",
     "            </label>",
     "            {cancelError && <p role=\"alert\" className=\"mt-2 text-[12px] text-red-600\">{cancelError}</p>}",
     "            <div className=\"flex gap-2 mt-4\">",
     "              <button type=\"button\" onClick={cancelOrder} disabled={cancelBusy} data-testid=\"account-cancel-confirm\" className=\"rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 text-sm disabled:opacity-60\">{cancelBusy ? \"Annulation…\" : \"Oui, annuler\"}</button>",
     "              <button type=\"button\" onClick={() => setCancelOpen(false)} className=\"rounded-full border border-[#d9c5cc] px-5 h-10 text-sm hover:bg-[#f5edf1]\">Retour</button>",
     "            </div>",
     "          </div>",
     "        </div>",
     "      )}"
    ]
   },
   {
    "name": "C10 etat : version des commandes (recharge apres annulation)",
    "find": [
     "const [questionOpenId, setQuestionOpenId] = useState(null);"
    ],
    "replace": [
     "const [questionOpenId, setQuestionOpenId] = useState(null);",
     "  const [ordersVersion, setOrdersVersion] = useState(0); // ZENORIA_STEP3C2_V1 : recharge apres annulation"
    ]
   },
   {
    "name": "C11 requete des commandes : plus de filtre de statut (tri effectue ensuite)",
    "find": [
     ".eq(\"user_id\", user.id).in(\"status\", CUSTOMER_VISIBLE_STATUSES).order(\"created_at\", { ascending: false }), // ZENORIA_ACCOUNT_FIX1_V1 : filtre explicite (ne pas dépendre de la RLS, qui laisse un compte admin tout voir)"
    ],
    "replace": [
     ".eq(\"user_id\", user.id).order(\"created_at\", { ascending: false }), // ZENORIA_ACCOUNT_FIX1_V1 : filtre explicite (ne pas dépendre de la RLS, qui laisse un compte admin tout voir) ; ZENORIA_STEP3C2_V1 : plus de filtre de statut ici (tri effectue ensuite, voir plus bas)"
    ]
   },
   {
    "name": "C12 regroupement des commandes (virement + abouties + 5 dernieres non abouties)",
    "find": [
     "setOrders(enriched);"
    ],
    "replace": [
     "// ZENORIA_STEP3C2_V1 : virement (tout statut) + commandes carte abouties + 5 dernieres commandes carte non abouties",
     "      const transferOrders = enriched.filter((o) => o.payment_method === \"transfer\");",
     "      const cardFinished = enriched.filter((o) => o.payment_method !== \"transfer\" && CUSTOMER_VISIBLE_STATUSES.includes(o.status));",
     "      const cardUnfinished = enriched.filter((o) => o.payment_method !== \"transfer\" && !CUSTOMER_VISIBLE_STATUSES.includes(o.status)).slice(0, 5);",
     "      setOrders([...transferOrders, ...cardFinished, ...cardUnfinished]);"
    ]
   },
   {
    "name": "C13 dependance de l'effet des commandes : recharge apres annulation",
    "find": [
     "return () => { alive = false; };",
     "}, [user]);"
    ],
    "replace": [
     "return () => { alive = false; };",
     "  }, [user, ordersVersion]); // ZENORIA_STEP3C2_V1 : recharge apres annulation"
    ]
   },
   {
    "name": "C14 compteur Accueil : seulement les commandes abouties",
    "find": [
     "const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;",
     "const lastOrder = orders[0] || null;"
    ],
    "replace": [
     "const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;",
     "  const finishedOrders = orders.filter((o) => CUSTOMER_VISIBLE_STATUSES.includes(o.status)); // ZENORIA_STEP3C2_V1",
     "  const pendingTransferOrders = orders.filter((o) => o.status === \"pending_transfer\"); // ZENORIA_STEP3C2_V1",
     "  const lastOrder = finishedOrders[0] || null;"
    ]
   },
   {
    "name": "C15 affichage du compteur « commande(s) » sur les commandes abouties",
    "find": [
     "<div className=\"font-serif text-2xl text-[#412f3b]\">{ordersLoading ? \"…\" : orders.length}</div>",
     "<div className=\"text-xs text-[#8b737e]\">commande{orders.length > 1 ? \"s\" : \"\"}</div>"
    ],
    "replace": [
     "<div className=\"font-serif text-2xl text-[#412f3b]\">{ordersLoading ? \"…\" : finishedOrders.length}</div>",
     "                      <div className=\"text-xs text-[#8b737e]\">commande{finishedOrders.length > 1 ? \"s\" : \"\"}</div>"
    ]
   },
   {
    "name": "C16 carte « en attente de virement » dans l'Accueil",
    "find": [
     "<a href=\"/\" className=\"inline-block rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 leading-10 text-sm\">Découvrir les créations</a>",
     "</div>",
     ")}",
     "</div>",
     ")}",
     "{current && current.id === \"commandes\" && ("
    ],
    "replace": [
     "<a href=\"/\" className=\"inline-block rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-5 h-10 leading-10 text-sm\">Découvrir les créations</a>",
     "                    </div>",
     "                  )}",
     "                  {pendingTransferOrders.map((o) => (",
     "                    <div key={o.id} className=\"mt-4 rounded-2xl border border-[#eee2e5] p-4\" data-testid={`home-pending-transfer-${o.id}`}>",
     "                      <div className=\"flex justify-between items-center mb-1\">",
     "                        <h3 className=\"font-serif text-lg text-[#412f3b]\">Commande en attente de virement</h3>",
     "                        <button type=\"button\" onClick={() => { setSelectedOrderId(o.id); go(\"commandes\"); }} className=\"text-xs text-[#8f6075] underline\">Voir les instructions</button>",
     "                      </div>",
     "                      <div className=\"text-sm text-[#54434c]\">Commande {o.reference} · {formatOrderPrice(o.total)}{o.transfer_due_at ? <> · à régler avant le {formatDate(o.transfer_due_at)}</> : null}</div>",
     "                    </div>",
     "                  ))}",
     "                </div>",
     "              )}",
     "              {current && current.id === \"commandes\" && ("
    ]
   },
   {
    "name": "C17 description de la rubrique Mes commandes",
    "find": [
     "<p className=\"text-xs text-[#8b737e] mb-4\">Les commandes payées, expédiées ou livrées apparaissent ici.</p>"
    ],
    "replace": [
     "<p className=\"text-xs text-[#8b737e] mb-4\">Vos commandes abouties, vos commandes en attente de virement et vos 5 derniers paiements par carte non finalisés apparaissent ici.</p>"
    ]
   },
   {
    "name": "C18 badge de statut dans la liste des commandes",
    "find": [
     "<span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${orderStatusInfo(o.status).className}`}>{orderStatusInfo(o.status).label}</span>"
    ],
    "replace": [
     "<span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${customerOrderBadge(o).className}`}>{customerOrderBadge(o).label}</span>"
    ]
   },
   {
    "name": "C19 transmission de onOrderChanged a OrderDetail",
    "find": [
     "<OrderDetail",
     "order={selectedOrder}",
     "contactCfg={contactCfg}",
     "questionOpen={questionOpenId}",
     "setQuestionOpen={setQuestionOpenId}",
     "onBack={() => setSelectedOrderId(null)}",
     "/>"
    ],
    "replace": [
     "<OrderDetail",
     "                      order={selectedOrder}",
     "                      contactCfg={contactCfg}",
     "                      questionOpen={questionOpenId}",
     "                      setQuestionOpen={setQuestionOpenId}",
     "                      onBack={() => setSelectedOrderId(null)}",
     "                      onOrderChanged={() => { setSelectedOrderId(null); setOrdersVersion((v) => v + 1); }} // ZENORIA_STEP3C2_V1",
     "                    />"
    ]
   }
  ],
  "finals": [
   "TransferInstructions orderId={order.id}",
   "customer_order_events",
   "customer_cancel_transfer_order",
   "account-cancel-dialog",
   "ZENORIA_STEP3C2_V1",
   "finishedOrders.length",
   "pendingTransferOrders.map",
   "customerOrderBadge(o)"
  ],
  "forbidden": [
   "Total payé",
   "orders.length > 1",
   "const lastOrder = orders[0] || null;",
   ".in(\"status\", CUSTOMER_VISIBLE_STATUSES).order(\"created_at\", { ascending: false }), // ZENORIA_ACCOUNT_FIX1_V1 : filtre explicite (ne pas dépendre de la RLS, qui laisse un compte admin tout voir)\n",
   "Les commandes payées, expédiées ou livrées apparaissent ici."
  ]
 }
];

function fail(message) {
  console.error("\nECHEC : " + message);
  console.error("Aucun fichier n'a ete modifie.");
  process.exit(1);
}
if (!mode) fail("indiquez --dry-run ou --apply.");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) =>
  new RegExp(escapeRegex(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+").split("§APOS§").join("(?:&apos;|'|\u2019)"), "g");

console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = [];
const problems = [];

for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  for (const p of f.patches) {
    const count = (content.match(toRegex(p.find)) || []).length;
    console.log((count === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + count + " occurrence(s)");
    if (count !== 1) problems.push(f.path + " : " + p.name + " (" + count + " occurrence(s) au lieu de 1)");
  }
  results.push({ f, content, crlf });
}
if (problems.length > 0) fail("verifier :\n  - " + problems.join("\n  - "));

for (const r of results) for (const p of r.f.patches) r.content = r.content.replace(toRegex(p.find), () => p.replace.join("\n"));

for (const r of results) {
  for (const needle of r.f.finals) if (!r.content.includes(needle)) fail("controle final " + r.f.path + " : « " + needle + " » absent apres patch.");
  for (const bad of r.f.forbidden) if (r.content.includes(bad)) fail("controle final " + r.f.path + " : « " + bad + " » est toujours present apres patch.");
}
if (mode === "dry") {
  console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit.");
  console.log("Etape suivante : node scripts/patch-lot3c2-mon-compte.mjs --apply");
  process.exit(0);
}
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichier(s) modifie(s).");
console.log("Etapes suivantes : git status --short, puis npm run build.");
console.log("Retour arriere avant commit : git restore pages/compte.js");
