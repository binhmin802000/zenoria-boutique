// ZENORIA_BANNERS_5F1_V1 : rangée de cartes de chiffres en tête d'un écran de l'administration.
// Une carte avec onClick est un bouton (filtre) ; "active" la surligne ; tone "red" la met en alerte.
import React from "react";

export default function StatCards({ cards, className, testId }) {
  return (
    <div className={className || "grid grid-cols-2 lg:grid-cols-4 gap-3"} data-testid={testId}>
      {cards.map((c) => {
        const red = c.tone === "red";
        const base = "rounded-2xl bg-white border px-4 py-4 text-left w-full min-w-0 " + (red ? "border-red-200" : "border-[#eee2e5]");
        const body = (
          <>
            <div className={"font-serif text-3xl " + (red ? "text-red-600" : "text-[#8f6075]")}>{c.value}</div>
            <div className="text-xs text-[#756a70] mt-1 leading-4">{c.label}</div>
            {c.sub ? <div className={"text-[11px] mt-1 leading-4 " + (red ? "text-red-600" : "text-[#8b737e]")}>{c.sub}</div> : null}
          </>
        );
        if (c.onClick) {
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              aria-pressed={Boolean(c.active)}
              data-testid={"card-" + c.key}
              className={base + " hover:shadow-sm transition" + (c.active ? " ring-2 ring-[#8f6075]" : "")}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={c.key} data-testid={"card-" + c.key} className={base}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
