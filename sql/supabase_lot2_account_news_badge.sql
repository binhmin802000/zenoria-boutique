-- ============================================================
-- LOT 2 - PASTILLE DE NOUVEAUTES SUR TOUTES LES PAGES - ZENORIA_ACCOUNT_NEWS_BADGE_V1
--
-- Ce script modifie deux choses en base (production, base unique) :
--
-- A) customer_account_news() : AJOUT de 2 colonnes (payment_method, cancelled_by), sans changer son
--    comportement existant. Mon compte (deja en production) continue de fonctionner a l'identique :
--    il ignore ces 2 colonnes. Elles permettent a l'Accueil et au quiz de calculer la pastille SANS
--    avoir a charger la liste complete des commandes (ce que fait deja Mon compte, mais qui serait
--    une requete de plus et inutile sur les autres pages).
--    Un DROP est necessaire car Postgres n'autorise pas CREATE OR REPLACE sur une fonction dont la
--    liste de colonnes de sortie change.
--
-- B) customer_account_reviews() : NOUVELLE fonction, sur le meme modele (lecture seule, filtree sur
--    auth.uid()), qui renvoie les avis de la cliente connectee. Permet de lire les avis sans charger
--    non plus la liste complete des commandes.
--
-- C) Une politique de lecture publique de plus sur site_settings, pour la cle « account_news_cache »
--    (reglage admin : interrupteur + duree de cache), sur le modele de celle deja en place pour
--    « new_badge ».
--
-- Retour arriere : voir la fin de ce fichier.
-- ============================================================

-- A) customer_account_news() : ajout de payment_method et cancelled_by
drop function if exists public.customer_account_news();

create or replace function public.customer_account_news()
returns table(order_id bigint, status text, changed_at timestamptz, note text, visible boolean, par_moi boolean, payment_method text, cancelled_by text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select h.order_id,
           h.status,
           h.changed_at,
           case when h.customer_visible then h.note else null end,
           coalesce(h.customer_visible, false),
           (h.actor_email is not null and v_email <> '' and lower(h.actor_email) = v_email),
           o.payment_method,
           o.cancelled_by
      from public.order_status_history h
      join public.orders o on o.id = h.order_id
     where o.user_id = v_uid
       and h.status in ('paid', 'shipped', 'delivered', 'cancelled')
     order by h.changed_at, h.id;
end
$function$;

revoke all on function public.customer_account_news() from public, anon;
grant execute on function public.customer_account_news() to authenticated;

-- B) customer_account_reviews() : nouvelle fonction, meme principe que customer_account_news()
create or replace function public.customer_account_reviews()
returns table(id bigint, order_id bigint, status text, reply text, reply_at timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select r.id, r.order_id, r.status, r.reply, r.reply_at
      from public.reviews r
      join public.orders o on o.id = r.order_id
     where o.user_id = v_uid
     order by r.created_at;
end
$function$;

revoke all on function public.customer_account_reviews() from public, anon;
grant execute on function public.customer_account_reviews() to authenticated;

-- C) Lecture publique du reglage account_news_cache (sur le modele de new_badge)
create policy site_settings_select_public_account_news_cache
  on public.site_settings for select
  to public
  using (key = 'account_news_cache'::text);

-- ============================================================
-- RETOUR ARRIERE
--
-- Pour revenir a la version precedente de customer_account_news() (celle du lot 1a, sans les 2
-- colonnes ajoutees) :
--
--   drop function if exists public.customer_account_news();
--
--   create or replace function public.customer_account_news()
--   returns table(order_id bigint, status text, changed_at timestamptz, note text, visible boolean, par_moi boolean)
--   language plpgsql
--   stable
--   security definer
--   set search_path to ''
--   as $function$
--   declare
--     v_uid uuid := auth.uid();
--     v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
--   begin
--     if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
--     return query
--       select h.order_id, h.status, h.changed_at,
--              case when h.customer_visible then h.note else null end,
--              coalesce(h.customer_visible, false),
--              (h.actor_email is not null and v_email <> '' and lower(h.actor_email) = v_email)
--         from public.order_status_history h
--         join public.orders o on o.id = h.order_id
--        where o.user_id = v_uid
--          and h.status in ('paid', 'shipped', 'delivered', 'cancelled')
--        order by h.changed_at, h.id;
--   end
--   $function$;
--
--   revoke all on function public.customer_account_news() from public, anon;
--   grant execute on function public.customer_account_news() to authenticated;
--
-- Pour retirer le reste :
--
--   drop function if exists public.customer_account_reviews();
--   drop policy if exists site_settings_select_public_account_news_cache on public.site_settings;
-- ============================================================
