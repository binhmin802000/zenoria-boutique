// ZENORIA_FLAGGED_5E_V1 : pastille rouge d'un compte à surveiller
import React from "react";

export default function FlaggedBadge({ count }) {
  const n = Number(count) || 0;
  return (
    <span
      data-testid="flagged-badge"
      title={n + " annulations par la cliente sur les 30 derniers jours"}
      className="ml-2 inline-block rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap align-middle"
    >
      À surveiller · {n} annul.
    </span>
  );
}
