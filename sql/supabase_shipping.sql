-- ============================================================
-- ZENORIA : réglage de la livraison offerte (montant et interrupteur)
-- (onglet « Contenu du site » > carte « Livraison offerte »)
--
-- À exécuter UNE FOIS dans Supabase > SQL Editor, après avoir lu supabase_shipping_checks.sql (lecture seule).
-- Le script peut être relancé sans danger. Pour l'annuler : supabase_shipping_rollback.sql.
--
-- Il fait deux choses, et rien d'autre :
--  1. site_settings : lecture publique de la clé « shipping », EN PLUS de celles déjà ouvertes
--     (« season_fx », « ring_animation », « site_texts »). Les visiteurs en ont besoin pour le bandeau et le panier.
--     Le script reprend ces quatre clés d'un coup : il fonctionne que le script de l'animation ait été exécuté ou non.
--  2. site_settings : contrôle de la valeur de « shipping » (interrupteur vrai ou faux, montant entier de 1 à 1 000),
--     pour qu'une saisie abîmée ne casse jamais le site.
--
-- Les règles d'écriture ne changent pas : seuls les administrateurs (is_admin()) peuvent écrire.
-- Il ne touche ni à site_media, ni aux autres réglages.
-- ============================================================

begin;

-- 1) Lecture publique des réglages
alter policy site_settings_select_public on public.site_settings
  using (key = any (array['season_fx'::text, 'ring_animation'::text, 'site_texts'::text, 'shipping'::text]));

-- 2) Contrôle de la valeur (le CASE garantit que le montant n'est lu que s'il est bien un nombre)
alter table public.site_settings drop constraint if exists site_settings_shipping_valid;
alter table public.site_settings
  add constraint site_settings_shipping_valid
  check (
    key <> 'shipping'
    or (
      coalesce(jsonb_typeof(value), ''::text) = 'object'
      and coalesce(jsonb_typeof(value -> 'enabled'), ''::text) = 'boolean'
      and case
            when coalesce(jsonb_typeof(value -> 'threshold'), ''::text) = 'number'
              then (value ->> 'threshold')::numeric between 1 and 1000
                   and (value ->> 'threshold')::numeric = trunc((value ->> 'threshold')::numeric)
            else false
          end
    )
  );

commit;
