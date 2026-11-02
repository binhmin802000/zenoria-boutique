-- ============================================================
-- CORRECTIF LOT 2a (2/2) : double decompte du stock dans public_stock_states.
-- Meme defaut et meme correctif que pour hold_order_stock_internal (1/2, deja applique) :
-- les reservations 'consumed' ne doivent plus etre comptees dans le calcul de disponibilite,
-- puisque products.stock a deja ete physiquement decremente a la consommation.
--
-- Methode : lit la definition ACTUELLE de la fonction, remplace un repere a occurrence UNIQUE verifiee
-- (2 occurrences attendues : le repere apparait deux fois dans le corps, pour "reserved" et "available"),
-- recree la fonction (memes droits). Aucune donnee modifiee. Prerequis : lot 2a applique.
-- Tout ou rien. Retour arriere : lot2a_correctif_rollback_states.sql
-- ============================================================
do $zen$
declare
  v_states text;
  c integer;
begin
  if to_regprocedure('public.public_stock_states()') is null then
    raise exception 'ABANDON : lot 2a non applique ; rien n''a ete modifie';
  end if;

  v_states := pg_get_functiondef('public.public_stock_states()'::regprocedure);

  if v_states like '%ZENORIA_STOCK_FIX_V1%' then
    raise exception 'ABANDON : ce correctif est deja applique ; rien n''a ete modifie';
  end if;

  c := (length(v_states) - length(replace(v_states,
    $r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status in ('active', 'consumed')
                and (h.status = 'consumed' or h.expires_at is null or h.expires_at > now())$r$, ''))) /
    length($r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status in ('active', 'consumed')
                and (h.status = 'consumed' or h.expires_at is null or h.expires_at > now())$r$);
  if c <> 2 then raise exception 'ABANDON : repere (public_stock_states) trouve % fois (2 attendus) ; rien n''a ete modifie', c; end if;
  v_states := replace(v_states,
    $r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status in ('active', 'consumed')
                and (h.status = 'consumed' or h.expires_at is null or h.expires_at > now())$r$,
    $r$select sum(h.qty)::integer from public.stock_holds h
              where h.product_id = p.id and h.status = 'active'
                and (h.expires_at is null or h.expires_at > now()) -- ZENORIA_STOCK_FIX_V1$r$);

  execute v_states;
end $zen$;

-- Verification (lecture seule) : attendu = patch_present true, anon true, authenticated true (lisible par tous, comme avant)
select p.proname,
       pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_FIX_V1%' as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'public_stock_states';
