// ============================================================
// PATCH LOT 1b — CIBLAGE DE LA COMMANDE NOTIFIEE DANS « MON COMPTE » — ZENORIA_ACCOUNT_NEWS_V2
//
// Modifie : pages/compte.js (uniquement)
// Prerequis (fichiers a copier AVANT, ce script ne les cree pas) :
//   lib/accountNews.js et lib/useAccountNews.js dans leur version V2
// Prerequis : lot 1a deja en place (marqueur ZENORIA_ACCOUNT_NEWS_V1 dans pages/compte.js).
//
// Ce que fait le lot :
//   - une commande est « vue » quand on ouvre SON detail (et plus quand on ouvre l'onglet) ;
//   - repere « Nouveau » sur chaque commande concernee dans la liste ;
//   - une seule commande a du nouveau -> son detail s'ouvre directement a l'arrivee sur « Mes commandes » ;
//   - « Mes avis » : le compteur se vide a l'ouverture, l'avis concerne garde son repere « Nouveau » pendant la visite.
//
// Tout ou rien : chaque repere doit exister UNE SEULE fois, sinon le script s'arrete sans rien ecrire.
// Fins de ligne (CRLF/LF) conservees. Relancer apres succes est refuse.
//
// Usage : node scripts/patch-lot1b-ciblage-commande.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TAG = "[patch-lot1b-ciblage-commande]";
const FILE = "pages/compte.js";
const MARKER_NEW = "ZENORIA_ACCOUNT_NEWS_V2";
const MARKER_PREREQ = "ZENORIA_ACCOUNT_NEWS_V1";

const ROW_BADGE_CLASS = "rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none px-2 py-1";
const REVIEW_BADGE_CLASS = "inline-block mt-1 rounded-full bg-[#c0392b] text-white text-[10px] font-medium leading-none px-2 py-1";

const edits = [
  {
    name: "import de useRef",
    find: 'import React, { useCallback, useEffect, useState } from "react";',
    replace: 'import React, { useCallback, useEffect, useRef, useState } from "react"; // ZENORIA_ACCOUNT_NEWS_V2 : useRef',
  },
  {
    name: "hook : commande ouverte + ouverture directe",
    find: "    reviewsEnabled: showReviews,\n    section,\n  });",
    replace: [
      "    reviewsEnabled: showReviews,",
      "    section,",
      "    openOrderId: selectedOrderId, // ZENORIA_ACCOUNT_NEWS_V2 : ouvrir le detail d'une commande marque ses evenements comme vus",
      "  });",
      "  // ZENORIA_ACCOUNT_NEWS_V2 : a l'arrivee sur « Mes commandes », s'il n'y a du nouveau que sur UNE commande, son detail s'ouvre directement.",
      "  // Une seule fois par arrivee (armee quand on quitte la rubrique) : revenir a la liste ensuite ne rouvre rien.",
      "  const autoOpenArmed = useRef(true);",
      "  useEffect(() => {",
      '    if (section !== "commandes") { autoOpenArmed.current = true; return; }',
      "    if (!autoOpenArmed.current || ordersLoading || !newsReady || !accountNews.ready) return;",
      "    autoOpenArmed.current = false;",
      "    if (selectedOrderId === null && accountNews.newsOrderIds.length === 1) setSelectedOrderId(accountNews.newsOrderIds[0]);",
      "  }, [section, ordersLoading, newsReady, accountNews.ready, accountNews.newsOrderIds, selectedOrderId]);",
    ].join("\n"),
  },
  {
    name: "repere « Nouveau » dans la liste des commandes",
    find: "<span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${customerOrderBadge(o).className}`}>{customerOrderBadge(o).label}</span>",
    replace: [
      '<span className="flex flex-col items-end gap-1 shrink-0"> {/* ZENORIA_ACCOUNT_NEWS_V2 */}',
      "                                {accountNews.orderNews[String(o.id)] ? (",
      "                                  <span data-testid={`order-row-new-${o.id}`} className=\"" + ROW_BADGE_CLASS + "\">",
      "                                    Nouveau",
      '                                    <span className="sr-only"> : {accountNews.orderNews[String(o.id)]} nouveauté{accountNews.orderNews[String(o.id)] > 1 ? "s" : ""}</span>',
      "                                  </span>",
      "                                ) : null}",
      "                                <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${customerOrderBadge(o).className}`}>{customerOrderBadge(o).label}</span>",
      "                              </span>",
    ].join("\n"),
  },
  {
    name: "repere « Nouveau » sur l'avis concerne",
    find: '<div className="font-serif text-base leading-tight truncate">{reviewProductName(r)}</div>',
    replace: [
      '<div className="font-serif text-base leading-tight truncate">{reviewProductName(r)}</div>',
      "                                    {accountNews.avisHighlight.includes(String(r.id)) && ( // ZENORIA_ACCOUNT_NEWS_V2",
      "                                      <span data-testid={`review-new-${r.id}`} className=\"" + REVIEW_BADGE_CLASS + "\">Nouveau</span>",
      "                                    )}",
    ].join("\n"),
  },
];

function countOccurrences(text, needle) {
  let n = 0;
  let i = text.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

const problems = [];

// Modules V2 presents ?
const libChecks = [
  ["lib/accountNews.js", ["markOrderSeen", "newsOrderIds", "newReviewIds", "orderNewsByOrder"]],
  ["lib/useAccountNews.js", ["openOrderId", "avisHighlight", "orderNews", "newsOrderIds"]],
];
for (const [rel, needles] of libChecks) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    problems.push(rel + " : fichier a copier avant de lancer ce script");
    continue;
  }
  const txt = fs.readFileSync(full, "utf8");
  const missing = needles.filter((n) => !txt.includes(n));
  if (missing.length > 0) problems.push(rel + " : version V2 attendue (manque : " + missing.join(", ") + ")");
}

let out = null;
let crlf = false;
const full = path.join(ROOT, FILE);
if (!fs.existsSync(full)) {
  problems.push(FILE + " : fichier introuvable (lancer le script depuis le dossier du projet)");
} else {
  const raw = fs.readFileSync(full, "utf8");
  crlf = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  if (text.includes(MARKER_NEW)) {
    problems.push(FILE + " : deja patche (" + MARKER_NEW + " present), rien a faire");
  } else if (!text.includes(MARKER_PREREQ)) {
    problems.push(FILE + " : le lot 1a n'est pas en place (" + MARKER_PREREQ + " absent)");
  } else {
    let ok = true;
    for (const e of edits) {
      const n = countOccurrences(text, e.find);
      if (n !== 1) {
        problems.push(FILE + " : repere \"" + e.name + "\" trouve " + n + " fois (attendu : 1)");
        ok = false;
      }
    }
    if (ok) {
      for (const e of edits) text = text.replace(e.find, () => e.replace);
      out = crlf ? text.replace(/\n/g, "\r\n") : text;
    }
  }
}

if (problems.length > 0 || out === null) {
  console.error(TAG + " au moins un probleme, RIEN n a ete ecrit :");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

fs.writeFileSync(full, out, "utf8");
console.log(TAG + " 1 fichier mis a jour : " + FILE + " (" + (crlf ? "CRLF" : "LF") + ")");
