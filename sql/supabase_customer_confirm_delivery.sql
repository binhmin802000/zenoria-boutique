-- ============================================================
-- customer_confirm_delivery(p_order_id)
-- ZENORIA_CUSTOMER_CONFIRM_DELIVERY_V1
--
-- Permet à la cliente de confirmer la réception de sa commande,
-- depuis Mon compte (bouton "Confirmer la réception").
--
-- Règles :
--   - autorisé UNIQUEMENT si la commande appartient à la cliente
--     connectée (auth.uid() = orders.user_id)
--   - autorisé UNIQUEMENT depuis le statut "shipped" (jamais depuis
--     "paid" ni aucun autre état) ; si le statut a changé entre-temps
--     (ex. l'admin a déjà marqué "livrée"), 0 ligne n'est modifiée et
--     la fonction lève une exception
--   - journalise la transition dans order_status_history avec
--     actor_email = e-mail de la cliente, customer_visible = true
--   - miroir de l'action admin "deliver" (update-status.js) : seul
--     orders.status est modifié, pas de colonne delivered_at
-- ============================================================

create or replace function public.customer_confirm_delivery(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_updated int;
begin
  if v_user_id is null then
    raise exception 'Connexion requise.';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  update public.orders
     set status = 'delivered'
   where id = p_order_id
     and user_id = v_user_id
     and status = 'shipped';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Cette commande ne peut pas être confirmée comme reçue dans son état actuel.';
  end if;

  insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
  values (p_order_id, 'delivered', 'Réception confirmée par la cliente.', v_email, true);
end;
$$;

revoke all on function public.customer_confirm_delivery(bigint) from public;
grant execute on function public.customer_confirm_delivery(bigint) to authenticated;

-- ============================================================
-- TEST (à exécuter sur une commande de test, statut "shipped")
-- Remplacer <ID_COMMANDE_TEST> par l'id réel. Doit renvoyer une
-- erreur si exécuté avec un autre compte que celui de la commande,
-- et réussir (puis vérification ci-dessous) si exécuté en tant que
-- la cliente propriétaire.
-- ============================================================
-- select public.customer_confirm_delivery(<ID_COMMANDE_TEST>);
--
-- select id, status from public.orders where id = <ID_COMMANDE_TEST>;
-- select order_id, status, note, actor_email, customer_visible, changed_at
--   from public.order_status_history
--  where order_id = <ID_COMMANDE_TEST>
--  order by changed_at desc
--  limit 3;
