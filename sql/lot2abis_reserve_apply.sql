-- ============================================================
-- LOT 2a-bis (partie 1/3, SQL) : reserve_order_items — orchestrateur de reservation,
-- en miroir exact de consume_order_items et release_order_items (lot 2a).
-- Reserve les pieces uniques (hold_order_pieces_internal, existante) PUIS le stock des bijoux normaux
-- (hold_order_stock_internal, lot 2a). Si l'un des deux echoue, l'autre est annule (transaction).
-- Purement additif : aucune fonction existante modifiee. Rien ne l'appelle encore.
-- Tout ou rien. Retour arriere : lot2abis_reserve_rollback.sql
-- ============================================================
do $zen$
begin
  if to_regprocedure('public.reserve_order_items(bigint,timestamp with time zone)') is not null then
    raise exception 'ABANDON : reserve_order_items existe deja ; rien n''a ete modifie';
  end if;
  if to_regprocedure('public.hold_order_pieces_internal(bigint,timestamp with time zone)') is null
     or to_regprocedure('public.hold_order_stock_internal(bigint,timestamp with time zone)') is null then
    raise exception 'ABANDON : une fonction de reservation attendue est introuvable (lot 2a applique ?) ; rien n''a ete modifie';
  end if;

  execute $ddl$
  create function public.reserve_order_items(p_order_id bigint, p_expires_at timestamp with time zone)
   returns jsonb
   language plpgsql
   security definer
   set search_path to ''
  as $function$
  declare
    v_pieces integer;
    v_stock integer;
  begin
    v_pieces := public.hold_order_pieces_internal(p_order_id, p_expires_at);
    v_stock := public.hold_order_stock_internal(p_order_id, p_expires_at);
    return jsonb_build_object('pieces_held', v_pieces, 'stock_held', v_stock);
  end
  $function$
  $ddl$;

  execute $ddl$ revoke all on function public.reserve_order_items(bigint, timestamp with time zone) from public, anon, authenticated $ddl$;
end $zen$;

-- Verification (lecture seule) : attendu = anon false, authenticated false (fonction interne, appelee par d'autres fonctions SECURITY DEFINER)
select p.oid::regprocedure::text as fonction,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'reserve_order_items';
