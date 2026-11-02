-- ============================================================
-- CORRECTIF LOT 2a (1/2) : double decompte du stock dans hold_order_stock_internal.
--
-- DEFAUT DECOUVERT PAR LE TEST DU LOT 2a-bis : le calcul de disponibilite comptait les reservations
-- 'active' ET 'consumed' ensemble. Or une reservation 'consumed' correspond a une vente deja faite,
-- pour laquelle products.stock a DEJA ete physiquement decremente par consume_order_stock. La compter
-- une seconde fois revient a soustraire deux fois la meme vente.
--   Exemple reel observe : stock remonte a 2 par l'admin apres une vente de 1 (reservation consumed
--   qty=1 restee en base pour l'historique) -> l'ancien calcul donnait disponible = 2 - 1 = 1 au lieu
--   de 2, et pouvait refuser a tort une commande qui aurait du etre acceptee.
--
-- Correctif : la disponibilite ne compte plus que les reservations ENCORE 'active' et NON expirees.
-- Methode : lit la definition ACTUELLE de la fonction, remplace un repere a occurrence UNIQUE verifiee
-- (verifie directement sur le texte renvoye par pg_get_functiondef), recree la fonction (memes droits).
-- Aucune donnee modifiee. Prerequis : lot 2a applique.
-- Tout ou rien. Retour arriere : lot2a_correctif_rollback_hold.sql
-- ============================================================
do $zen$
declare
  v_hold text;
  c integer;
begin
  if to_regprocedure('public.hold_order_stock_internal(bigint,timestamp with time zone)') is null then
    raise exception 'ABANDON : lot 2a non applique ; rien n''a ete modifie';
  end if;

  v_hold := pg_get_functiondef('public.hold_order_stock_internal(bigint,timestamp with time zone)'::regprocedure);

  if v_hold like '%ZENORIA_STOCK_FIX_V1%' then
    raise exception 'ABANDON : ce correctif est deja applique ; rien n''a ete modifie';
  end if;

  c := (length(v_hold) - length(replace(v_hold,
    $r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status in ('active', 'consumed');$r$, ''))) /
    length($r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status in ('active', 'consumed');$r$);
  if c <> 1 then raise exception 'ABANDON : repere (hold_order_stock_internal) trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_hold := replace(v_hold,
    $r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status in ('active', 'consumed');$r$,
    $r$select coalesce(sum(qty), 0) into v_held
        from public.stock_holds
       where product_id = r.product_id and status = 'active' and (expires_at is null or expires_at > now()); -- ZENORIA_STOCK_FIX_V1 : ne compte plus les reservations « consumed » (deja reflete dans products.stock, sinon double decompte)$r$);

  execute v_hold;
end $zen$;

-- Verification (lecture seule) : attendu = patch_present true, droits inchanges (anon false, authenticated false)
select p.proname,
       pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_FIX_V1%' as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'hold_order_stock_internal';
