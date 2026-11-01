// ZENORIA_STEP3C_V1
// ============================================================
// components/TransferInstructions.js
//
// Coordonnées de virement d'une commande, partagées entre la confirmation après commande
// (pages/index.js) et le détail d'une commande dans Mon compte (pages/compte.js).
// Lit la fonction SQL customer_transfer_instructions(order_id) (lot 3a) : réservée à la cliente
// propriétaire d'une commande encore en attente de virement. Dès que la commande est payée ou
// annulée, la fonction ne renvoie plus les coordonnées (masquage garanti côté base, pas ici).
// ============================================================
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatOrderPrice, formatOrderReference } from "@/lib/orderDisplay";
import { buildMailtoLink, buildWhatsAppLink } from "@/lib/contactSettings";

const TIME_ZONE = "Europe/Paris";

function formatDueDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
}
function groupIban(iban) {
  return String(iban || "").replace(/(.{4})/g, "$1 ").trim();
}

function CopyField({ label, value, testId }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      // copie indisponible : la cliente peut sélectionner le texte à la main
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0">
        <div className="text-[11px] text-[#8b737e]">{label}</div>
        <div className="text-sm text-[#412f3b] break-all">{value}</div>
      </div>
      <button type="button" onClick={copy} data-testid={testId} className="shrink-0 rounded-full border border-[#d9c5cc] px-3 py-1 text-xs hover:bg-[#f5edf1]">
        {copied ? "Copié !" : "Copier"}
      </button>
    </div>
  );
}

export default function TransferInstructions({ orderId, contactCfg }) {
  const [state, setState] = useState("loading"); // loading | ok | unavailable | error
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setData(null);
    supabase
      .rpc("customer_transfer_instructions", { p_order_id: orderId })
      .then((res) => {
        if (!alive) return;
        if (res.error || !res.data) {
          setState("error");
          return;
        }
        setData(res.data);
        setState(res.data.state === "ok" ? "ok" : "unavailable");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (state === "loading") {
    return (
      <p className="text-sm text-[#8b737e]" data-testid="transfer-instructions-loading">
        Chargement des coordonnées…
      </p>
    );
  }
  if (state === "error") {
    return (
      <div data-testid="transfer-instructions-error" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm leading-5">
        Impossible d&apos;afficher les coordonnées pour le moment. Retrouvez-les dans Mon compte, ou contactez-nous.
      </div>
    );
  }

  const reference = formatOrderReference({ id: data.order_id, created_at: data.created_at });

  if (state === "unavailable") {
    const hasEmail = Boolean(contactCfg && contactCfg.email && contactCfg.email.enabled && contactCfg.email.value);
    const hasWhatsapp = Boolean(contactCfg && contactCfg.whatsapp && contactCfg.whatsapp.enabled && contactCfg.whatsapp.value);
    const subject = `Virement pour ma commande ${reference}`;
    const body = `Bonjour,\n\nJe souhaite connaître les coordonnées bancaires pour régler ma commande ${reference}.\n`;
    const waText = `Bonjour, pourriez-vous me donner les coordonnées pour régler ma commande ${reference} par virement ?`;
    const href = hasEmail
      ? buildMailtoLink(contactCfg.email.value, subject, body)
      : hasWhatsapp
      ? buildWhatsAppLink(contactCfg.whatsapp.value, waText)
      : null;
    return (
      <div data-testid="transfer-instructions-unavailable" className="rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-sm text-[#54434c] space-y-2">
        <div>
          Commande {reference} · <strong>{formatOrderPrice(data.total)}</strong>
        </div>
        <div className="rounded-xl bg-amber-50 text-amber-900 px-3 py-2 text-[13px] leading-5">
          Les coordonnées bancaires vous seront communiquées.{" "}
          {href ? (
            <a href={href} target={hasEmail ? undefined : "_blank"} rel="noopener noreferrer" className="underline">
              Contactez-nous
            </a>
          ) : (
            "Contactez-nous pour les obtenir."
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="transfer-instructions" className="rounded-xl bg-white border border-[#eee2e5] px-4 py-3 space-y-1">
      <div className="text-[13px] font-medium text-[#412f3b] mb-1">
        Commande {reference} · {formatOrderPrice(data.total)}
      </div>
      <CopyField label="Bénéficiaire" value={data.beneficiary} testId="transfer-copy-beneficiary" />
      <CopyField label="IBAN" value={groupIban(data.iban)} testId="transfer-copy-iban" />
      {data.bic && <CopyField label="BIC" value={data.bic} testId="transfer-copy-bic" />}
      <CopyField label="Référence à indiquer" value={reference} testId="transfer-copy-reference" />
      <div className="pt-2 mt-1 border-t border-[#f0e6ea] text-sm text-[#54434c]">
        Merci d&apos;effectuer votre virement avant le <strong>{formatDueDate(data.due_at)}</strong>. Votre bijou vous est réservé jusqu&apos;à cette date. Au-delà, la commande pourra être annulée.
      </div>
    </div>
  );
}
