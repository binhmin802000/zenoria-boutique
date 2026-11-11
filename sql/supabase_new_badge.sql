-- ============================================================
-- ZENORIA_NEW_BADGE_V2 : réglage du badge « Nouveauté » (clé site_settings « new_badge »)
-- Valeur attendue : { "enabled": true|false, "days": entier de 1 à 90 }
--
-- À EXÉCUTER AVANT le déploiement du code (sinon l'administration enregistre le réglage, mais le site ne peut pas
-- le lire : il garde alors 14 jours, activé, sans aucune erreur visible).
-- Ce script ne crée PAS la ligne : « Enregistrer » dans l'administration la crée. Tant qu'elle n'existe pas, le site
-- applique 14 jours, activé.
--
-- Il ne modifie PAS la politique de lecture publique existante (site_settings_select_public) : il en ajoute une
-- séparée, limitée à cette seule clé. Retour arrière : supabase_new_badge_rollback.sql.
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
    where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public_new_badge'
  ) then
    raise notice 'La politique site_settings_select_public_new_badge existe déjà : elle sera recréée à l''identique.';
  end if;
end $$;

-- 1) Contrainte de validation.
-- Règles de conception (leçons de la newsletter) :
--  - aucune sous-requête (PostgreSQL les interdit dans un CHECK) ;
--  - un CASE dont les clauses sont évaluées dans l'ordre : le cast « days::int » n'est atteint que si la valeur est
--    déjà confirmée comme 1 à 3 chiffres, donc il ne peut jamais lever d'erreur ;
--  - coalesce(..., 'absent') : une clé manquante donne un faux franc, jamais NULL (un CHECK accepte NULL) ;
--  - « days » doit être un NOMBRE ENTIER (14, pas 14.0, pas "14") ; « enabled » un booléen ; aucune autre clé.
alter table public.site_settings drop constraint if exists site_settings_new_badge_valid;
alter table public.site_settings add constraint site_settings_new_badge_valid
  check (
    case
      when key <> 'new_badge' then true
      when jsonb_typeof(value) <> 'object' then false
      when coalesce(jsonb_typeof(value -> 'enabled'), 'absent') <> 'boolean' then false
      when coalesce(jsonb_typeof(value -> 'days'), 'absent') <> 'number' then false
      when (value ->> 'days') !~ '^[0-9]{1,3}$' then false
      when (value ->> 'days')::int not between 1 and 90 then false
      when (value - 'enabled' - 'days') <> '{}'::jsonb then false
      else true
    end
  );

-- 2) Lecture publique de cette seule clé (politique séparée : elle s'ajoute aux politiques existantes)
drop policy if exists site_settings_select_public_new_badge on public.site_settings;
create policy site_settings_select_public_new_badge on public.site_settings
  for select
  using (key = 'new_badge');

commit;

-- Vérification après exécution (à lancer à part) :
-- select policyname, cmd, qual from pg_policies
--   where schemaname = 'public' and tablename = 'site_settings' order by policyname;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.site_settings'::regclass and conname = 'site_settings_new_badge_valid';
