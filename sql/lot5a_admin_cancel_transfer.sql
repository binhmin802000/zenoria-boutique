-- ============================================================
-- LOT 5a - Annulation manuelle d'une commande en attente de virement (admin)
-- ============================================================
-- Fonction atomique : verrou sur la commande, controle du droit admin, du statut et du motif,
-- passage en "cancelled" (cancelled_by = 'admin'), liberation des pieces, historique.
-- Une commande deja payee ne s'annule pas ici : c'est un remboursement (lot 6).
-- Motifs : not_received | customer_request | other (note obligatoire).
-- Prerequis verifies : release_order_pieces(bigint, text) accepte 'admin_cancelled' ;
--   orders_cancelled_by_valid accepte 'admin' ; order_status_history accepte 'cancelled'.
-- ============================================================
create or replace function public.admin_cancel_transfer_order(
  p_order_id bigint,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
  v_released integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_reason is null or p_reason not in ('not_received', 'customer_request', 'other') then
    raise exception 'INVALID_REASON';
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;
  if p_reason = 'other' and v_note is null then raise exception 'NOTE_REQUIRED'; end if;

  select o.status into v_status from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  v_label := case p_reason
    when 'not_received' then 'Virement non reçu dans les délais'
    when 'customer_request' then 'Demande de la cliente'
    else 'Autre motif'
  end;

  update public.orders
     set status = 'cancelled', cancelled_by = 'admin', cancelled_at = now()
   where id = p_order_id;

  v_released := public.release_order_pieces(p_order_id, 'admin_cancelled');

  insert into public.order_status_history (order_id, status, note, actor_email)
  values (
    p_order_id, 'cancelled',
    'Annulée par l''administration : ' || v_label || case when v_note is not null then ' — ' || v_note else '' end || '.',
    public.current_actor_email()
  );

  return jsonb_build_object('order_id', p_order_id, 'released', v_released, 'reason', p_reason);
end
$function$;

-- Droits : jamais anonyme ; une cliente connectee peut l'appeler mais la fonction exige is_admin().
revoke all on function public.admin_cancel_transfer_order(bigint, text, text) from public;
revoke all on function public.admin_cancel_transfer_order(bigint, text, text) from anon;
grant execute on function public.admin_cancel_transfer_order(bigint, text, text) to authenticated;
