// ZENORIA_SUPABASE_ADMIN_V1
// ============================================================
// lib/supabaseAdmin.js
//
// Client Supabase avec la cle service_role : CONTOURNE TOUTES LES REGLES
// DE SECURITE (RLS) du projet. A utiliser UNIQUEMENT depuis du code qui
// s'execute cote serveur (routes pages/api/...), JAMAIS depuis une page
// ou un composant charge par le navigateur.
//
// La cle est lue dans SUPABASE_SERVICE_ROLE_KEY, SANS le prefixe
// NEXT_PUBLIC_ : ce prefixe est reserve aux variables que Next.js envoie
// volontairement au navigateur. Son absence ici est volontaire et
// protege cette cle de toute exposition accidentelle.
// ============================================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
