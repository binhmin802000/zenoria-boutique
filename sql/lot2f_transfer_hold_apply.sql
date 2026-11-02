-- ============================================================
-- LOT 2f (SQL) : la reservation d'une commande par virement n'a plus de date de fin (option A validee).
-- Avant : reserve_order_items(v_order_id, v_due) -> la reservation expirait a l'echeance de paiement, meme si la commande
-- restait « en attente de virement » (bague revendable, prolongation sans effet sur la reservation, confirmation tardive
-- en conflit ou sans decompte du stock).
-- Apres : reserve_order_items(v_order_id, null) -> la reservation ne tombe que sur une DECISION : confirmation de
-- l'encaissement (vendue / stock decompte) ou annulation par la cliente ou l'administration (remise en vente, lot 2e).
-- 1. create_transfer_order : un repere a occurrence UNIQUE remplace (definition ACTUELLE lue en base, memes droits).
-- 2. Reservations ACTIVES des commandes deja « en attente de virement » : date de fin retiree (aucune au diagnostic du 02/11).
-- Tout ou rien. Retour arriere : lot2f_transfer_hold_rollback.sql
-- ============================================================
do $zen$
declare
  v_sig regprocedure := 'public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)'::regprocedure;
  v_def text;
  c integer;
begin
  v_def := pg_get_functiondef(v_sig);
  if v_def like '%ZENORIA_TRANSFER_HOLD_V1%' then
    raise exception 'ABANDON : le lot 2f est deja applique ; rien n''a ete modifie';
  end if;
  c := (length(v_def) - length(replace(v_def, $r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$, ''))) / length($r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$);
  if c <> 1 then raise exception 'ABANDON : repere reserve_order_items trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_def := replace(v_def, $r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$, $r$perform public.reserve_order_items(v_order_id, null); -- ZENORIA_STOCK_V1 ; ZENORIA_TRANSFER_HOLD_V1 : reservation SANS date de fin, levee seulement par confirmation ou annulation$r$);
  execute v_def;

  update public.product_holds h set expires_at = null
   where h.status = 'active' and h.expires_at is not null
     and exists (select 1 from public.orders o where o.id = h.order_id and o.status = 'pending_transfer');
  update public.stock_holds h set expires_at = null
   where h.status = 'active' and h.expires_at is not null
     and exists (select 1 from public.orders o where o.id = h.order_id and o.status = 'pending_transfer');
end $zen$;

-- Verification : attendu patch_present = true, anon = false, authenticated = false (droits inchanges)
select pg_get_functiondef(p.oid) like '%ZENORIA_TRANSFER_HOLD_V1%' as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_transfer_order';
