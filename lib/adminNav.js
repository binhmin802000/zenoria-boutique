// ============================================================
// adminNav.js - Structure de la navigation de l'administration (/admin)
//
// Trois groupes, chacun avec ses onglets :
//   Produits  : Collections, Familles, Codes promo (avec les bandeaux), Contenu du site
//   CRM       : Comptes, À venir
//   Technique : Connexions, Quotas, Maintenance, Santé
//
// Pour AJOUTER un onglet : ajoutez une ligne ici (identifiant unique + libellé), une icône dans
// pages/admin.js (TAB_ICONS), puis le contenu correspondant dans la page.
// Pour RÉSERVER un onglet à un futur rôle (super administrateur), c'est ici qu'on filtrera la liste.
//
// La position est conservée dans l'adresse de la page : /admin#technique/sante. Les fonctions
// ci-dessous lisent et fabriquent cette adresse. Elles sont indépendantes de React et testées seules.
// ============================================================

export const ADMIN_NAV = [
  {
    id: "produits",
    label: "Produits",
    tabs: [
      { id: "collections", label: "Collections" },
      { id: "familles", label: "Familles" },
      { id: "promos", label: "Codes promo" },
      { id: "site", label: "Contenu du site" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    tabs: [
      { id: "comptes", label: "Comptes" },
      { id: "commandes", label: "Commandes" },
      { id: "avenir", label: "À venir" },
    ],
  },
  {
    id: "technique",
    label: "Technique",
    tabs: [
      { id: "connexions", label: "Connexions" },
      { id: "quotas", label: "Quotas" },
      { id: "maintenance", label: "Maintenance" },
      { id: "sante", label: "Santé" },
    ],
  },
];

export const DEFAULT_NAV = { group: "produits", sub: "collections" };

export function findGroup(id) {
  return ADMIN_NAV.find((g) => g.id === id) || null;
}

export function findGroupOfTab(tabId) {
  return ADMIN_NAV.find((g) => g.tabs.some((t) => t.id === tabId)) || null;
}

// Lit une adresse du type « #technique/sante » et renvoie { group, sub }, ou null si elle n'a rien à voir
// avec la navigation (par exemple un lien de connexion reçu par e-mail).
//  - « #technique »            -> premier onglet du groupe
//  - « #technique/inconnu »    -> premier onglet du groupe
//  - « #quotas »               -> raccourci : l'onglet est retrouvé dans son groupe
//  - tout le reste             -> null
export function parseAdminHash(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  if (!raw || !/^[a-z0-9-]+(\/[a-z0-9-]*)?\/?$/.test(raw)) return null;
  const [first, second] = raw.split("/");
  const group = findGroup(first);
  if (group) {
    const sub = group.tabs.find((t) => t.id === second);
    return { group: group.id, sub: sub ? sub.id : group.tabs[0].id };
  }
  const owner = findGroupOfTab(first);
  if (owner && !second) return { group: owner.id, sub: first };
  return null;
}

export function buildAdminHash(group, sub) {
  return "#" + group + "/" + sub;
}

// Un lien de connexion Supabase (confirmation d'inscription, mot de passe oublié) arrive avec une adresse
// du type « #access_token=...&type=signup ». On ne doit jamais l'écraser : le client Supabase la lit.
export function isAuthCallbackHash(hash) {
  return /[=&]/.test(String(hash || ""));
}

// Niveau d'alerte à afficher sur le groupe « Technique » : le pire de ses onglets.
//  quotaLevel      : "ok" | "warn" | "critical" (voir lib/quota.js)
//  maintenanceMode : "off" | "shop_pause" | "full"
export function technicalAlertLevel(quotaLevel, maintenanceMode) {
  if (quotaLevel === "critical" || maintenanceMode === "full") return "critical";
  if ((quotaLevel && quotaLevel !== "ok") || maintenanceMode === "shop_pause") return "warn";
  return "ok";
}
