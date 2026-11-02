-- ============================================================
-- ROLLBACK CORRECTIF LOT 2a (2/2) : remet public_stock_states dans sa forme d'avant ce correctif
-- (double decompte restaure). A utiliser seulement en cas de probleme inattendu avec le correctif.
-- Aucune donnee modifiee. Tout ou rien.
-- ============================================================
do $zen$
declare
  v_states text;
  c integer;
begin
  if to_regprocedure('public.public_stock_states()') is null then
    raise exception 'ABANDON : fonction introuvable ; rien n''a ete modifie';
  end if;

  v_states := pg_get_functiondef('public.public_stock_states()'::regprocedure);

  if v_states not like '%ZENORIA_STOCK_FIX_V1%' then
    raise exception 'ABANDON : le correctif n''est pas applique ; rien n''a ete modifie';
  end if;

  c := (length(v_states) - length(replace(v_states,
    $r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status = 'active'
                and (h.expires_at is null or h.expires_at > now()) -- ZENORIA_STOCK_FIX_V1$r$, ''))) /
    length($r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status = 'active'
                and (h.expires_at is null or h.expires_at > now()) -- ZENORIA_STOCK_FIX_V1$r$);
  if c <> 2 then raise exception 'ABANDON : repere trouve % fois (2 attendus) ; rien n''a ete modifie', c; end if;
  v_states := replace(v_states,
    $r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status = 'active'
                and (h.expires_at is null or h.expires_at > now()) -- ZENORIA_STOCK_FIX_V1$r$,
    $r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status in ('active', 'consumed')
                and (h.status = 'consumed' or h.expires_at is null or h.expires_at > now())$r$);

  execute v_states;
end $zen$;

select pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_FIX_V1%' as patch_present   -- attendu : false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'public_stock_states';
