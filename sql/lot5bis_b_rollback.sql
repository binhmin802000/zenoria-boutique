-- ============================================================
-- ROLLBACK LOT 5-BIS-B : remet admin_confirm_transfer dans sa forme d'origine (note enregistree seulement en cas d'ecart).
-- Les lignes de journal deja ecrites avec " — Note : ..." restent en place (aucune donnee modifiee).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_confirm_transfer(p_order_id bigint, p_amount numeric, p_received_on date, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_o record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_paid_at timestamptz;
  v_gap boolean;
  v_res jsonb;
  v_inv public.invoices;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select id, status, total, created_at into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.status <> 'pending_transfer' then raise exception 'ORDER_STATE'; end if;

  if p_received_on is null or p_received_on > v_today or p_received_on < (v_o.created_at at time zone 'Europe/Paris')::date then
    raise exception 'INVALID_DATE';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'INVALID_AMOUNT'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'INVALID_NOTE'; end if;

  v_gap := abs(p_amount - v_o.total) >= 0.01;
  if v_gap and v_note is null then raise exception 'NOTE_REQUIRED'; end if;

  v_res := public.consume_order_pieces(p_order_id);
  if jsonb_array_length(v_res -> 'conflicts') > 0 then
    raise exception 'PIECE_CONFLICT:%', (v_res -> 'conflicts')::text;
  end if;

  v_paid_at := least(((p_received_on::timestamp + interval '12 hours') at time zone 'Europe/Paris'), now());

  update public.orders
     set status = 'paid', paid_at = v_paid_at, transfer_received_amount = p_amount, transfer_received_at = v_paid_at
   where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, actor_email)
  values (
    p_order_id, 'paid',
    'Paiement par virement confirmé : ' || replace(to_char(p_amount, 'FM999999990.00'), '.', ',') || ' € reçu le ' || to_char(p_received_on, 'DD/MM/YYYY')
      || case when v_gap then ' — écart avec le total (' || replace(to_char(v_o.total, 'FM999999990.00'), '.', ',') || ' €) : ' || v_note else '' end || '.',
    public.current_actor_email()
  );

  select * into v_inv from public.invoices where order_id = p_order_id;
  if not found then
    v_inv := public.issue_invoice_for_order(p_order_id);
  end if;

  return jsonb_build_object('order_id', p_order_id, 'paid_at', v_paid_at, 'amount', p_amount, 'gap', v_gap, 'invoice_number', v_inv.number);
end
$function$;

select pg_get_functiondef(p.oid) like '%ZENORIA_CONFIRM_NOTE_V1%' as patch_present   -- attendu : false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_confirm_transfer';
