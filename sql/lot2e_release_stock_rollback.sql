-- ============================================================
-- ROLLBACK LOT 2e : retire l'appel a release_order_stock des 3 fonctions d'annulation. Aucune donnee modifiee. Tout ou rien.
-- ============================================================
do $zen$
declare
  v_items text[][] := array[
    ['admin_cancel_order', 'admin_cancelled'],
    ['admin_cancel_transfer_order', 'admin_cancelled'],
    ['customer_cancel_transfer_order', 'customer_cancelled']
  ];
  v_defs text[] := '{}';
  v_name text; v_reason text; v_add text; v_def text; v_oid oid; v_cnt integer; c integer; i integer;
begin
  for i in 1 .. array_length(v_items, 1) loop
    v_name := v_items[i][1]; v_reason := v_items[i][2];
    select count(*), min(p.oid) into v_cnt, v_oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_name;
    if v_cnt <> 1 then raise exception 'ABANDON : % : % fonction(s) de ce nom ; rien n''a ete modifie', v_name, v_cnt; end if;
    v_def := pg_get_functiondef(v_oid);
    v_add := ' perform public.release_order_stock(p_order_id, ''' || v_reason || '''); -- ZENORIA_STOCK_RELEASE_V1 : libere aussi le stock des bijoux normaux';
    c := (length(v_def) - length(replace(v_def, v_add, ''))) / length(v_add);
    if c <> 1 then raise exception 'ABANDON : % : correctif absent ou en double (% fois) ; rien n''a ete modifie', v_name, c; end if;
    v_defs := v_defs || replace(v_def, v_add, '');
  end loop;
  for i in 1 .. array_length(v_defs, 1) loop
    execute v_defs[i];
  end loop;
end $zen$;

select p.proname, pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_RELEASE_V1%' as patch_present -- attendu : false
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('admin_cancel_order', 'admin_cancel_transfer_order', 'customer_cancel_transfer_order')
 order by 1;
