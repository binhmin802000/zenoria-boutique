// patch-admincrm-profils.mjs
//
// Ajustement de components/AdminCrm.js apres la phase 1 (tables
// customer_profiles / customer_addresses) :
//   1. load() va aussi chercher customer_profiles (prenom, nom, telephone)
//      et relie chaque compte a son profil via account_id <-> user_id.
//   2. Le tableau des comptes affiche deux nouvelles colonnes : Nom, Telephone.
//   3. Le bandeau d'information est reformule (les fiches clientes ne sont
//      plus "a venir").
//   4. L'entree "Fiches clientes" est retiree de la liste ROADMAP.
//
// Garanties : verifie TOUS les reperes avant d'ecrire, n'ecrit rien si un
// seul manque, liste les reperes manquants avec un extrait, garde les fins
// de ligne du fichier, peut etre relance sans effet.
//
// Usage : node patch-admincrm-profils.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("components", "AdminCrm.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const usesCRLF = raw.includes("\r\n");
const eol = usesCRLF ? "\r\n" : "\n";
const lines = raw.split(/\r\n|\n/);

function indentOf(line) {
  const m = line.match(/^[ \t]*/);
  return m ? m[0] : "";
}

// Trouve l'unique ligne dont le texte "trim" vaut exactement `needle`.
function findExact(needle, { label } = {}) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === needle) matches.push(i);
  }
  return { ok: matches.length === 1, index: matches[0] ?? -1, count: matches.length, label };
}

// Trouve l'unique ligne contenant `substr`.
function findSubstring(substr, { label } = {}) {
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(substr)) matches.push(i);
  }
  return { ok: matches.length === 1, index: matches[0] ?? -1, count: matches.length, label };
}

const missing = [];
function need(result) {
  if (!result.ok) {
    missing.push({
      label: result.label,
      detail: `(${result.count} correspondance(s) trouvée(s), 1 attendue)`,
    });
  }
  return result;
}

