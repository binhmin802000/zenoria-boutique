-- ============================================================
-- ROLLBACK CORRECTIF LOT 2a (1/2) : remet hold_order_stock_internal dans sa forme d'avant ce correctif
-- (double decompte restaure). A utiliser seulement en cas de probleme inattendu avec le correctif.
-- Aucune donnee modifiee. Tout ou rien.
-- ============================================================
do $zen$
declare
  v_hold text;
  c integer;
begin
  if to_regprocedure('public.hold_order_stock_internal(bigint,timestamp with time zone)') is null then
    raise exception 'ABANDON : fonction introuvable ; rien n''a ete modifie';
  end if;

  v_hold := pg_get_functiondef('public.hold_order_stock_internal(bigint,timestamp with time zone)'::regprocedure);

  if v_hold not like '%ZENORIA_STOCK_FIX_V1%' then
    raise exception 'ABANDON : le correctif n''est pas applique ; rien n''a ete modifie';
  end if;

  c := (length(v_hold) - length(replace(v_hold,
    $r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status = 'active' and (expires_at is null or expires_at > now()); -- ZENORIA_STOCK_FIX_V1 : ne compte plus les reservations « consumed » (deja reflete dans products.stock, sinon double decompte)$r$, ''))) /
    length($r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status = 'active' and (expires_at is null or expires_at > now()); -- ZENORIA_STOCK_FIX_V1 : ne compte plus les reservations « consumed » (deja reflete dans products.stock, sinon double decompte)$r$);
  if c <> 1 then raise exception 'ABANDON : repere trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_hold := replace(v_hold,
    $r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status = 'active' and (expires_at is null or expires_at > now()); -- ZENORIA_STOCK_FIX_V1 : ne compte plus les reservations « consumed » (deja reflete dans products.stock, sinon double decompte)$r$,
    $r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status in ('active', 'consumed');$r$);

  execute v_hold;
end $zen$;

select pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_FIX_V1%' as patch_present   -- attendu : false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'hold_order_stock_internal';
