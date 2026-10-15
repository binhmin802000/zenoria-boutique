// patch-mdp-oublie.mjs
//
// Chantier "mot de passe oublie" : le lien recu par e-mail ramenait a
// l'accueil sans jamais proposer de saisir un nouveau mot de passe.
//
// Ce script modifie DEUX fichiers :
//   1. components/AuthModal.js  -> ajoute un mode "update" (nouveau mot
//      de passe), avec son formulaire, et une maniere de l'ouvrir depuis
//      l'exterieur via une prop `initialMode`.
//   2. pages/index.js           -> ecoute l'evenement Supabase
//      "PASSWORD_RECOVERY" (emis automatiquement quand le lien de l'e-mail
//      est ouvert) pour ouvrir AuthModal directement en mode "update".
//
// Garanties : verifie TOUS les reperes dans LES DEUX fichiers avant
// d'ecrire quoi que ce soit ; n'ecrit rien si un seul repere manque ;
// liste les reperes manquants ; conserve les fins de ligne du fichier ;
// peut etre relance sans effet (il detecte si c'est deja applique).
//
// Usage : node patch-mdp-oublie.mjs

import fs from "node:fs";
import path from "node:path";

const authModalPath = path.join("components", "AuthModal.js");
const indexPath = path.join("pages", "index.js");

for (const f of [authModalPath, indexPath]) {
  if (!fs.existsSync(f)) {
    console.error(`✗ Fichier introuvable : ${f}`);
    console.error("Lancez cette commande depuis le dossier « zenoria ».");
    process.exit(1);
  }
}

function readLines(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const usesCRLF = raw.includes("\r\n");
  const lines = raw.split(/\r\n|\n/);
  return { raw, lines, eol: usesCRLF ? "\r\n" : "\n" };
}

function indentOf(line) {
  const m = line.match(/^[ \t]*/);
  return m ? m[0] : "";
}

// Trouve l'indice de la premiere ligne dont le texte "trim" correspond
// exactement a `needle`, en cherchant a partir de `from` (incluse).
// Si `unique` est vrai, verifie qu'aucune autre ligne ne correspond.
function findLine(lines, needle, { from = 0, unique = true, label } = {}) {
  const matches = [];
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim() === needle) matches.push(i);
  }
  if (matches.length === 0) return { ok: false, index: -1, count: 0, label };
  if (unique && matches.length > 1) return { ok: false, index: -1, count: matches.length, label };
  return { ok: true, index: matches[0], count: matches.length, label };
}

function report(label, context) {
  console.error(`  • ${label}`);
  if (context && context.length) {
    console.error("    Extrait du fichier autour de la zone attendue :");
    for (const l of context) console.error(`      ${l}`);
  }
}

// ---------------------------------------------------------------------
// 1) Lecture des deux fichiers
// ---------------------------------------------------------------------
const am = readLines(authModalPath);
const idx = readLines(indexPath);

// ---------------------------------------------------------------------
// 2) Verification d'idempotence : deja applique ?
// ---------------------------------------------------------------------
const amAlreadyDone = am.raw.includes("initialMode") && am.raw.includes('"update"');
const idxAlreadyDone = idx.raw.includes("authModalMode") && idx.raw.includes("PASSWORD_RECOVERY");