// ---------------------------------------------------------------------
// 1) Idempotence : deja applique ?
// ---------------------------------------------------------------------
if (raw.includes('supabase.from("customer_profiles")') && raw.includes(">Nom</th>")) {
  console.log("✓ Rien à modifier : l'ajustement est déjà en place dans components/AdminCrm.js.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// 2) Repérage de la fonction load() d'origine (bloc complet, 12 lignes)
// ---------------------------------------------------------------------
const loadStart = findExact("const load = useCallback(async () => {", {
  label: "début de la fonction load() (components/AdminCrm.js)",
});
need(loadStart);

const expectedLoadBody = [
  "const load = useCallback(async () => {",
  "setLoading(true);",
  'setError("");',
  'const { data, error: err } = await supabase.rpc("admin_list_accounts");',
  "if (err) {",
  "setError(friendlyError(err));",
  "setAccounts([]);",
  "} else {",
  "setAccounts(data || []);",
  "}",
  "setLoading(false);",
  "}, []);",
];

let loadEnd = -1;
if (loadStart.ok) {
  let matches = true;
  for (let k = 0; k < expectedLoadBody.length; k++) {
    const line = lines[loadStart.index + k];
    if (!line || line.trim() !== expectedLoadBody[k]) {
      matches = false;
      break;
    }
  }
  if (matches) {
    loadEnd = loadStart.index + expectedLoadBody.length - 1;
  } else {
    missing.push({
      label: "contenu exact de la fonction load() (components/AdminCrm.js)",
      detail: "(le corps de la fonction ne correspond plus exactement à ce qui était attendu)",
    });
  }
}

// ---------------------------------------------------------------------
// 3) Autres repères (structurels, non sensibles aux accents)
// ---------------------------------------------------------------------
const noticeOpen = need(
  findSubstring('data-testid="crm-notice"', { label: "ouverture du bandeau d'information (components/AdminCrm.js)" })
);

let noticeClose = -1;
if (noticeOpen.ok) {
  for (let i = noticeOpen.index + 1; i < Math.min(noticeOpen.index + 8, lines.length); i++) {
    if (lines[i].trim() === "</div>") {
      noticeClose = i;
      break;
    }
  }
  if (noticeClose === -1) {
    missing.push({
      label: "fermeture du bandeau d'information (components/AdminCrm.js)",
      detail: "(aucune ligne « </div> » trouvée dans les 7 lignes suivantes)",
    });
  }
}

const emailHeader = need(
  findExact('<th className="px-4 py-3 font-medium">E-mail</th>', {
    label: "en-tête de colonne « E-mail » du tableau (components/AdminCrm.js)",
  })
);

const colSpanLine = need(
  findExact('<td colSpan={4} className="px-4 py-6 text-center text-[#8b737e]">', {
    label: "cellule « colSpan={4} » du tableau (components/AdminCrm.js)",
  })
);

const adminBadgeLine = need(
  findExact(
    '{a.is_admin_account && <span className="ml-2 rounded-full bg-[#f5edf1] text-[#8f6075] px-2 py-0.5 text-[11px]">Admin</span>}',
    { label: "ligne du badge « Admin » dans le tableau (components/AdminCrm.js)" }
  )
);

let adminBadgeClosingTd = -1;
if (adminBadgeLine.ok) {
  const next = lines[adminBadgeLine.index + 1];
  if (next && next.trim() === "</td>") {
    adminBadgeClosingTd = adminBadgeLine.index + 1;
  } else {
    missing.push({
      label: "fermeture </td> juste après le badge Admin (components/AdminCrm.js)",
      detail: "(la ligne suivante n'est pas « </td> »)",
    });
  }
}

const roadmapTitle = need(
  findExact('title: "Fiches clientes",', { label: "entrée « Fiches clientes » de ROADMAP (components/AdminCrm.js)" })
);

let roadmapEntryStart = -1;
let roadmapEntryEnd = -1;
if (roadmapTitle.ok) {
  const prev = lines[roadmapTitle.index - 1];
  if (prev && prev.trim() === "{") {
    roadmapEntryStart = roadmapTitle.index - 1;
  } else {
    missing.push({
      label: "accolade ouvrante avant « Fiches clientes » (components/AdminCrm.js)",
      detail: "(la ligne précédente n'est pas « { »)",
    });
  }
  for (let i = roadmapTitle.index + 1; i < Math.min(roadmapTitle.index + 6, lines.length); i++) {
    if (lines[i].trim() === "},") {
      roadmapEntryEnd = i;
      break;
    }
  }
  if (roadmapEntryEnd === -1) {
    missing.push({
      label: "accolade fermante « }, » après « Fiches clientes » (components/AdminCrm.js)",
      detail: "(aucune ligne « }, » trouvée dans les 5 lignes suivantes)",
    });
  }
}

// ---------------------------------------------------------------------
// 4) Arrêt si un seul repère manque
// ---------------------------------------------------------------------
if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • ${m.label}`);
    console.error(`    ${m.detail}`);
  }
  console.error("\nVérifiez le contenu actuel de components/AdminCrm.js et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// 5) Construction des insertions/remplacements (du BAS vers le HAUT, pour
//    que chaque position reste valable sans recalcul de décalage)
// ---------------------------------------------------------------------
const out = [...lines];

const edits = [];

// a) Retirer l'entrée "Fiches clientes" de ROADMAP
edits.push({ type: "delete", from: roadmapEntryStart, to: roadmapEntryEnd });

// b) Ajouter les deux <td> Nom / Téléphone, juste après le </td> du badge Admin
{
  const ind = indentOf(lines[adminBadgeClosingTd]);
  edits.push({
    type: "insertAfter",
    at: adminBadgeClosingTd,
    lines: [
      `${ind}<td className="px-4 py-3 whitespace-nowrap text-[#54434c]">`,
      `${ind}  {a.profile && (a.profile.first_name || a.profile.last_name)`,
      `${ind}    ? [a.profile.first_name, a.profile.last_name].filter(Boolean).join(" ")`,
      `${ind}    : "—"}`,
      `${ind}</td>`,
      `${ind}<td className="px-4 py-3 whitespace-nowrap text-[#54434c]">{a.profile?.phone || "—"}</td>`,
    ],
  });
}

// c) colSpan={4} -> colSpan={6}
{
  const ind = indentOf(lines[colSpanLine.index]);
  edits.push({
    type: "replace",
    at: colSpanLine.index,
    lines: [`${ind}<td colSpan={6} className="px-4 py-6 text-center text-[#8b737e]">`],
  });
}

// d) En-têtes "Nom" et "Téléphone", juste après l'en-tête "E-mail"
{
  const ind = indentOf(lines[emailHeader.index]);
  edits.push({
    type: "insertAfter",
    at: emailHeader.index,
    lines: [
      `${ind}<th className="px-4 py-3 font-medium">Nom</th>`,
      `${ind}<th className="px-4 py-3 font-medium">Téléphone</th>`,
    ],
  });
}

// e) Bandeau d'information : remplace le contenu entre l'ouverture et la fermeture
{
  const ind = indentOf(lines[noticeOpen.index + 1] || lines[noticeOpen.index]);
  edits.push({
    type: "replaceRange",
    from: noticeOpen.index + 1,
    to: noticeClose - 1,
    lines: [
      `${ind}Les comptes affichent désormais le prénom, le nom et le téléphone quand la cliente les a renseignés.`,
      `${ind}Les adresses de livraison et l'historique des commandes viendront avec le paiement en ligne : voir l'onglet « À venir ».`,
    ],
  });
}

// f) Fonction load() : remplace tout le bloc par la version qui va aussi
//    chercher customer_profiles et relie chaque compte à son profil.
{
  const ind = indentOf(lines[loadStart.index]);
  const ind2 = ind + "  ";
  const ind3 = ind2 + "  ";
  edits.push({
    type: "replaceRange",
    from: loadStart.index,
    to: loadEnd,
    lines: [
      `${ind}const load = useCallback(async () => {`,
      `${ind2}setLoading(true);`,
      `${ind2}setError("");`,
      `${ind2}const [{ data, error: err }, profilesRes] = await Promise.all([`,
      `${ind3}supabase.rpc("admin_list_accounts"),`,
      `${ind3}supabase.from("customer_profiles").select("user_id, first_name, last_name, phone"),`,
      `${ind2}]);`,
      `${ind2}if (err) {`,
      `${ind3}setError(friendlyError(err));`,
      `${ind3}setAccounts([]);`,
      `${ind2}} else {`,
      `${ind3}const profilesByUserId = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));`,
      `${ind3}const merged = (data || []).map((a) => ({ ...a, profile: profilesByUserId.get(a.account_id) || null }));`,
      `${ind3}setAccounts(merged);`,
      `${ind2}}`,
      `${ind2}setLoading(false);`,
      `${ind}}, []);`,
    ],
  });
}

// ---------------------------------------------------------------------
// 6) Application des éditions, du bas vers le haut
// ---------------------------------------------------------------------
edits
  .slice()
  .sort((a, b) => {
    const aAt = a.type === "delete" || a.type === "replaceRange" ? a.from : a.at;
    const bAt = b.type === "delete" || b.type === "replaceRange" ? b.from : b.at;
    return bAt - aAt;
  })
  .forEach((edit) => {
    if (edit.type === "delete") {
      out.splice(edit.from, edit.to - edit.from + 1);
    } else if (edit.type === "insertAfter") {
      out.splice(edit.at + 1, 0, ...edit.lines);
    } else if (edit.type === "replace") {
      out.splice(edit.at, 1, ...edit.lines);
    } else if (edit.type === "replaceRange") {
      out.splice(edit.from, edit.to - edit.from + 1, ...edit.lines);
    }
  });

fs.writeFileSync(filePath, out.join(eol), "utf8");

console.log(`✓ ${filePath} : 6 modification(s)`);
console.log("  • load() va aussi chercher customer_profiles et relie chaque compte à son profil");
console.log("  • colonnes « Nom » et « Téléphone » ajoutées au tableau");
console.log("  • colSpan du message « aucun compte » passé de 4 à 6");
console.log("  • bandeau d'information reformulé");
console.log("  • entrée « Fiches clientes » retirée de la feuille de route");
console.log("\nTerminé.");
