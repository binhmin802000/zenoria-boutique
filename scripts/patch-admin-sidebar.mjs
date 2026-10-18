// scripts/patch-admin-sidebar.mjs
//
// Transforme la navigation admin (pages/admin.js) de deux rubans
// horizontaux (groupes, puis sous-onglets du groupe actif) en une sidebar
// verticale a accordeon strict : un seul groupe niveau 1 deplie a la
// fois, ses sous-onglets apparaissent juste en dessous, empiles
// verticalement. Un bouton permet de reduire/agrandir la sidebar
// manuellement (jamais automatique).
//
// Aucune logique n'est dupliquee : goTo(), parseAdminHash(), ADMIN_NAV,
// GROUP_ICONS, TAB_ICONS, techLevel, quotaLevel, maintenanceActive sont
// tous reutilises tels quels. Les data-testid existants (group-${id},
// sub-${id}, group-bar, sub-bar) sont conserves pour ne pas casser
// d'eventuels tests.
//
// Le contenu de <main> (tous les blocs {tab === "..."}) n'est JAMAIS
// touche : seule sa classe CSS change (il devient une colonne flexible a
// droite de la sidebar, au lieu d'etre centre seul sur la page).
//
// Garanties : verifie TOUS les reperes avant d'ecrire quoi que ce soit ;
// n'ecrit rien si un seul manque ; liste tous les reperes manquants ;
// conserve les fins de ligne du fichier ; peut etre relance sans effet.
//
// Usage : node scripts/patch-admin-sidebar.mjs

import fs from "node:fs";
import path from "node:path";

const filePath = path.join("pages", "admin.js");

