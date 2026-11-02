-- ============================================================
-- LOT 2e (SQL) : une commande annulee libere AUSSI le stock des bijoux normaux (pas seulement les pieces uniques).
-- Defaut corrige : depuis le lot 2a-bis, create_transfer_order reserve le stock (stock_holds), mais les 3 fonctions
-- d'annulation n'appelaient que release_order_pieces : la reservation de stock restait active apres l'annulation.
-- Correctif : juste apres release_order_pieces(...), meme motif, appel a release_order_stock(...), dans :
--   admin_cancel_order (admin_cancelled), admin_cancel_transfer_order (admin_cancelled),
--   customer_cancel_transfer_order (customer_cancelled).
-- Methode : definition ACTUELLE lue en base, repere a occurrence UNIQUE, CREATE OR REPLACE (memes droits).
-- Tout ou rien. Aucune donnee modifiee. Retour arriere : lot2e_release_stock_rollback.sql
-- ============================================================
do $zen$
declare
  v_items text[][] := array[
    ['admin_cancel_order', 'admin_cancelled'],
    ['admin_cancel_transfer_order', 'admin_cancelled'],
    ['customer_cancel_transfer_order', 'customer_cancelled']
  ];
  v_defs text[] := '{}';
  v_name text; v_reason text; v_old text; v_new text; v_def text;
  v_oid oid; v_cnt integer; c integer; i integer;
begin
  if to_regprocedure('public.release_order_stock(bigint,text)') is null then
    raise exception 'ABANDON : release_order_stock introuvable (lot 2a) ; rien n''a ete modifie';
  end if;
  for i in 1 .. array_length(v_items, 1) loop
    v_name := v_items[i][1]; v_reason := v_items[i][2];
    select count(*), min(p.oid) into v_cnt, v_oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_name;
    if v_cnt <> 1 then raise exception 'ABANDON : % : % fonction(s) de ce nom (1 attendue) ; rien n''a ete modifie', v_name, v_cnt; end if;
    v_def := pg_get_functiondef(v_oid);
    if v_def like '%ZENORIA_STOCK_RELEASE_V1%' then raise exception 'ABANDON : % : correctif deja applique ; rien n''a ete modifie', v_name; end if;
    v_old := 'v_released := public.release_order_pieces(p_order_id, ''' || v_reason || ''');';
    v_new := v_old || ' perform public.release_order_stock(p_order_id, ''' || v_reason || '''); -- ZENORIA_STOCK_RELEASE_V1 : libere aussi le stock des bijoux normaux';
    c := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if c <> 1 then raise exception 'ABANDON : % : repere trouve % fois (1 attendu) ; rien n''a ete modifie', v_name, c; end if;
    v_defs := v_defs || replace(v_def, v_old, v_new);
  end loop;
  for i in 1 .. array_length(v_defs, 1) loop
    execute v_defs[i];
  end loop;
end $zen$;

-- Verification : attendu patch_present = true pour les 3 ; droits inchanges
select p.proname,
       pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_RELEASE_V1%' as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('admin_cancel_order', 'admin_cancel_transfer_order', 'customer_cancel_transfer_order')
 order by 1;
