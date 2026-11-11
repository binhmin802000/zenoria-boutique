-- ============================================================
-- LOT 1a - PASTILLE DE NOUVEAUTES DANS « MON COMPTE » - ZENORIA_ACCOUNT_NEWS_V1
-- Fonction de LECTURE SEULE : evenements de commande de la cliente connectee.
--
-- Pourquoi : order_status_history n a qu une politique RLS (order_status_history_admin_write, is_admin()).
-- Une cliente non administratrice ne peut donc pas la lire en direct. Cette fonction SECURITY DEFINER,
-- filtree sur auth.uid(), renvoie uniquement ses propres commandes (modele : customer_order_events).
--
-- ETAT : deja executee en base le 11/11/2026 (test annule : attendu=28, obtenu=28, sans_session=refuse : AUTH_REQUIRED).
-- Ce fichier sert au versionnement. Aucune donnee n est modifiee.
--
-- Retour arriere : drop function if exists public.customer_account_news();
-- ============================================================
create or replace function public.customer_account_news()
returns table(order_id bigint, status text, changed_at timestamptz, note text, visible boolean, par_moi boolean)
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
           (h.actor_email is not null and v_email <> '' and lower(h.actor_email) = v_email)
      from public.order_status_history h
      join public.orders o on o.id = h.order_id
     where o.user_id = v_uid
       and h.status in ('paid', 'shipped', 'delivered', 'cancelled')
     order by h.changed_at, h.id;
end
$function$;

revoke all on function public.customer_account_news() from public, anon;
grant execute on function public.customer_account_news() to authenticated;
