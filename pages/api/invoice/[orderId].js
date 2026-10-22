// ============================================================
// pages/api/invoice/[orderId].js — GET : télécharge la facture PDF d'une commande
// ZENORIA_INVOICE_STEP3_V1
//
// Authentification : le navigateur envoie l'en-tête « Authorization: Bearer <access_token> »
// (le jeton de la session Supabase en cours, voir supabase.auth.getSession()). La route construit
// un client Supabase qui REJOUE ce jeton (mêmes droits que si la cliente appelait directement) :
// la fonction issue_invoice_for_order (SECURITY DEFINER) vérifie alors elle-même, côté base, que
// la commande appartient à cette cliente, ou que le compte est administrateur. Aucune vérification
// de propriété n'est refaite ici : la base reste la seule source de vérité pour cette règle.
//
// La facture n'est jamais stockée en fichier : elle est recomposée à chaque téléchargement à partir
// des données figées de la table invoices (jamais modifiées après leur création, voir le verrou
// invoices_lock_updates dans supabase_invoices.sql) et des lignes de la commande.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { generateInvoicePdf } from "@/lib/invoicePdf";
import { formatOrderReference } from "@/lib/orderDisplay";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "méthode non autorisée" });
  }

  const orderId = Number(req.query.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ ok: false, error: "identifiant de commande invalide" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ ok: false, error: "connexion requise" });
  }

  // Client « au nom de » la personne connectée : PostgREST lira ce jeton pour auth.uid() et is_admin().
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  try {
    const { data: invoice, error: issueErr } = await supabase
      .rpc("issue_invoice_for_order", { p_order_id: orderId })
      .single();
    if (issueErr) throw issueErr;
    if (!invoice) return res.status(404).json({ ok: false, error: "facture introuvable" });

    const [itemsRes, orderRes] = await Promise.all([
      supabase.from("order_items").select("product_name, product_price, qty").eq("order_id", orderId),
      supabase.from("orders").select("id, created_at").eq("id", orderId).maybeSingle(),
    ]);
    if (itemsRes.error) throw itemsRes.error;

    const orderReference = orderRes.data ? formatOrderReference(orderRes.data) : `ZEN-${String(orderId).padStart(4, "0")}`;

    const pdfBuffer = await generateInvoicePdf({
      invoice: { ...invoice, order_reference: orderReference },
      orderItems: itemsRes.data || [],
      carrier: invoice.delivery_carrier || null, // ZENORIA_INVOICE_DELIVERY_LOGO_V1
      trackingNumber: invoice.delivery_tracking_number || null,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.number}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (/NOT_AUTHENTICATED/.test(msg)) return res.status(401).json({ ok: false, error: "connexion requise" });
    if (/NOT_ALLOWED/.test(msg)) return res.status(403).json({ ok: false, error: "cette commande ne vous appartient pas" });
    if (/ORDER_NOT_FOUND/.test(msg)) return res.status(404).json({ ok: false, error: "commande introuvable" });
    if (/ORDER_NOT_INVOICEABLE/.test(msg)) return res.status(409).json({ ok: false, error: "cette commande n'est pas encore facturable" });
    return res.status(500).json({ ok: false, error: "impossible de générer la facture pour le moment" });
  }
}
