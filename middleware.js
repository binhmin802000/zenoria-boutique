// ============================================================
// middleware.js — à placer à la RACINE du projet (au même niveau que le dossier « pages »).
//
// Rôle : quand la maintenance TOTALE est activée dans /admin, tous les visiteurs reçoivent
// la page de maintenance avec le VRAI code HTTP 503 et l'en-tête Retry-After (ce que Google
// attend pour ne pas désindexer le site). /admin, /api/health, les images et les fichiers
// du site ne sont jamais bloqués.
//
// Le mode « boutique en pause » ne passe pas par ici : le site reste ouvert, et c'est
// la page elle-même (lib/siteStatus.js) qui affiche la bannière et ferme la commande.
//
// Sous Next.js 16, ce fichier s'appelle « proxy » : si le terminal affiche un avertissement
// « middleware is deprecated », renommez simplement ce fichier en proxy.js (rien d'autre à
// changer : la fonction est exportée par défaut, ce qui convient aux deux noms).
//
// Sécurité : le droit de passer pendant la maintenance repose sur le lien d'aperçu secret
// (voir l'onglet Maintenance). En cas de doute (Supabase injoignable, script SQL absent),
// le site reste OUVERT : une erreur de lecture ne doit jamais fermer la boutique.
// ============================================================

import { NextResponse } from "next/server";
import {
  PREVIEW_COOKIE,
  PREVIEW_MAX_AGE_S,
  MAINTENANCE_CONTACT,
  isExcludedPath,
  isValidPreviewToken,
  getStatusWithCache,
  decideMaintenance,
  buildMaintenanceHtml,
  retryAfterSeconds,
} from "./lib/maintenance";

// Mémoire de l'instance (une par région Vercel) : évite d'interroger Supabase à chaque page.
const cacheState = { status: null, at: 0 };

export default async function middleware(request) {
  const url = request.nextUrl;
  if (isExcludedPath(url.pathname)) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.next();

  const previewParam = url.searchParams.get("preview");
  const cookieEntry = request.cookies.get(PREVIEW_COOKIE);
  const cookieToken = cookieEntry ? cookieEntry.value : null;
  const token = isValidPreviewToken(previewParam) ? previewParam : isValidPreviewToken(cookieToken) ? cookieToken : null;

  const status = await getStatusWithCache(cacheState, { supabaseUrl, anonKey, token });
  const decision = decideMaintenance({ pathname: url.pathname, status, previewParam });

  if (decision.action === "block") {
    return new NextResponse(buildMaintenanceHtml({ message: status.message, returnAt: status.returnAt, contact: MAINTENANCE_CONTACT }), {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": String(retryAfterSeconds(status.returnAt)),
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex",
        "X-Zenoria-Mode": "full",
      },
    });
  }

  if (decision.action === "preview-redirect") {
    const clean = url.clone();
    clean.searchParams.delete("preview");
    const response = NextResponse.redirect(clean);
    response.cookies.set(PREVIEW_COOKIE, decision.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: PREVIEW_MAX_AGE_S,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = NextResponse.next();
  if (status && status.mode !== "off") response.headers.set("X-Zenoria-Mode", status.mode);
  return response;
}

// Le middleware ne s'exécute pas pour les fichiers statiques, les images et les ressources de Next.js.
export const config = {
  matcher: ["/((?!_next/|images/|.*\\..*).*)"],
};
