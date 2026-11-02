-- ============================================================
-- ROLLBACK : supprime reserve_order_items. ABANDON si absente.
-- ============================================================
do $zen$
begin
  if to_regprocedure('public.reserve_order_items(bigint,timestamp with time zone)') is null then
    raise exception 'ABANDON : reserve_order_items n''existe pas ; rien n''a ete modifie';
  end if;
  execute $ddl$ drop function public.reserve_order_items(bigint, timestamp with time zone) $ddl$;
end $zen$;

select to_regprocedure('public.reserve_order_items(bigint,timestamp with time zone)') as fonction_restante; -- attendu : null
