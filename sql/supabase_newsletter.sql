-- ZENORIA_NEWSLETTER_V1
-- Ajoute le réglage "newsletter" ({ enabled: boolean }) : lecture publique + contrainte de validation.
-- Auto-protégé comme supabase_grid_order.sql : vérifie la liste actuelle de clés publiques avant de la
-- remplacer, pour ne jamais effacer une clé existante par erreur. S'arrête (exception) si la liste
-- observée ne correspond pas exactement à celle attendue.
--
-- Clés publiques ATTENDUES avant exécution (état relevé le 07/11/2026, lot grid_order) :
--   season_fx, ring_animation, site_texts, shipping, reviews, contact, payment_methods, cgv_text, grid_order
--
-- Si le script s'arrête avec une exception, exécutez d'abord supabase_newsletter_checks.sql (requête 1)
-- et ajustez la liste EXPECTED_KEYS ci-dessous avant de relancer.

begin;

do $$
declare
  current_qual text;
  expected_keys text[] := array['season_fx','ring_animation','site_texts','shipping','reviews','contact','payment_methods','cgv_text','grid_order'];
  k text;
begin
  select qual into current_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public';

  if current_qual is null then
    raise exception 'Politique site_settings_select_public introuvable : arrêt par sécurité.';
  end if;

  foreach k in array expected_keys loop
    if position(quote_literal(k) in current_qual) = 0 then
      raise exception 'Clé attendue "%" absente de la politique actuelle (%): arrêt par sécurité. Relancez supabase_newsletter_checks.sql et ajustez ce script.', k, current_qual;
    end if;
  end loop;

  if position(quote_literal('newsletter') in current_qual) > 0 then
    raise notice 'La clé "newsletter" est déjà présente dans la politique : rien à faire pour cette partie.';
  else
    execute 'alter policy site_settings_select_public on public.site_settings using (key = any (array[' ||
      '''season_fx'',''ring_animation'',''site_texts'',''shipping'',''reviews'',''contact'',''payment_methods'',''cgv_text'',''grid_order'',''newsletter''' ||
      ']::text[]))';
  end if;
end $$;

-- Contrainte de validation : { enabled: boolean }, rien d'autre n'est autorisé à circuler sous cette clé.
-- NB 1 : une sous-requête (select ... from jsonb_object_keys(...)) est interdite dans une contrainte CHECK
--        par PostgreSQL ("cannot use subquery in check constraint").
-- NB 2 : l'opérateur "jsonb - text" (retrait d'une clé) lève une erreur si la valeur n'est PAS un objet
--        (ex. un booléen, un texte, un tableau) ; on utilise un CASE (ordre d'évaluation garanti,
--        contrairement à un AND) pour ne tenter "value - 'enabled'" que si c'est déjà un objet.
-- NB 3 (correction) : "jsonb_typeof(value -> 'enabled')" vaut NULL si la clé "enabled" est absente
--        (ex. {}), et une contrainte CHECK en PostgreSQL ACCEPTE une ligne si le résultat est NULL,
--        pas seulement s'il est vrai. On force donc "coalesce(..., 'absent') = 'boolean'", qui ne peut
--        jamais valoir NULL, pour que l'absence du champ soit un vrai FALSE (donc bien rejetée).
alter table public.site_settings drop constraint if exists site_settings_newsletter_valid;
alter table public.site_settings add constraint site_settings_newsletter_valid
  check (
    key <> 'newsletter' or (
      case
        when jsonb_typeof(value) = 'object' then
          coalesce(jsonb_typeof(value -> 'enabled'), 'absent') = 'boolean'
          and (value - 'enabled') = '{}'::jsonb
        else false
      end
    )
  );

-- Amorce la ligne par défaut (désactivé). INDISPENSABLE : contrairement à "reviews" ou "shipping",
-- la newsletter n'a pas d'écran admin dédié qui créerait cette ligne au premier enregistrement — sans
-- cette amorce, l'interrupteur de Configuration refuserait le tout premier clic ("réglage introuvable").
-- Ne touche à rien si la ligne existe déjà (ON CONFLICT DO NOTHING).
insert into public.site_settings (key, value)
values ('newsletter', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

commit;

-- Vérification après exécution (relancer manuellement si besoin) :
-- select qual from pg_policies where tablename = 'site_settings' and policyname = 'site_settings_select_public';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.site_settings'::regclass and conname = 'site_settings_newsletter_valid';
