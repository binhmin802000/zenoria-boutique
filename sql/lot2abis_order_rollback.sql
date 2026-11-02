-- ============================================================
-- ROLLBACK LOT 2a-bis (partie 2/3) : remet create_transfer_order et admin_confirm_transfer
-- dans leur forme d'avant ce lot (plafond de 10 restaure, reservation/consommation des SEULES
-- pieces uniques, sans gestion de stock). Aucune donnee existante modifiee.
-- Tout ou rien : ABANDON si le lot n'est pas applique ou si un repere est absent.
-- ============================================================
do $zen$
declare
  v_create text;
  v_confirm text;
  c integer;
begin
  if to_regprocedure('public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)') is null
     or to_regprocedure('public.admin_confirm_transfer(bigint,numeric,date,text)') is null then
    raise exception 'ABANDON : fonction introuvable ; rien n''a ete modifie';
  end if;

  v_create := pg_get_functiondef('public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)'::regprocedure);
  v_confirm := pg_get_functiondef('public.admin_confirm_transfer(bigint,numeric,date,text)'::regprocedure);

  if v_create not like '%ZENORIA_STOCK_V1%' or v_confirm not like '%ZENORIA_STOCK_V1%' then
    raise exception 'ABANDON : le lot 2a-bis (partie 2/3) n''est pas applique ; rien n''a ete modifie';
  end if;

  c := (length(v_create) - length(replace(v_create,
    $r$if v_qty < 1 then raise exception 'INVALID_QTY'; end if; -- ZENORIA_STOCK_V1 : plus de plafond fixe, le stock reel (reserve_order_items) protege desormais la quantite$r$, ''))) /
    length($r$if v_qty < 1 then raise exception 'INVALID_QTY'; end if; -- ZENORIA_STOCK_V1 : plus de plafond fixe, le stock reel (reserve_order_items) protege desormais la quantite$r$);
  if c <> 1 then raise exception 'ABANDON : repere (plafond) trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_create := replace(v_create,
    $r$if v_qty < 1 then raise exception 'INVALID_QTY'; end if; -- ZENORIA_STOCK_V1 : plus de plafond fixe, le stock reel (reserve_order_items) protege desormais la quantite$r$,
    $r$if v_qty < 1 or v_qty > 10 then raise exception 'INVALID_QTY'; end if;$r$);

  c := (length(v_create) - length(replace(v_create,
    $r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$, ''))) /
    length($r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$);
  if c <> 1 then raise exception 'ABANDON : repere (reservation) trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_create := replace(v_create,
    $r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$,
    $r$perform public.hold_order_pieces_internal(v_order_id, null);$r$);

  c := (length(v_confirm) - length(replace(v_confirm,
    $r$  v_res := public.consume_order_items(p_order_id); -- ZENORIA_STOCK_V1 : consomme pieces uniques ET stock ensemble (leve PIECE_CONFLICT en interne si besoin)
  if jsonb_array_length(v_res -> 'stock' -> 'alerts') > 0 then
    insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
    values (
      p_order_id, 'paid',
      'Alerte stock (admin) : ' || (
        select string_agg('produit #' || (a ->> 'product_id') || ' — stock avant confirmation : ' || (a ->> 'stock_avant') || ', quantité requise : ' || (a ->> 'quantite_requise'), ' ; ')
          from jsonb_array_elements(v_res -> 'stock' -> 'alerts') as a
      ) || '.',
      public.current_actor_email(),
      false
    );
  end if;$r$, ''))) /
    length($r$  v_res := public.consume_order_items(p_order_id); -- ZENORIA_STOCK_V1 : consomme pieces uniques ET stock ensemble (leve PIECE_CONFLICT en interne si besoin)
  if jsonb_array_length(v_res -> 'stock' -> 'alerts') > 0 then
    insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
    values (
      p_order_id, 'paid',
      'Alerte stock (admin) : ' || (
        select string_agg('produit #' || (a ->> 'product_id') || ' — stock avant confirmation : ' || (a ->> 'stock_avant') || ', quantité requise : ' || (a ->> 'quantite_requise'), ' ; ')
          from jsonb_array_elements(v_res -> 'stock' -> 'alerts') as a
      ) || '.',
      public.current_actor_email(),
      false
    );
  end if;$r$);
  if c <> 1 then raise exception 'ABANDON : repere (consommation) trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_confirm := replace(v_confirm,
    $r$  v_res := public.consume_order_items(p_order_id); -- ZENORIA_STOCK_V1 : consomme pieces uniques ET stock ensemble (leve PIECE_CONFLICT en interne si besoin)
  if jsonb_array_length(v_res -> 'stock' -> 'alerts') > 0 then
    insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
    values (
      p_order_id, 'paid',
      'Alerte stock (admin) : ' || (
        select string_agg('produit #' || (a ->> 'product_id') || ' — stock avant confirmation : ' || (a ->> 'stock_avant') || ', quantité requise : ' || (a ->> 'quantite_requise'), ' ; ')
          from jsonb_array_elements(v_res -> 'stock' -> 'alerts') as a
      ) || '.',
      public.current_actor_email(),
      false
    );
  end if;$r$,
    $r$  v_res := public.consume_order_pieces(p_order_id);
  if jsonb_array_length(v_res -> 'conflicts') > 0 then
    raise exception 'PIECE_CONFLICT:%', (v_res -> 'conflicts')::text;
  end if;$r$);

  execute v_create;
  execute v_confirm;
end $zen$;

select p.proname, pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_V1%' as patch_present   -- attendu : false, false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('create_transfer_order', 'admin_confirm_transfer')
 order by 1;
