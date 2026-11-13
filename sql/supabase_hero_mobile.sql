-- ============================================================
-- ZENORIA_HERO_MOBILE_V1 : réglage « Vidéo d'accueil sur mobile » (clé site_settings « hero_mobile »)
-- Valeur attendue : { "autoplay": true|false }
--   false (ou ligne absente) = image fixe + ▶ sur écran étroit ; true = lecture automatique aussi sur écran étroit.
--
-- À EXÉCUTER AVANT le déploiement du code (sinon l'administration enregistre le réglage, mais le site ne peut pas
-- le lire : il garde alors l'image fixe + ▶, sans aucune erreur visible).
-- Ce script ne crée PAS la ligne : « Enregistrer » dans l'administration la crée. Tant qu'elle n'existe pas, le site
-- applique l'image fixe + ▶ (comportement actuel, le plus économique en cached egress).
--
-- Il ne modifie PAS la politique de lecture publique existante (site_settings_select_public) : il en ajoute une
-- séparée, limitée à cette seule clé. Retour arrière : supabase_hero_mobile_rollback.sql.
-- ============================================================
begin;

-- 0) Garde-fous : on est bien dans la bonne base, et rien n'existe déjà sous ces noms
do $$
begin
  if to_regclass('public.site_settings') is null then
    raise exception 'ARRÊT : la table public.site_settings est introuvable. Rien n''a été modifié.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public'
  ) then
    raise exception 'ARRÊT : la politique de lecture publique attendue (site_settings_select_public) est absente : ce n''est pas la base attendue. Rien n''a été modifié.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public_hero_mobile'
  ) then
    raise notice 'La politique site_settings_select_public_hero_mobile existe déjà : elle sera recréée à l''identique.';
  end if;
end $$;

-- 1) Contrainte de validation (mêmes règles de conception que new_badge) :
--  - aucune sous-requête ; CASE évalué dans l'ordre ;
--  - coalesce(..., 'absent') : une clé manquante donne un faux franc, jamais NULL (un CHECK accepte NULL) ;
--  - « autoplay » doit être un BOOLÉEN ; aucune autre clé.
alter table public.site_settings drop constraint if exists site_settings_hero_mobile_valid;
alter table public.site_settings add constraint site_settings_hero_mobile_valid
  check (
    case
      when key <> 'hero_mobile' then true
      when jsonb_typeof(value) <> 'object' then false
      when coalesce(jsonb_typeof(value -> 'autoplay'), 'absent') <> 'boolean' then false
      when (value - 'autoplay') <> '{}'::jsonb then false
      else true
    end
  );

-- 2) Lecture publique de cette seule clé (politique séparée : elle s'ajoute aux politiques existantes)
drop policy if exists site_settings_select_public_hero_mobile on public.site_settings;
create policy site_settings_select_public_hero_mobile on public.site_settings
  for select
  using (key = 'hero_mobile');

commit;

-- Vérification après exécution (à lancer à part) :
-- select policyname, cmd, qual from pg_policies
--   where schemaname = 'public' and tablename = 'site_settings' order by policyname;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.site_settings'::regclass and conname = 'site_settings_hero_mobile_valid';
