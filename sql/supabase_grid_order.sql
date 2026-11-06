-- ============================================================
-- ZENORIA : réglage de l'ordre des bijoux de la grille d'accueil
-- (onglet « Contenu du site » > groupe « Vitrine & ambiance » > carte « Ordre des bijoux »)
--
-- À exécuter UNE FOIS dans Supabase > SQL Editor, après avoir lu supabase_grid_order_checks.sql (lecture seule).
-- Le script peut être relancé sans danger. Pour l'annuler : supabase_grid_order_rollback.sql.
-- (Exécuté le 06/11/2026 ; politique relevée avant : 8 clés ; après : 9 ; test supabase_grid_order_test.sql : TEST_OK.)
--
-- Réglage enregistré dans site_settings, clé « grid_order », valeur JSON :
--     { "mode": "random", "everyDays": 1, "shuffledAt": "" }
--   mode       : « random » (aléatoire) ou « manual » (ordre de la base, comme avant)
--   everyDays  : nombre entier de jours entre deux changements d'ordre, de 1 à 30 (l'ordre change à 3 h, heure de Paris)
--   shuffledAt : instant (texte ISO) du dernier « Mélanger maintenant » ; vide : jamais mélangé à la main
--
-- Il fait deux choses, et rien d'autre :
--  1. site_settings : lecture publique de la clé « grid_order », EN PLUS des 8 clés déjà ouvertes. Les visiteurs en ont besoin
--     pour afficher la grille. ATTENTION : « alter policy ... using (...) » REMPLACE toute la liste. Le script reprend donc
--     les 8 clés actuelles + la nouvelle. Avant de modifier quoi que ce soit, il VÉRIFIE que la politique en vigueur contient
--     bien ces 8 clés et rien d'autre : sinon il s'arrête sans rien changer (une clé oubliée couperait par exemple les moyens
--     de paiement du site).
--  2. site_settings : contrôle de la valeur de « grid_order » (mode connu, nombre entier de jours de 1 à 30, date en texte),
--     pour qu'une saisie abîmée ne casse jamais le site.
--
-- Les règles d'écriture ne changent pas : seuls les administrateurs (is_admin()) peuvent écrire.
-- Aucune ligne n'est créée : tant que rien n'est enregistré, le site applique la valeur par défaut (aléatoire, tous les jours).
-- Il ne touche à aucun autre réglage.
-- ============================================================

begin;

-- 0) Garde-fou : la politique actuelle est celle que ce script suppose
do $$
declare
  q text;
  k text;
  n integer;
  attendu integer;
begin
  select qual into q
  from pg_policies
  where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public';

  if q is null then
    raise exception 'ARRET : la politique site_settings_select_public est introuvable. Rien n''a ete modifie.';
  end if;

  foreach k in array array['season_fx', 'ring_animation', 'site_texts', 'shipping', 'reviews', 'contact', 'payment_methods', 'cgv_text'] loop
    if position(quote_literal(k) in q) = 0 then
      raise exception 'ARRET : la cle % ne figure plus dans la politique de lecture publique. Envoyez le resultat de la requete 1 de supabase_grid_order_checks.sql. Rien n''a ete modifie.', k;
    end if;
  end loop;

  -- Nombre de clés listées : 8 avant ce script, 9 si le script a déjà été exécuté
  n := (length(q) - length(replace(q, '::text', ''))) / length('::text');
  attendu := case when position(quote_literal('grid_order') in q) > 0 then 9 else 8 end;
  if n <> attendu then
    raise exception 'ARRET : la politique liste % cles au lieu de % : une cle inconnue de ce script serait supprimee. Envoyez le resultat de la requete 1 de supabase_grid_order_checks.sql. Rien n''a ete modifie.', n, attendu;
  end if;
end
$$;

-- 1) Lecture publique des réglages : les 8 clés actuelles + grid_order
alter policy site_settings_select_public on public.site_settings
  using (key = any (array[
    'season_fx'::text, 'ring_animation'::text, 'site_texts'::text, 'shipping'::text,
    'reviews'::text, 'contact'::text, 'payment_methods'::text, 'cgv_text'::text,
    'grid_order'::text
  ]));

-- 2) Contrôle de la valeur (le CASE garantit que le nombre de jours n'est lu que s'il est bien un nombre)
alter table public.site_settings drop constraint if exists site_settings_grid_order_valid;
alter table public.site_settings
  add constraint site_settings_grid_order_valid
  check (
    key <> 'grid_order'
    or (
      coalesce(jsonb_typeof(value), ''::text) = 'object'
      and coalesce(value ->> 'mode', ''::text) in ('random', 'manual')
      and case
            when coalesce(jsonb_typeof(value -> 'everyDays'), ''::text) = 'number'
              then (value ->> 'everyDays')::numeric between 1 and 30
                   and (value ->> 'everyDays')::numeric = trunc((value ->> 'everyDays')::numeric)
            else false
          end
      and coalesce(jsonb_typeof(value -> 'shuffledAt'), 'string'::text) = 'string'
      and length(coalesce(value ->> 'shuffledAt', ''::text)) <= 40
    )
  );

commit;

-- Vérification (lecture seule) : la politique doit maintenant lister 9 clés, dont grid_order
select policyname, qual
from pg_policies
where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public';
