#!/usr/bin/env node
// ============================================================
// PATCH LOT 5a : navigation de l'administration
//  - lib/adminNav.js : nouveau groupe « Réglages » (Moyens de paiement, Facturation et TVA) ; onglet « À venir » supprimé
//  - pages/admin.js : icônes et contenu des onglets Réglages ; plus d'onglet « À venir »
//  - components/AdminCrm.js : Facturation et Moyens de paiement quittent le haut de Commandes ; CrmRoadmap supprimé ;
//    deux textes obsolètes de l'onglet Comptes corrigés
// Aucune base de données, aucun changement côté cliente. Les composants AdminBilling et AdminPaymentMethods ne changent pas.
//   node scripts/patch-lot5a-navigation.mjs --dry-run
//   node scripts/patch-lot5a-navigation.mjs --apply
// ============================================================
import fs from "node:fs";
import path from "node:path";
const MARKER = "ZENORIA_ADMIN_NAV_5A_V1";
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry" : null;
const FILES = [
 {
  "path": "lib/adminNav.js",
  "patches": [
   {
    "name": "N1 commentaire d'en-tete",
    "find": [
     "// Trois groupes, chacun avec ses onglets :",
     "//   Produits  : Collections, Familles, Codes promo (avec les bandeaux), Contenu du site",
     "//   CRM       : Comptes, À venir",
     "//   Technique : Connexions, Quotas, Maintenance, Santé"
    ],
    "replace": [
     "// Quatre groupes, chacun avec ses onglets (ZENORIA_ADMIN_NAV_5A_V1) :",
     "//   Produits  : Bijoux, Familles, Codes promo (avec les bandeaux), Contenu du site",
     "//   CRM       : Comptes, Commandes, Avis, RGPD (« À venir » supprimé)",
     "//   Réglages  : Moyens de paiement, Facturation et TVA (déplacés depuis l'onglet Commandes)",
     "//   Technique : Connexions, Quotas, Maintenance, Santé"
    ]
   },
   {
    "name": "N2 suppression de l'onglet « À venir »",
    "find": [
     "{ id: \"avenir\", label: \"À venir\" },"
    ],
    "replace": [
     "// « À venir » supprimé (lot 5a) : l'ancienne adresse #crm/avenir ouvre le premier onglet du CRM"
    ]
   },
   {
    "name": "N3 groupe « Réglages » (avant Technique)",
    "find": [
     "{",
     "id: \"technique\",",
     "label: \"Technique\","
    ],
    "replace": [
     "  {",
     "    id: \"reglages\",",
     "    label: \"Réglages\",",
     "    tabs: [",
     "      { id: \"paiement\", label: \"Moyens de paiement\" },",
     "      { id: \"facturation\", label: \"Facturation et TVA\" },",
     "    ],",
     "  },",
     "  {",
     "    id: \"technique\",",
     "    label: \"Technique\","
    ]
   }
  ],
  "finals": [
   "id: \"reglages\"",
   "id: \"paiement\"",
   "id: \"facturation\"",
   "ZENORIA_ADMIN_NAV_5A_V1"
  ],
  "forbidden": [
   "id: \"avenir\""
  ]
 },
 {
  "path": "pages/admin.js",
  "patches": [
   {
    "name": "A1 icones des nouveaux onglets",
    "find": [
     "ChevronRight, ShieldCheck } from \"lucide-react\";"
    ],
    "replace": [
     "ChevronRight, ShieldCheck, CreditCard, FileText, SlidersHorizontal } from \"lucide-react\"; // ZENORIA_ADMIN_NAV_5A_V1 : icônes du groupe Réglages"
    ]
   },
   {
    "name": "A2 import : plus de CrmRoadmap, cartes de reglages",
    "find": [
     "import { CrmAccounts, CrmRoadmap, AdminOrders } from \"@/components/AdminCrm\";"
    ],
    "replace": [
     "import { CrmAccounts, AdminOrders } from \"@/components/AdminCrm\";",
     "import AdminBilling from \"@/components/AdminBilling\"; // ZENORIA_ADMIN_NAV_5A_V1 : déplacé depuis l'onglet Commandes",
     "import AdminPaymentMethods from \"@/components/AdminPaymentMethods\"; // ZENORIA_ADMIN_NAV_5A_V1 : déplacé depuis l'onglet Commandes"
    ]
   },
   {
    "name": "A3 commentaire de navigation",
    "find": [
     "// NAVIGATION : trois groupes (Produits, CRM, Technique), chacun avec ses onglets. La structure est"
    ],
    "replace": [
     "// NAVIGATION : quatre groupes (Produits, CRM, Réglages, Technique), chacun avec ses onglets. La structure est"
    ]
   },
   {
    "name": "A4 icone du groupe Reglages",
    "find": [
     "const GROUP_ICONS = { produits: Package, crm: Users, technique: Settings };"
    ],
    "replace": [
     "const GROUP_ICONS = { produits: Package, crm: Users, reglages: SlidersHorizontal, technique: Settings };"
    ]
   },
   {
    "name": "A5 icones des onglets Reglages",
    "find": [
     "avenir: Clock,"
    ],
    "replace": [
     "  paiement: CreditCard, // ZENORIA_ADMIN_NAV_5A_V1",
     "  facturation: FileText,"
    ]
   },
   {
    "name": "A6 contenu des onglets Reglages",
    "find": [
     "{tab === \"avenir\" && <CrmRoadmap />}"
    ],
    "replace": [
     "        {/* ZENORIA_ADMIN_NAV_5A_V1 : groupe Réglages (cartes déplacées depuis l'onglet Commandes, contenu inchangé) */}",
     "        {tab === \"paiement\" && (",
     "          <>",
     "            <div className=\"mb-5\">",
     "              <h1 className=\"font-serif text-2xl\">Moyens de paiement</h1>",
     "              <p className=\"text-sm text-[#8b737e]\">Carte et virement, coordonnées bancaires, délais de paiement et d&apos;annulation automatique</p>",
     "            </div>",
     "            <AdminPaymentMethods />",
     "          </>",
     "        )}",
     "        {tab === \"facturation\" && (",
     "          <>",
     "            <div className=\"mb-5\">",
     "              <h1 className=\"font-serif text-2xl\">Facturation et TVA</h1>",
     "              <p className=\"text-sm text-[#8b737e]\">Identité du vendeur, TVA et numérotation des factures</p>",
     "            </div>",
     "            <AdminBilling />",
     "          </>",
     "        )}"
    ]
   }
  ],
  "finals": [
   "SlidersHorizontal",
   "<AdminPaymentMethods />",
   "<AdminBilling />",
   "tab === \"facturation\"",
   "ZENORIA_ADMIN_NAV_5A_V1"
  ],
  "forbidden": [
   "CrmRoadmap",
   "avenir:"
  ]
 },
 {
  "path": "components/AdminCrm.js",
  "patches": [
   {
    "name": "C1 imports deplaces",
    "find": [
     "import AdminBilling from \"@/components/AdminBilling\"; // ZENORIA_BILLING_STEP2_V1",
     "import AdminPaymentMethods from \"@/components/AdminPaymentMethods\"; // ZENORIA_PAYMENT_STEP2_V1"
    ],
    "replace": [
     "// ZENORIA_ADMIN_NAV_5A_V1 : AdminBilling et AdminPaymentMethods sont affichés dans le groupe Réglages (pages/admin.js)"
    ]
   },
   {
    "name": "C2 commentaire d'en-tete",
    "find": [
     "//  - CrmRoadmap  : ce qui viendra, avec ce dont chaque élément dépend. Rien n'y est enregistré."
    ],
    "replace": [
     "//  - AdminOrders : les commandes (l'ancien écran « À venir », CrmRoadmap, est supprimé au lot 5a)."
    ]
   },
   {
    "name": "C3 texte d'information des comptes (obsolete)",
    "find": [
     "Les comptes affichent désormais le prénom, le nom et le téléphone quand la cliente les a renseignés.",
     "Les adresses de livraison et l'historique des commandes viendront avec le paiement en ligne : voir l'onglet « À venir »."
    ],
    "replace": [
     "        Les comptes affichent le prénom, le nom et le téléphone quand la cliente les a renseignés.",
     "        Les commandes et les adresses de livraison se consultent dans CRM › Commandes."
    ]
   },
   {
    "name": "C4 mention RGPD des comptes (obsolete)",
    "find": [
     "Les adresses e-mail sont des données personnelles : cet écran est réservé à l'administration. En attendant un outil d'export et d'effacement, une demande",
     "d'effacement se traite à la main dans Supabase (Authentication, Users). L'historique des connexions et les adresses IP restent dans Technique, onglet Connexions."
    ],
    "replace": [
     "        Les adresses e-mail sont des données personnelles : cet écran est réservé à l&apos;administration. Les demandes d&apos;export ou d&apos;effacement",
     "        des données se traitent dans CRM › RGPD. L&apos;historique des connexions et les adresses IP restent dans Technique › Connexions."
    ]
   },
   {
    "name": "C5 cartes retirees du haut de Commandes",
    "find": [
     "{/* ZENORIA_BILLING_STEP2_V1 */}",
     "<AdminBilling />",
     "{/* ZENORIA_PAYMENT_STEP2_V1 */}",
     "<AdminPaymentMethods />"
    ],
    "replace": [
     "      {/* ZENORIA_ADMIN_NAV_5A_V1 : Facturation et Moyens de paiement sont dans le groupe Réglages */}"
    ]
   }
  ],
  "cutFrom": "// Ce qui viendra, avec ce dont chaque élément dépend.",
  "finals": [
   "ZENORIA_ADMIN_NAV_5A_V1",
   "CRM › RGPD",
   "CRM › Commandes"
  ],
  "forbidden": [
   "CrmRoadmap(",
   "ROADMAP",
   "<AdminBilling",
   "<AdminPaymentMethods",
   "onglet « À venir »",
   "Supabase (Authentication, Users)"
  ]
 }
];
function fail(m) { console.error("\nECHEC : " + m); console.error("Aucun fichier n'a ete modifie."); process.exit(1); }
if (!mode) fail("indiquez --dry-run ou --apply.");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (lines) => new RegExp(esc(lines.map((l) => l.trim()).join("\n")).replace(/\s+/g, "\\s+").split("'").join("(?:&apos;|'|\u2019)"), "g");
console.log("Mode : " + (mode === "apply" ? "APPLICATION" : "DRY-RUN (aucune ecriture)") + "\n");
const results = []; const problems = [];
for (const f of FILES) {
  if (!fs.existsSync(f.path)) fail(f.path + " est introuvable. Lancez la commande depuis la racine du projet (dossier zenoria).");
  const original = fs.readFileSync(f.path, "utf8");
  const crlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");
  console.log(f.path + " (fins de ligne " + (crlf ? "Windows CRLF" : "Unix LF") + ")");
  if (content.includes(MARKER)) fail(f.path + " : le patch est deja applique (marqueur " + MARKER + " present).");
  const before = problems.length;
  for (const p of f.patches) { const c = (content.match(toRegex(p.find)) || []).length; console.log((c === 1 ? "  OK  " : " ERREUR ") + p.name + " : " + c + " occurrence(s)"); if (c !== 1) problems.push(f.path + " : " + p.name + " (" + c + " occurrence(s) au lieu de 1)"); }
  if (f.cutFrom) {
    const i = content.indexOf(f.cutFrom), j = content.lastIndexOf(f.cutFrom);
    const tail = i >= 0 ? content.slice(i) : "";
    const ok = i >= 0 && i === j && tail.includes("export function CrmRoadmap(") && (tail.match(/export function /g) || []).length === 1;
    console.log((ok ? "  OK  " : " ERREUR ") + "C6 suppression de l'ecran « À venir » (CrmRoadmap, en fin de fichier)");
    if (!ok) problems.push(f.path + " : bloc CrmRoadmap introuvable ou suivi d'autre code");
  }
  if (problems.length === before) {
    for (const p of f.patches) content = content.replace(toRegex(p.find), () => p.replace.join("\n"));
    if (f.cutFrom) content = content.slice(0, content.indexOf(f.cutFrom)).replace(/\s+$/, "\n");
  }
  results.push({ f, content, crlf });
}
if (problems.length) fail("verifier :\n  - " + problems.join("\n  - "));
for (const r of results) {
  for (const n of r.f.finals) if (!r.content.includes(n)) fail("controle final " + r.f.path + " : « " + n + " » absent apres patch.");
  for (const b of r.f.forbidden) if (r.content.includes(b)) fail("controle final " + r.f.path + " : « " + b + " » encore present apres patch.");
}
// Autres fichiers qui utiliseraient encore l'ancien onglet (tests, liens) : simple avertissement
const others = [];
const walk = (dir) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!["node_modules", ".next", ".git"].includes(e.name)) walk(p); } else if (/\.(m?js|jsx|ts|tsx)$/.test(e.name) && !FILES.some((f) => path.normalize(f.path) === path.normalize(p)) && !/patch-lot/.test(e.name)) { const s = fs.readFileSync(p, "utf8"); if (s.includes("CrmRoadmap") || /["']avenir["']|#crm\/avenir/.test(s)) others.push(p); } } };
["pages", "components", "lib", "tests", "test", "__tests__", "scripts"].forEach(walk);
if (others.length) console.log("\nATTENTION : ces fichiers parlent encore de l'onglet « À venir » (a verifier) :\n  - " + others.join("\n  - "));
if (mode === "dry") { console.log("\nDRY-RUN termine : les " + FILES.length + " fichiers sont conformes. Rien n'a ete ecrit."); process.exit(0); }
for (const r of results) fs.writeFileSync(r.f.path, r.crlf ? r.content.replace(/\n/g, "\r\n") : r.content, "utf8");
console.log("\nPATCH APPLIQUE : " + results.length + " fichiers modifies.");
console.log("Retour arriere avant commit : git restore lib/adminNav.js pages/admin.js components/AdminCrm.js");
