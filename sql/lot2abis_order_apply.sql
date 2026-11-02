-- ============================================================
-- LOT 2a-bis (partie 2/3, SQL) : branche le stock et les pieces uniques dans le CYCLE DE VIE DU VIREMENT.
-- Methode : lit la definition ACTUELLE de chaque fonction en base, remplace des reperes a occurrence
-- UNIQUE verifiee, puis recree la fonction (CREATE OR REPLACE : meme signature, memes droits conserves).
-- Prerequis : lot 2a et reserve_order_items (lot 2a-bis partie 1/3) deja appliques.
--
-- 1. create_transfer_order :
--    a) reserve pieces uniques ET stock (reserve_order_items) au lieu des seules pieces uniques,
--       avec une echeance = v_due (date limite de paiement du virement) : la reservation du stock dure
--       donc aussi longtemps que la commande reste valable, conformement a la decision validee.
--       Si le stock est insuffisant, la fonction leve STOCK_UNAVAILABLE:<id> et ANNULE TOUTE LA COMMANDE
--       (comportement automatique de PL/pgSQL : une exception non interceptee annule tout ce que la
--       fonction a fait, y compris l'INSERT de la commande et des articles).
--    b) supprime le plafond fixe de 10 par article (decision validee « plus de plafond fixe : tout repose
--       sur le stock ») ; seule la quantite minimale (>= 1) reste verifiee ici, le stock reel protege la suite.
-- 2. admin_confirm_transfer : consomme pieces ET stock ensemble (consume_order_items) au lieu des seules
--    pieces uniques. Si le stock est devenu insuffisant entre la reservation et la confirmation (rare : admin
--    a baisse le stock entre-temps), le PAIEMENT N'EST JAMAIS BLOQUE (decision validee) ; une ligne d'ALERTE
--    est ecrite dans le journal, visible ADMINISTRATION UNIQUEMENT (customer_visible = false).
--
-- Tout ou rien : ABANDON sans rien modifier si un repere est absent, en double, ou si le lot est deja applique.
-- Retour arriere : lot2abis_order_rollback.sql
-- ============================================================
do $zen$
declare
  v_create text;
  v_confirm text;
  c integer;
begin
  if to_regprocedure('public.reserve_order_items(bigint,timestamp with time zone)') is null
     or to_regprocedure('public.consume_order_items(bigint)') is null then
    raise exception 'ABANDON : lot 2a / reserve_order_items non applique ; rien n''a ete modifie';
  end if;
  if to_regprocedure('public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)') is null
     or to_regprocedure('public.admin_confirm_transfer(bigint,numeric,date,text)') is null then
    raise exception 'ABANDON : fonction create_transfer_order ou admin_confirm_transfer introuvable ; rien n''a ete modifie';
  end if;

  v_create := pg_get_functiondef('public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)'::regprocedure);
  v_confirm := pg_get_functiondef('public.admin_confirm_transfer(bigint,numeric,date,text)'::regprocedure);

  if v_create like '%ZENORIA_STOCK_V1%' or v_confirm like '%ZENORIA_STOCK_V1%' then
    raise exception 'ABANDON : le lot 2a-bis (partie 2/3) est deja applique ; rien n''a ete modifie';
  end if;

  -- create_transfer_order : repere 1 (plafond de 10 supprime)
  c := (length(v_create) - length(replace(v_create,
    $r$if v_qty < 1 or v_qty > 10 then raise exception 'INVALID_QTY'; end if;$r$, ''))) /
    length($r$if v_qty < 1 or v_qty > 10 then raise exception 'INVALID_QTY'; end if;$r$);
  if c <> 1 then raise exception 'ABANDON : repere INVALID_QTY trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_create := replace(v_create,
    $r$if v_qty < 1 or v_qty > 10 then raise exception 'INVALID_QTY'; end if;$r$,
    $r$if v_qty < 1 then raise exception 'INVALID_QTY'; end if; -- ZENORIA_STOCK_V1 : plus de plafond fixe, le stock reel (reserve_order_items) protege desormais la quantite$r$);

  -- create_transfer_order : repere 2 (reservation pieces -> pieces + stock)
  c := (length(v_create) - length(replace(v_create,
    $r$perform public.hold_order_pieces_internal(v_order_id, null);$r$, ''))) /
    length($r$perform public.hold_order_pieces_internal(v_order_id, null);$r$);
  if c <> 1 then raise exception 'ABANDON : repere hold_order_pieces_internal trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_create := replace(v_create,
    $r$perform public.hold_order_pieces_internal(v_order_id, null);$r$,
    $r$perform public.reserve_order_items(v_order_id, v_due); -- ZENORIA_STOCK_V1 : reserve pieces uniques ET stock des bijoux normaux, jusqu'a l'echeance de paiement$r$);

  -- admin_confirm_transfer : repere unique (bloc de consommation des pieces -> pieces + stock, avec alerte admin)
  c := (length(v_confirm) - length(replace(v_confirm,
    $r$  v_res := public.consume_order_pieces(p_order_id);
  if jsonb_array_length(v_res -> 'conflicts') > 0 then
    raise exception 'PIECE_CONFLICT:%', (v_res -> 'conflicts')::text;
  end if;$r$, ''))) /
    length($r$  v_res := public.consume_order_pieces(p_order_id);
  if jsonb_array_length(v_res -> 'conflicts') > 0 then
    raise exception 'PIECE_CONFLICT:%', (v_res -> 'conflicts')::text;
  end if;$r$);
  if c <> 1 then raise exception 'ABANDON : repere consume_order_pieces trouve % fois (1 attendu) ; rien n''a ete modifie', c; end if;
  v_confirm := replace(v_confirm,
    $r$  v_res := public.consume_order_pieces(p_order_id);
  if jsonb_array_length(v_res -> 'conflicts') > 0 then
    raise exception 'PIECE_CONFLICT:%', (v_res -> 'conflicts')::text;
  end if;$r$,
    $r$  v_res := public.consume_order_items(p_order_id); -- ZENORIA_STOCK_V1 : consomme pieces uniques ET stock ensemble (leve PIECE_CONFLICT en interne si besoin)
  if jsonb_array_length(v_res -> 'stock' -> 'alerts') > 0 then
    insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
    values (
      p_order_id, 'paid',
      'Alerte stock (admin) : ' || (
        select string_agg('produit #' || (a ->> 'product_id') || ' — stock avant confirmation : ' || (a ->> 'stock_avant') || ', quantité requise : ' || (a ->> 'quantite_requise'), ' ; ')
          from jsonb_array_elements(v_res -> 'stock' -> 'alerts') as a
      ) || '.',
      public.current_actor_email(),
      false
    );
  end if;$r$);

  execute v_create;
  execute v_confirm;
end $zen$;

-- Verification (lecture seule) : attendu = patch_present true pour les deux ; droits inchanges (create: false/false ; confirm: false/true)
select p.proname,
       pg_get_functiondef(p.oid) like '%ZENORIA_STOCK_V1%' as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('create_transfer_order', 'admin_confirm_transfer')
 order by 1;