if (amAlreadyDone && idxAlreadyDone) {
  console.log("✓ Rien à modifier : le mode « nouveau mot de passe » est déjà en place dans les deux fichiers.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// 3) Reperes dans components/AuthModal.js
// ---------------------------------------------------------------------
const amAnchors = {};
const amMissing = [];

amAnchors.importLine = findLine(am.lines, 'import React, { useState } from "react";', {
  label: "ligne d'import de React (components/AuthModal.js)",
});
amAnchors.signature = findLine(am.lines, "export default function AuthModal({ open, onClose }) {", {
  label: "signature du composant AuthModal (components/AuthModal.js)",
});
amAnchors.modeState = findLine(
  am.lines,
  'const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"',
  { label: "déclaration de l'état « mode » (components/AuthModal.js)" }
);
amAnchors.resetFieldsStart = findLine(am.lines, "const resetFields = () => {", {
  label: "début de la fonction resetFields (components/AuthModal.js)",
});
amAnchors.returnAnim = findLine(am.lines, "return (", {
  label: "ligne « return ( » du composant (components/AuthModal.js)",
});
amAnchors.connexionTitle = findLine(am.lines, '{mode === "login" && "Connexion"}', {
  label: 'ligne du titre « Connexion » (components/AuthModal.js)',
});
amAnchors.closingMotionDiv = findLine(am.lines, "</motion.div>", {
  label: "fermeture unique de <motion.div> en fin de fichier (components/AuthModal.js)",
});

// Repère secondaire : la ligne "<AnimatePresence>" doit suivre de près le "return (".
let returnAnimOk = amAnchors.returnAnim.ok;
if (returnAnimOk) {
  const next = am.lines[amAnchors.returnAnim.index + 1];
  if (!next || next.trim() !== "<AnimatePresence>") returnAnimOk = false;
}

// Repère secondaire : trouver la fin de resetFields (prochaine ligne "};" après son début).
let resetFieldsEndIndex = -1;
if (amAnchors.resetFieldsStart.ok) {
  for (let i = amAnchors.resetFieldsStart.index + 1; i < am.lines.length; i++) {
    if (am.lines[i].trim() === "};") {
      resetFieldsEndIndex = i;
      break;
    }
  }
}

for (const [key, res] of Object.entries(amAnchors)) {
  if (key === "returnAnim") continue; // vérifié via returnAnimOk ci-dessous
  if (!res.ok) {
    amMissing.push({
      label: res.label,
      context: [`(repère introuvable ou non unique, ${res.count} correspondance(s) trouvée(s))`],
    });
  }
}
if (!returnAnimOk) {
  amMissing.push({
    label: "bloc « return (\\n    <AnimatePresence> » (components/AuthModal.js)",
    context: ["(la ligne « return ( » n'est pas immédiatement suivie de « <AnimatePresence> »)"],
  });
}
if (amAnchors.resetFieldsStart.ok && resetFieldsEndIndex === -1) {
  amMissing.push({
    label: "fin de la fonction resetFields (components/AuthModal.js)",
    context: ["(aucune ligne « }; » trouvée après le début de resetFields)"],
  });
}

// ---------------------------------------------------------------------
// 4) Reperes dans pages/index.js
// ---------------------------------------------------------------------
const idxAnchors = {};
const idxMissing = [];

idxAnchors.authOpenState = findLine(
  idx.lines,
  "const [authModalOpen, setAuthModalOpen] = useState(false);",
  { label: "déclaration de l'état authModalOpen (pages/index.js)" }
);
idxAnchors.onAuthStateChange = findLine(
  idx.lines,
  "const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {",
  { label: "écouteur onAuthStateChange (pages/index.js)" }
);
idxAnchors.authModalTag = findLine(
  idx.lines,
  '<AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />',
  { label: "balise <AuthModal /> (pages/index.js)" }
);

// Repère secondaire : "setUser(currentUser);" doit suivre de près onAuthStateChange.
let setUserIndex = -1;
if (idxAnchors.onAuthStateChange.ok) {
  for (let i = idxAnchors.onAuthStateChange.index + 1; i < Math.min(idxAnchors.onAuthStateChange.index + 5, idx.lines.length); i++) {
    if (idx.lines[i].trim() === "setUser(currentUser);") {
      setUserIndex = i;
      break;
    }
  }
}

for (const [key, res] of Object.entries(idxAnchors)) {
  if (!res.ok) {
    idxMissing.push({
      label: res.label,
      context: [`(repère introuvable ou non unique, ${res.count} correspondance(s) trouvée(s))`],
    });
  }
}
if (idxAnchors.onAuthStateChange.ok && setUserIndex === -1) {
  idxMissing.push({
    label: "ligne « setUser(currentUser); » juste après onAuthStateChange (pages/index.js)",
    context: ["(introuvable dans les 4 lignes suivant l'écouteur)"],
  });
}

// ---------------------------------------------------------------------
// 5) Arrêt si un seul repère manque, dans l'un ou l'autre fichier
// ---------------------------------------------------------------------
if (amMissing.length > 0 || idxMissing.length > 0) {
  const total = amMissing.length + idxMissing.length;
  console.error(`✗ ${total} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  if (amMissing.length > 0) {
    console.error("Dans components/AuthModal.js :");
    for (const m of amMissing) report(m.label, m.context);
  }
  if (idxMissing.length > 0) {
    console.error("\nDans pages/index.js :");
    for (const m of idxMissing) report(m.label, m.context);
  }
  console.error("\nVérifiez le contenu actuel de ces fichiers et collez-moi les lignes concernées.");
  process.exit(1);
}

// ---------------------------------------------------------------------
// 6) Construction du nouveau contenu (tout est vérifié, on peut écrire)
// ---------------------------------------------------------------------

// --- components/AuthModal.js ---
const amOut = [...am.lines];

// a) import
amOut[amAnchors.importLine.index] = 'import React, { useState, useEffect } from "react";';

// b) signature
amOut[amAnchors.signature.index] = "export default function AuthModal({ open, onClose, initialMode = \"login\" }) {";

// c) état mode (on conserve l'indentation d'origine de la ligne)
{
  const i = amAnchors.modeState.index;
  const ind = indentOf(amOut[i]);
  amOut[i] = `${ind}const [mode, setMode] = useState(initialMode); // "login" | "signup" | "reset" | "update"`;
}

// d), e), f), g) : insertions de blocs de lignes à plusieurs endroits du
// fichier. Pour que les positions restent justes, on calcule chaque bloc
// par rapport aux index D'ORIGINE (avant toute insertion), puis on les
// applique du BAS vers le HAUT du fichier (ordre décroissant), afin
// qu'une insertion ne décale jamais la position d'une insertion qui lui
// est antérieure dans le fichier.
const rootIndent = indentOf(am.lines[amAnchors.resetFieldsStart.index]); // indentation racine (2 espaces)
// Les blocs {mode === "..." && (...)} sont des ENFANTS du <motion.div> du
// panneau, donc indentés de 2 espaces de plus que sa propre balise.
const formIndent = indentOf(am.lines[amAnchors.closingMotionDiv.index]) + "  ";
const formChildIndent = formIndent + "  ";
const formDeepIndent = formChildIndent + "  ";
const titleIndent = indentOf(am.lines[amAnchors.connexionTitle.index]);

const insertions = [
  {
    // d) titre : juste après la ligne "Connexion"
    at: amAnchors.connexionTitle.index + 1,
    lines: [`${titleIndent}{mode === "update" && "Nouveau mot de passe"}`],
  },
  {
    // e) juste après la fin de resetFields : useEffect de synchronisation
    at: resetFieldsEndIndex + 1,
    lines: [
      "",
      `${rootIndent}useEffect(() => {`,
      `${rootIndent}  if (open) {`,
      `${rootIndent}    setMode(initialMode);`,
      `${rootIndent}  }`,
      `${rootIndent}}, [open, initialMode]);`,
    ],
  },
  {
    // f) juste avant "return (" : la fonction handleUpdatePassword
    at: amAnchors.returnAnim.index,
    lines: [
      `${rootIndent}const handleUpdatePassword = async (e) => {`,
      `${rootIndent}  e.preventDefault();`,
      `${rootIndent}  setError("");`,
      `${rootIndent}  setInfo("");`,
      `${rootIndent}  if (password !== confirmPassword) {`,
      `${rootIndent}    setError("Les mots de passe ne correspondent pas.");`,
      `${rootIndent}    return;`,
      `${rootIndent}  }`,
      `${rootIndent}  setLoading(true);`,
      `${rootIndent}  const { error: err } = await supabase.auth.updateUser({ password });`,
      `${rootIndent}  setLoading(false);`,
      `${rootIndent}  if (err) {`,
      `${rootIndent}    setError(translateError(err.message));`,
      `${rootIndent}  } else {`,
      `${rootIndent}    setInfo("Mot de passe mis à jour avec succès.");`,
      `${rootIndent}  }`,
      `${rootIndent}};`,
      "",
    ],
  },
  {
    // g) juste avant la fermeture unique de </motion.div> : le formulaire "update"
    at: amAnchors.closingMotionDiv.index,
    lines: [
      `${formIndent}{mode === "update" && (`,
      `${formChildIndent}<form onSubmit={handleUpdatePassword} className="space-y-4">`,
      `${formDeepIndent}<p className="text-sm text-[#70656a]">`,
      `${formDeepIndent}  Choisissez un nouveau mot de passe pour votre compte Zenoria.`,
      `${formDeepIndent}</p>`,
      `${formDeepIndent}<div className="relative">`,
      `${formDeepIndent}  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />`,
      `${formDeepIndent}  <input`,
      `${formDeepIndent}    type={showPassword ? "text" : "password"}`,
      `${formDeepIndent}    required`,
      `${formDeepIndent}    placeholder="Nouveau mot de passe (6 caractères min.)"`,
      `${formDeepIndent}    value={password}`,
      `${formDeepIndent}    onChange={(e) => setPassword(e.target.value)}`,
      `${formDeepIndent}    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-11 py-3 outline-none focus:border-[#8f6075]"`,
      `${formDeepIndent}  />`,
      `${formDeepIndent}  <button`,
      `${formDeepIndent}    type="button"`,
      `${formDeepIndent}    onClick={() => setShowPassword(!showPassword)}`,
      `${formDeepIndent}    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9a7384]"`,
      `${formDeepIndent}  >`,
      `${formDeepIndent}    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}`,
      `${formDeepIndent}  </button>`,
      `${formDeepIndent}</div>`,
      `${formDeepIndent}<div className="relative">`,
      `${formDeepIndent}  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />`,
      `${formDeepIndent}  <input`,
      `${formDeepIndent}    type={showPassword ? "text" : "password"}`,
      `${formDeepIndent}    required`,
      `${formDeepIndent}    placeholder="Confirmer le mot de passe"`,
      `${formDeepIndent}    value={confirmPassword}`,
      `${formDeepIndent}    onChange={(e) => setConfirmPassword(e.target.value)}`,
      `${formDeepIndent}    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-4 py-3 outline-none focus:border-[#8f6075]"`,
      `${formDeepIndent}  />`,
      `${formDeepIndent}</div>`,
      `${formDeepIndent}<Button type="submit" disabled={loading} className="w-full rounded-full h-12 bg-[#8f6075] hover:bg-[#71485b]">`,
      `${formDeepIndent}  {loading ? "Enregistrement..." : "Enregistrer"}`,
      `${formDeepIndent}</Button>`,
      `${formChildIndent}</form>`,
      `${formIndent})}`,
    ],
  },
];

// Applique les insertions du bas vers le haut (ordre décroissant de `at`)
// pour que chaque splice n'affecte jamais la position des insertions
// suivantes (qui se trouvent plus haut dans le fichier).
insertions
  .slice()
  .sort((a, b) => b.at - a.at)
  .forEach(({ at, lines }) => {
    amOut.splice(at, 0, ...lines);
  });

// --- pages/index.js ---
const idxOut = [...idx.lines];

// c) remplacer la balise <AuthModal /> (remplacement en place, ne change
// pas le nombre de lignes : peut se faire à l'index d'origine sans souci).
{
  const i = idxAnchors.authModalTag.index;
  const ind = indentOf(idxOut[i]);
  idxOut[i] =
    `${ind}<AuthModal open={authModalOpen} onClose={() => { setAuthModalOpen(false); setAuthModalMode("login"); }} initialMode={authModalMode} />`;
}

// a) et b) : insertions de blocs, appliquées du bas vers le haut du
// fichier pour que les positions d'origine restent valables sans calcul
// de décalage cumulé.
const idxInsertions = [
  {
    // a) nouvel état authModalMode, juste après authModalOpen
    at: idxAnchors.authOpenState.index + 1,
    lines: [
      `${indentOf(idx.lines[idxAnchors.authOpenState.index])}const [authModalMode, setAuthModalMode] = useState("login");`,
    ],
  },
  {
    // b) dans onAuthStateChange : ouvrir AuthModal en mode "update" sur PASSWORD_RECOVERY
    at: setUserIndex + 1,
    lines: (() => {
      const ind = indentOf(idx.lines[setUserIndex]);
      return [
        `${ind}if (_event === "PASSWORD_RECOVERY") {`,
        `${ind}  setAuthModalMode("update");`,
        `${ind}  setAuthModalOpen(true);`,
        `${ind}}`,
      ];
    })(),
  },
];

idxInsertions
  .slice()
  .sort((a, b) => b.at - a.at)
  .forEach(({ at, lines }) => {
    idxOut.splice(at, 0, ...lines);
  });

// ---------------------------------------------------------------------
// 7) Écriture des deux fichiers (fins de ligne d'origine conservées)
// ---------------------------------------------------------------------
fs.writeFileSync(authModalPath, amOut.join(am.eol), "utf8");
fs.writeFileSync(indexPath, idxOut.join(idx.eol), "utf8");

console.log(`✓ ${authModalPath} : mode « update » ajouté (titre, formulaire, handleUpdatePassword, synchronisation initialMode)`);
console.log(`✓ ${indexPath} : état authModalMode ajouté, écoute de PASSWORD_RECOVERY, <AuthModal /> mise à jour`);
console.log("\nTerminé.");
