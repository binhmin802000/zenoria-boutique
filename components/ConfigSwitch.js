// ZENORIA_CONFIG_C2_V1 : état d'un réglage dans l'onglet Configuration.
// Interrupteur pour les réglages simples (livraison offerte, avis, canaux de contact) ; pastille de lecture seule pour les autres.
import React from "react";
import { isToggleId } from "@/lib/configToggle";

function flagLabel(f) {
  return f === true ? "Activé" : f === false ? "Désactivé" : "Non défini";
}
function flagClass(f) {
  return f === true ? "bg-emerald-50 text-emerald-700" : f === false ? "bg-[#f0e6ea] text-[#8b737e]" : "bg-amber-50 text-amber-800";
}

export default function FlagControl({ it, busyId, onToggle }) {
  const canToggle = typeof onToggle === "function" && isToggleId(it.id) && typeof it.flag === "boolean";
  if (!canToggle) {
    return (
      <span
        data-state={it.flag === true ? "on" : it.flag === false ? "off" : "unknown"}
        className={"inline-block rounded-full px-2.5 py-0.5 text-xs " + flagClass(it.flag)}
      >
        {flagLabel(it.flag)}
      </span>
    );
  }
  const busy = busyId === it.id;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-[#756a70]" data-testid={"config-state-" + it.id}>
        {busy ? "Enregistrement…" : flagLabel(it.flag)}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={it.flag}
        aria-label={it.label}
        aria-busy={busy}
        disabled={Boolean(busyId)}
        onClick={() => onToggle(it.id, !it.flag)}
        data-testid={"config-switch-" + it.id}
        className={"relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 " + (it.flag ? "bg-[#8f6075]" : "bg-[#d9c5cc]")}
      >
        <span className={"absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform " + (it.flag ? "translate-x-5" : "")} />
      </button>
    </span>
  );
}