if (!fs.existsSync(filePath)) {
  console.error(`✗ Fichier introuvable : ${filePath}`);
  console.error("Lancez cette commande depuis le dossier « zenoria ».");
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

if (raw.includes("admin-sidebar-accordion")) {
  console.log("✓ Rien à modifier : la sidebar verticale est déjà en place.");
  process.exit(0);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const anchors = {};

anchors.lucideImport =
  'import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users, Sparkles, Gauge, Wrench, Activity, Settings, LogIn, Clock, Palette, ShoppingBag } from "lucide-react";';

anchors.subBarRefDecl = "  const subBarRef = useRef(null);";

anchors.headerToMainOpen =
  "        <div role=\"tablist\" aria-label=\"Sections de l'administration\" data-testid=\"group-bar\" className=\"max-w-6xl mx-auto px-5 flex gap-1.5 sm:gap-2 pb-2 overflow-x-auto\">" + eol +
  "          {ADMIN_NAV.map((g) => {" + eol +
  "            const GroupIcon = GROUP_ICONS[g.id];" + eol +
  "            const active = nav.group === g.id;" + eol +
  '            const level = g.id === "technique" ? techLevel : "ok";' + eol +
  "            return (" + eol +
  "              <button" + eol +
  "                key={g.id}" + eol +
  '                type="button"' + eol +
  '                role="tab"' + eol +
  "                aria-selected={active}" + eol +
  "                data-testid={`group-${g.id}`}" + eol +
  "                onClick={() => goTo(g.id)}" + eol +
  "                className={`flex items-center gap-1.5 sm:gap-2 rounded-full px-3.5 sm:px-5 h-10 text-sm font-medium transition whitespace-nowrap shrink-0 ${" + eol +
  '                  active ? "bg-[#8f6075] text-white shadow-sm" : "bg-[#f5edf1] text-[#54434c] hover:bg-[#ead9e1]"' + eol +
  "                }`}" + eol +
  "              >" + eol +
  "                <GroupIcon size={16} /> {g.label}" + eol +
  "                {level !== \"ok\" && (" + eol +
  "                  <span" + eol +
  "                    data-testid={`group-dot-${g.id}`}" + eol +
  "                    data-level={level}" + eol +
  '                    className={`h-2.5 w-2.5 rounded-full ring-2 ${active ? "ring-[#8f6075]" : "ring-[#f5edf1]"} ${level === "critical" ? "bg-red-500" : "bg-amber-400"}`}' + eol +
  '                    aria-label={level === "critical" ? "Alerte critique dans ce groupe" : "Point d\'attention dans ce groupe"}' + eol +
  "                  />" + eol +
  "                )}" + eol +
  "              </button>" + eol +
  "            );" + eol +
  "          })}" + eol +
  "        </div>" + eol +
  "        <div" + eol +
  "          ref={subBarRef}" + eol +
  '          role="tablist"' + eol +
  "          aria-label={`Onglets ${currentGroup.label}`}" + eol +
  '          data-testid="sub-bar"' + eol +
  '          className="relative max-w-6xl mx-auto px-5 flex gap-1 pb-3 overflow-x-auto"' + eol +
  "        >" + eol +
  "          {currentGroup.tabs.map((t) => {" + eol +
  "            const TabIcon = TAB_ICONS[t.id];" + eol +
  "            const active = nav.sub === t.id;" + eol +
  "            return (" + eol +
  "              <button" + eol +
  "                key={t.id}" + eol +
  '                type="button"' + eol +
  '                role="tab"' + eol +
  "                aria-selected={active}" + eol +
  "                data-testid={`sub-${t.id}`}" + eol +
  "                onClick={() => goTo(currentGroup.id, t.id)}" + eol +
  "                className={`flex items-center gap-1.5 rounded-full px-3.5 h-8 text-[13px] transition whitespace-nowrap ${" + eol +
  '                  active ? "bg-[#f0e6ea] text-[#412f3b] font-medium ring-1 ring-[#d9c5cc]" : "text-[#54434c] hover:bg-[#f5edf1]"' + eol +
  "                }`}" + eol +
  "              >" + eol +
  "                <TabIcon size={14} /> {t.label}" + eol +
  '                {t.id === "quotas" && quotaLevel !== "ok" && (' + eol +
  "                  <span" + eol +
  '                    data-testid="quota-dot"' + eol +
  "                    data-level={quotaLevel}" + eol +
  '                    className={`h-2 w-2 rounded-full ${quotaLevel === "critical" ? "bg-red-500" : "bg-amber-400"}`}' + eol +
  '                    aria-label={quotaLevel === "critical" ? "Quota critique" : "Quota à surveiller"}' + eol +
  "                  />" + eol +
  "                )}" + eol +
  '                {t.id === "maintenance" && maintenanceActive && (' + eol +
  "                  <span" + eol +
  '                    data-testid="maintenance-dot"' + eol +
  '                    className={`h-2 w-2 rounded-full ${maintenance.row && maintenance.row.mode === "full" ? "bg-red-500" : "bg-amber-400"}`}' + eol +
  '                    aria-label={maintenance.row && maintenance.row.mode === "full" ? "Maintenance totale active" : "Boutique en pause"}' + eol +
  "                  />" + eol +
  "                )}" + eol +
  "              </button>" + eol +
  "            );" + eol +
  "          })}" + eol +
  "        </div>" + eol +
  "      </header>" + eol +
  eol +
  '      <main className="max-w-6xl mx-auto px-5 py-8">';

anchors.mainClose = "      </main>";

const missing = [];
for (const [key, needle] of Object.entries(anchors)) {
  const count = countOccurrences(raw, needle);
  if (count !== 1) missing.push({ key, count });
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} repère(s) à adapter — aucun fichier n'a été modifié.\n`);
  for (const m of missing) {
    console.error(`  • repère « ${m.key} » (${m.count} correspondance(s) trouvée(s), 1 attendue)`);
  }
  console.error("\nVérifiez le contenu actuel de pages/admin.js et collez-moi les lignes concernées.");
  process.exit(1);
}

let out = raw;

// 1) Ajout de 3 icônes à l'import lucide-react existant
out = out.replace(
  anchors.lucideImport,
  'import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users, Sparkles, Gauge, Wrench, Activity, Settings, LogIn, Clock, Palette, ShoppingBag, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";'
);

// 2) Nouvel état sidebarCollapsed, juste après la déclaration de subBarRef
out = out.replace(
  anchors.subBarRefDecl,
  anchors.subBarRefDecl + eol + "  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);"
);

// 3) Remplacement des deux rubans horizontaux par la sidebar verticale à accordéon
const sidebarAndMainOpen =
  "      </header>" + eol +
  eol +
  '      <div className="max-w-6xl mx-auto flex gap-6 items-start px-5">' + eol +
  "        <aside" + eol +
  "          data-testid=\"admin-sidebar-accordion\"" + eol +
  '          aria-label="Navigation de l\'administration"' + eol +
  "          className={`shrink-0 sticky top-20 self-start transition-all ${sidebarCollapsed ? \"w-14\" : \"w-60\"}`}" + eol +
  "        >" + eol +
  "          <button" + eol +
  '            type="button"' + eol +
  "            onClick={() => setSidebarCollapsed((v) => !v)}" + eol +
  '            data-testid="sidebar-toggle"' + eol +
  '            aria-label={sidebarCollapsed ? "Agrandir la navigation" : "Réduire la navigation"}' + eol +
  '            className="mb-3 flex items-center justify-center h-8 w-8 rounded-full bg-[#f5edf1] hover:bg-[#ead9e1] text-[#54434c] transition"' + eol +
  "          >" + eol +
  "            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}" + eol +
  "          </button>" + eol +
  eol +
  '          <div role="tablist" aria-label="Sections de l\'administration" data-testid="group-bar" className="flex flex-col gap-1.5">' + eol +
  "            {ADMIN_NAV.map((g) => {" + eol +
  "              const GroupIcon = GROUP_ICONS[g.id];" + eol +
  "              const activeGroup = nav.group === g.id;" + eol +
  '              const level = g.id === "technique" ? techLevel : "ok";' + eol +
  "              return (" + eol +
  '                <div key={g.id} className="flex flex-col gap-0.5">' + eol +
  "                  <button" + eol +
  '                    type="button"' + eol +
  '                    role="tab"' + eol +
  "                    aria-selected={activeGroup}" + eol +
  "                    aria-expanded={activeGroup}" + eol +
  "                    data-testid={`group-${g.id}`}" + eol +
  "                    onClick={() => goTo(g.id)}" + eol +
  "                    className={`flex items-center gap-2 rounded-full px-3.5 h-10 text-sm font-medium transition whitespace-nowrap w-full ${" + eol +
  '                      activeGroup ? "bg-[#8f6075] text-white shadow-sm" : "bg-[#f5edf1] text-[#54434c] hover:bg-[#ead9e1]"' + eol +
  "                    }`}" + eol +
  "                  >" + eol +
  "                    <GroupIcon size={16} />" + eol +
  '                    {!sidebarCollapsed && <span className="flex-1 text-left truncate">{g.label}</span>}' + eol +
  "                    {level !== \"ok\" && (" + eol +
  "                      <span" + eol +
  "                        data-testid={`group-dot-${g.id}`}" + eol +
  "                        data-level={level}" + eol +
  '                        className={`h-2.5 w-2.5 rounded-full ring-2 shrink-0 ${activeGroup ? "ring-[#8f6075]" : "ring-[#f5edf1]"} ${level === "critical" ? "bg-red-500" : "bg-amber-400"}`}' + eol +
  '                        aria-label={level === "critical" ? "Alerte critique dans ce groupe" : "Point d\'attention dans ce groupe"}' + eol +
  "                      />" + eol +
  "                    )}" + eol +
  "                    {!sidebarCollapsed && (activeGroup ? <ChevronDown size={14} className=\"shrink-0\" /> : <ChevronRight size={14} className=\"shrink-0\" />)}" + eol +
  "                  </button>" + eol +
  eol +
  "                  {activeGroup && !sidebarCollapsed && (" + eol +
  "                    <div" + eol +
  "                      ref={subBarRef}" + eol +
  '                      role="tablist"' + eol +
  "                      aria-label={`Onglets ${g.label}`}" + eol +
  '                      data-testid="sub-bar"' + eol +
  '                      className="flex flex-col gap-0.5 pl-4 mt-1"' + eol +
  "                    >" + eol +
  "                      {g.tabs.map((t) => {" + eol +
  "                        const TabIcon = TAB_ICONS[t.id];" + eol +
  "                        const activeTab = nav.sub === t.id;" + eol +
  "                        return (" + eol +
  "                          <button" + eol +
  "                            key={t.id}" + eol +
  '                            type="button"' + eol +
  '                            role="tab"' + eol +
  "                            aria-selected={activeTab}" + eol +
  "                            data-testid={`sub-${t.id}`}" + eol +
  "                            onClick={() => goTo(g.id, t.id)}" + eol +
  "                            className={`flex items-center gap-1.5 rounded-full px-3.5 h-8 text-[13px] transition whitespace-nowrap w-full ${" + eol +
  '                              activeTab ? "bg-[#f0e6ea] text-[#412f3b] font-medium ring-1 ring-[#d9c5cc]" : "text-[#54434c] hover:bg-[#f5edf1]"' + eol +
  "                            }`}" + eol +
  "                          >" + eol +
  '                            <TabIcon size={14} className="shrink-0" /> <span className="truncate">{t.label}</span>' + eol +
  '                            {t.id === "quotas" && quotaLevel !== "ok" && (' + eol +
  "                              <span" + eol +
  '                                data-testid="quota-dot"' + eol +
  "                                data-level={quotaLevel}" + eol +
  '                                className={`h-2 w-2 rounded-full shrink-0 ${quotaLevel === "critical" ? "bg-red-500" : "bg-amber-400"}`}' + eol +
  '                                aria-label={quotaLevel === "critical" ? "Quota critique" : "Quota à surveiller"}' + eol +
  "                              />" + eol +
  "                            )}" + eol +
  '                            {t.id === "maintenance" && maintenanceActive && (' + eol +
  "                              <span" + eol +
  '                                data-testid="maintenance-dot"' + eol +
  '                                className={`h-2 w-2 rounded-full shrink-0 ${maintenance.row && maintenance.row.mode === "full" ? "bg-red-500" : "bg-amber-400"}`}' + eol +
  '                                aria-label={maintenance.row && maintenance.row.mode === "full" ? "Maintenance totale active" : "Boutique en pause"}' + eol +
  "                              />" + eol +
  "                            )}" + eol +
  "                          </button>" + eol +
  "                        );" + eol +
  "                      })}" + eol +
  "                    </div>" + eol +
  "                  )}" + eol +
  "                </div>" + eol +
  "              );" + eol +
  "            })}" + eol +
  "          </div>" + eol +
  "        </aside>" + eol +
  eol +
  '        <main className="flex-1 min-w-0 py-8">';

out = out.replace(anchors.headerToMainOpen, sidebarAndMainOpen);

// 4) Fermeture de la nouvelle disposition flex, juste après </main>
out = out.replace(anchors.mainClose, "      </main>" + eol + "      </div>");

fs.writeFileSync(filePath, out, "utf8");

console.log(`✓ ${filePath} : navigation admin transformée en sidebar verticale à accordéon`);
console.log("  • 3 icônes ajoutées (ChevronDown, ChevronLeft, ChevronRight)");
console.log("  • état sidebarCollapsed ajouté");
console.log("  • accordéon strict : un seul groupe déplié à la fois, réutilise goTo() tel quel");
console.log("  • bouton de réduction/agrandissement manuel, jamais automatique");
console.log("  • tous les data-testid existants conservés (group-${id}, sub-${id}, group-bar, sub-bar)");
console.log("\nTerminé.");
