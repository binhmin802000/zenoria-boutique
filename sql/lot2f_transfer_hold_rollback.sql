-- ============================================================
-- ROLLBACK LOT 2f : la reservation virement expire de nouveau a l'echeance (v_due). Les reservations deja creees sans date
-- de fin le restent (aucune donnee modifiee). Tout ou rien.
-- ============================================================
do $zen$
declare
  v_sig regprocedure := 'public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)'::regprocedure;
  v_def text;
  c integer;
begin
  v_def := pg_get_functiondef(v_sig);
  c := (length(v_def) - length(replace(v_def, $r$perform public.reserve_order_items(v_order_id, null); -- ZENORIA_STOCK_V1 ; ZENORIA_TRANSFER_HOLD_V1 : reservation SANS date de fin, levee seulement par confirmation ou annulation$r$, ''))) / length($r$perform public.reserve_order_items(v_order_id, null); -- ZENORIA_STOCK_V1 ; ZENORIA_TRANSFER_HOLD_V1 : reservation SANS date de fin, levee seulement par confirmation ou annulation$r$);
  if c <> 1 then raise exception 'ABANDON : le lot 2f n''est pas applique (repere trouve % fois) ; rien n''a ete modifie', c; end if;
  execute replace(v_def, $r$perform public.reserve_order_items(v_order_id, null); -- ZENORIA_STOCK_V1 ; ZENORIA_TRANSFER_HOLD_V1 : reservation SANS date de fin, levee seulement par confirmation ou annulation$r$, $r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$);
end $zen$;

select pg_get_functiondef(p.oid) like '%ZENORIA_TRANSFER_HOLD_V1%' as patch_present -- attendu : false
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_transfer_order';
