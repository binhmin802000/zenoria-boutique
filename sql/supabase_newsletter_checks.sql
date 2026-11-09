-- ZENORIA_NEWSLETTER_V1 — LECTURE SEULE, à exécuter AVANT supabase_newsletter.sql
-- Objectif : connaître l'état actuel avant toute modification.

-- 1) Politique de lecture publique actuelle (liste des clés déjà autorisées)
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public';

-- 2) Contraintes déjà présentes sur site_settings (pour vérifier qu'aucune "newsletter" n'existe déjà)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.site_settings'::regclass
order by conname;

-- 3) La ligne "newsletter" existe-t-elle déjà ?
select key, value, updated_at
from public.site_settings
where key = 'newsletter';
