// ZENORIA - Lot A2 : duree de reservation du virement
// Route PUBLIQUE qui ne renvoie QUE le nombre de jours (reglage "delay_days" de bank_transfer).
// L'IBAN, le BIC et le beneficiaire ne sortent jamais d'ici : ils restent reserves aux administratrices.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseBankTransfer, BANK_TRANSFER_KEY } from "@/lib/paymentSettings";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  try {
    const { data, error } = await supabaseAdmin.from("site_settings").select("value").eq("key", BANK_TRANSFER_KEY).maybeSingle();
    if (error) throw error;
    const cfg = parseBankTransfer(data ? data.value : null);
    return res.status(200).json({ ok: true, delayDays: cfg.delay_days });
  } catch (err) {
    console.error("[transfer-terms]", err && err.message ? err.message : err);
    return res.status(500).json({ ok: false, error: "durée indisponible" });
  }
}
