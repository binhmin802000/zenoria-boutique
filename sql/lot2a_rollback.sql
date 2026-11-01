-- ============================================================
-- ROLLBACK LOT 2a (SQL) : supprime tous les objets crees (purement additifs, rien d'autre n'en depend
-- tant que le lot 2a-bis n'a pas ete applique). Aucune donnee de orders/order_items/products touchee,
-- hormis products.stock s'il a deja ete decremente par consume_order_stock (ce que ce rollback ne retouche pas :
-- une consommation reelle reste une consommation reelle, independamment du retrait des fonctions).
-- Chaque suppression passe par EXECUTE pour rester coherent avec le script d'application.
-- Tout ou rien. ABANDON si le lot n'est pas applique.
-- ============================================================
do $zen$
begin
  if to_regclass('public.stock_holds') is null then
    raise exception 'ABANDON : le lot 2a n''est pas applique (table stock_holds absente) ; rien n''a ete modifie';
  end if;

  execute $ddl$ drop function if exists public.public_stock_states() $ddl$;
  execute $ddl$ drop function if exists public.admin_relist_order(bigint) $ddl$;
  execute $ddl$ drop function if exists public.release_order_items(bigint, text) $ddl$;
  execute $ddl$ drop function if exists public.consume_order_items(bigint) $ddl$;
  execute $ddl$ drop function if exists public.consume_order_stock(bigint) $ddl$;
  execute $ddl$ drop function if exists public.release_order_stock(bigint, text) $ddl$;
  execute $ddl$ drop function if exists public.hold_order_stock_internal(bigint, timestamp with time zone) $ddl$;
  execute $ddl$ drop table public.stock_holds $ddl$;
end $zen$;

select to_regclass('public.stock_holds') as table_restante;  -- attendu : vide (null)
