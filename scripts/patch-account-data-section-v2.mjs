// ZENORIA - AccountDataSection v2 : statut de la demande + avertissement avis
// ============================================================
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (!apply && !dryRun) {
  console.error("Utilisez --dry-run ou --apply.");
  process.exit(2);
}

const file = path.join(process.cwd(), "components", "AccountDataSection.js");
if (!fs.existsSync(file)) {
  console.error(`Fichier introuvable : ${file}`);
  process.exit(1);
}

const original = fs.readFileSync(file, "utf8");

function fail(message) {
  console.error(`ECHEC : ${message}`);
  console.error("Aucune modification n'a ete ecrite.");
  process.exit(1);
}

// Verifie que le fichier correspond bien a la version connue (v1),
// avant de le remplacer integralement.
const requiredAnchors = [
  "export default function AccountDataSection",
  'data-testid="request-deletion-btn"',
  'data-testid="deletion-requested-msg"',
  'data-testid="download-my-data-btn"',
];
const missing = requiredAnchors.filter((a) => !original.includes(a));
if (missing.length > 0) {
  fail(`le fichier ne correspond pas a la version attendue (v1), reperes manquants : ${missing.join(", ")}.`);
}
console.log("OK prerequis : AccountDataSection.js correspond a la version v1 connue");

const NEW_CONTENT = `import React, { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
}

// ============================================================
// « MES DONNÉES » — export PDF (immédiat), demande de suppression
// (validation admin) et affichage du statut de la dernière demande.
// ============================================================
export default function AccountDataSection({ user }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [latestRequest, setLatestRequest] = useState(undefined); // undefined = chargement, null = aucune
  const [deletionError, setDeletionError] = useState("");
  const [deletionBusy, setDeletionBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("data_requests")
          .select("id, type, status, requested_at, processed_at")
          .eq("user_id", user.id)
          .eq("type", "deletion")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!alive) return;
        if (err) { setLatestRequest(null); return; }
        setLatestRequest(data || null);
      } catch (e) {
        if (alive) setLatestRequest(null);
      }
    })();
    return () => { alive = false; };
  }, [user.id]);

  const downloadMyData = async () => {
    setExporting(true);
    setExportError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
      if (!token) throw new Error("session invalide");
      const res = await fetch(\`/api/data-export/\${user.id}\`, {
        headers: { Authorization: \`Bearer \${token}\` },
      });
      if (!res.ok) {
        let message = "Impossible de générer l'export pour le moment.";
        try { const j = await res.json(); if (j && j.error) message = j.error; } catch (e) { /* réponse non JSON */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zenoria-mes-donnees.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e && e.message ? e.message : "Impossible de générer l'export pour le moment.");
    }
    setExporting(false);
  };

  const requestDeletion = async () => {
    const confirmText = "Confirmer votre demande de suppression de compte ?\\n\\nVos informations de livraison seront anonymisées après validation par une administratrice. Vos factures restent conservées pour nos obligations légales (10 ans). Les avis que vous avez publiés resteront visibles, même après la suppression de votre compte.";
    if (!window.confirm(confirmText)) return;
    setDeletionBusy(true);
    setDeletionError("");
    try {
      const { data: inserted, error: err } = await supabase
        .from("data_requests")
        .insert({ user_id: user.id, type: "deletion" })
        .select("id, type, status, requested_at, processed_at")
        .single();
      if (err) throw err;
      setLatestRequest(inserted);
    } catch (e) {
      setDeletionError("Impossible d'enregistrer votre demande pour le moment.");
    }
    setDeletionBusy(false);
  };

  const showForm = latestRequest === null;
  const isPending = latestRequest && latestRequest.status === "pending";
  const isDone = latestRequest && latestRequest.status === "done";

  return (
    <div data-testid="section-donnees-content">
      <h2 className="font-serif text-2xl text-[#412f3b] mb-1">Mes données</h2>
      <p className="text-sm text-[#8b737e] mb-5">Conformément au RGPD, vous pouvez obtenir une copie de vos données ou demander la suppression de votre compte.</p>

      <div className="rounded-2xl border border-[#eee2e5] p-4 mb-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1">Télécharger mes données</h3>
        <p className="text-sm text-[#70656a] mb-3">Un PDF reprenant vos commandes, avis et favoris, généré immédiatement.</p>
        {exportError && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{exportError}</div>}
        <button
          type="button"
          onClick={downloadMyData}
          disabled={exporting}
          data-testid="download-my-data-btn"
          className="flex items-center gap-2 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm disabled:opacity-50"
        >
          <Download size={15} /> {exporting ? "Génération…" : "Télécharger mes données (PDF)"}
        </button>
      </div>

      <div className="rounded-2xl border border-[#eee2e5] p-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1">Supprimer mon compte</h3>

        {isPending && (
          <p className="text-sm text-[#70656a]" data-testid="deletion-status-pending">
            Votre demande du {formatDate(latestRequest.requested_at)} est en cours de traitement.
          </p>
        )}

        {isDone && (
          <p className="text-sm text-[#70656a]" data-testid="deletion-status-done">
            Votre demande a été traitée le {formatDate(latestRequest.processed_at)}. Vos informations de livraison ont été anonymisées. Vos factures restent conservées conformément à nos obligations légales (10 ans). Les avis que vous avez publiés restent visibles tels quels, conformément à notre politique de confidentialité.
          </p>
        )}

        {latestRequest === undefined && (
          <p className="text-sm text-[#8b737e]">Chargement…</p>
        )}

        {showForm && (
          <>
            <p className="text-sm text-[#70656a] mb-3">
              Votre demande sera examinée par une administratrice. Vos factures restent conservées pour nos obligations légales (10 ans), le reste de vos données personnelles est anonymisé. Les avis que vous avez publiés resteront visibles, même après la suppression de votre compte.
            </p>
            {deletionError && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{deletionError}</div>}
            <button
              type="button"
              onClick={requestDeletion}
              disabled={deletionBusy}
              data-testid="request-deletion-btn"
              className="flex items-center gap-2 rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50"
            >
              <Trash2 size={15} /> {deletionBusy ? "Envoi…" : "Demander la suppression de mon compte"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
`;

if (NEW_CONTENT === original) {
  fail("aucune modification produite malgre les controles reussis (cas inattendu).");
}

console.log("");
console.log(`Mode : ${dryRun ? "DRY-RUN" : "APPLY"}`);
console.log("Tous les controles sont conformes.");
console.log("Modifications preparees :");
console.log("  - Affichage du statut de la derniere demande (en attente / traitee)");
console.log("  - Avertissement sur les avis publiés, visible avant et pendant la confirmation");

if (dryRun) {
  console.log("VERIFICATION SEULE : aucun fichier modifie.");
} else {
  fs.writeFileSync(file, NEW_CONTENT, "utf8");
  console.log(`Fichier modifie : ${path.relative(process.cwd(), file)}`);
}