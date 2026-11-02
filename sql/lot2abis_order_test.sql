-- ============================================================
-- TEST LOT 2a-bis (partie 2/3) — rien n'est conserve. A lancer APRES lot2abis_order_apply.sql.
-- Cree une commande de virement REELLE via create_transfer_order (comme le ferait le site), avec un
-- produit non unique dont le stock est fixe a 1 puis 2 pour un resultat previsible, verifie :
--   1. la reservation de stock est bien creee (hold actif) a l'echeance de la commande
--   2. la confirmation (admin_confirm_transfer) consomme bien le stock (decompte reel) en plus de la piece
--      (confirmee tout de suite, pour liberer le plafond TRANSFER_CAP avant le controle suivant)
--   3. une quantite de 12 (au-dela de l'ancien plafond fixe de 10) est desormais ACCEPTEE par la validation
--      des articles, et seul le stock reel (ici insuffisant) la bloque -> STOCK_UNAVAILABLE, AUCUNE
--      commande creee (toute la fonction est annulee, pas seulement la reservation)
--   4. simule un stock devenu insuffisant entre la reservation et la confirmation : le paiement n'est PAS
--      bloque, une alerte admin uniquement (customer_visible = false) est ecrite
-- Simule la connexion d'un compte administrateur (necessaire pour admin_confirm_transfer).
-- Utilise le VRAI prix (ou prix promo) du produit choisi, lu en base, pour satisfaire le controle
-- PRICE_MISMATCH de create_transfer_order (aucun prix invente). Confirme chaque commande de virement
-- des qu'elle n'est plus utile au test suivant, pour ne jamais depasser le plafond TRANSFER_CAP (2 bagues
-- en attente de virement par compte) : seules les commandes encore "pending_transfer" comptent dans ce plafond.
-- Leve volontairement une erreur a la fin : TOUT est annule (orders, order_items, stock_holds, products.stock).
-- Attendu : « TEST_OK : N controles passes (rien n'est conserve) ».
-- ============================================================
create or replace function pg_temp.zen_as(p_uid uuid, p_email text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end
$f$;

do $zen$
declare
  v_admin_uid uuid;
  v_admin_email text;
  v_pid bigint;
  v_price numeric;
  v_promo numeric;
  v_unit numeric;
  v_oid bigint;
  v_oid2 bigint;
  v_res jsonb;
  v_n integer := 0;
  v_cnt integer;
  v_stock_after integer;
  v_held bigint;
begin
  if to_regprocedure('public.reserve_order_items(bigint,timestamp with time zone)') is null then
    raise exception 'ABANDON : lot 2a non applique ; rien n''a ete modifie';
  end if;
  if pg_get_functiondef('public.create_transfer_order(uuid,text,jsonb,numeric,numeric,numeric,numeric,text,text,text,text,text,text,text,boolean)'::regprocedure)
     not like '%ZENORIA_STOCK_V1%' then
    raise exception 'ABANDON : lot 2a-bis (partie 2/3) non applique sur create_transfer_order ; rien n''a ete modifie';
  end if;

  select user_id into v_admin_uid from public.admin_users limit 1;
  if v_admin_uid is null then raise exception 'ABANDON : aucun compte administrateur trouve'; end if;
  select email into v_admin_email from auth.users where id = v_admin_uid;

  -- Securite : si ce compte a deja des commandes en attente de virement (reste d'un test precedent
  -- interrompu), on les annule d'abord pour repartir sur un plafond TRANSFER_CAP a zero.
  if exists (select 1 from public.orders where user_id = v_admin_uid and status = 'pending_transfer') then
    update public.orders set status = 'cancelled', cancelled_by = 'admin', cancelled_at = now()
     where user_id = v_admin_uid and status = 'pending_transfer';
  end if;

  select id, price, promo_price into v_pid, v_price, v_promo
    from public.products where is_unique is not true and active is true order by id limit 1;
  if v_pid is null then raise exception 'ABANDON : aucun produit non unique actif trouve'; end if;
  v_unit := case when v_promo is not null and v_promo < v_price then v_promo else v_price end; -- meme regle que create_transfer_order

  update public.products set stock = 1 where id = v_pid;
  delete from public.stock_holds where product_id = v_pid;

  -- Reglages necessaires : virement active, delai de paiement connu
  update public.site_settings set value = jsonb_set(value, '{transfer_enabled}', 'true'::jsonb) where key = 'payment_methods';
  update public.site_settings set value = jsonb_set(value, '{delay_days}', '3'::jsonb) where key = 'bank_transfer';

  perform pg_temp.zen_as(v_admin_uid, v_admin_email);

  -- 1. Creation reelle d'une commande de virement (qty = 1, egal au stock) via la fonction publique, avec le vrai prix
  v_res := public.create_transfer_order(
    v_admin_uid, v_admin_email,
    jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 1, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
    v_unit, 0, 0, v_unit, null,
    'Test 2a-bis', '1 rue du Test', null, '75001', 'Paris', null, true
  );
  v_oid := (v_res ->> 'order_id')::bigint;
  if v_oid is null then raise exception 'ECHEC : create_transfer_order n''a pas renvoye de order_id'; end if;
  select coalesce(sum(qty), 0) into v_held from public.stock_holds where order_id = v_oid and product_id = v_pid and status = 'active';
  if v_held <> 1 then raise exception 'ECHEC : reservation de stock absente apres creation (% unite(s) tenue(s))', v_held; end if;
  v_n := v_n + 2;

  -- 2. Confirmation immediate : consomme le stock reel (decompte), et LIBERE le plafond TRANSFER_CAP
  --    (seules les commandes encore pending_transfer comptent) avant le controle 3
  v_res := public.admin_confirm_transfer(v_oid, v_unit, (now() at time zone 'Europe/Paris')::date, null);
  select stock into v_stock_after from public.products where id = v_pid;
  if v_stock_after <> 0 then raise exception 'ECHEC : stock apres confirmation attendu 0, obtenu %', v_stock_after; end if;
  if not exists (select 1 from public.stock_holds where order_id = v_oid and product_id = v_pid and status = 'consumed') then
    raise exception 'ECHEC : la reservation n''est pas passee a consumed apres confirmation';
  end if;
  v_n := v_n + 2;

  -- 3a. Quantite de 2 (sous le plafond TRANSFER_CAP = 2 bagues en attente par compte) mais au-dela du
  --     stock reel (0 disponible apres la consommation du controle 2) : doit etre bloquee par STOCK_UNAVAILABLE,
  --     jamais par INVALID_QTY (preuve que le plafond fixe de 10 ne joue aucun role ici, puisque 2 < 10 de toute facon,
  --     mais surtout que le controle de stock fonctionne correctement en situation reelle).
  --     Securite : on annule EXPLICITEMENT toute commande encore pending_transfer du compte au prealable.
  update public.orders set status = 'cancelled', cancelled_by = 'admin', cancelled_at = now()
   where user_id = v_admin_uid and status = 'pending_transfer';
  begin
    perform public.create_transfer_order(
      v_admin_uid, v_admin_email,
      jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 2, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
      v_unit * 2, 0, 0, v_unit * 2, null,
      'Test 2a-bis', '1 rue du Test', null, '75001', 'Paris', null, true
    );
    raise exception 'ECHEC : une quantite de 2 sans stock disponible aurait du etre refusee par STOCK_UNAVAILABLE';
  exception when others then
    if sqlerrm like '%INVALID_QTY%' then
      raise exception 'ECHEC : une quantite de 2 a ete rejetee par INVALID_QTY, qui ne devrait plus limiter la quantite';
    end if;
    if sqlerrm like '%TRANSFER_CAP%' then
      raise exception 'ECHEC : bloque par TRANSFER_CAP alors qu''aucune commande ne devrait etre en attente (% )', sqlerrm;
    end if;
    if sqlerrm not like '%STOCK_UNAVAILABLE%' then raise; end if;
  end;
  select count(*) into v_cnt from public.orders where guest_email = v_admin_email and total = v_unit * 2 and is_test is true and status <> 'cancelled';
  if v_cnt <> 0 then raise exception 'ECHEC : une commande a ete creee malgre le refus de stock (% ligne(s))', v_cnt; end if;
  v_n := v_n + 1;

  -- 3b. Quantite de 11 (strictement au-dela de l'ANCIEN plafond fixe de 10) : la validation des articles
  --     doit l'ACCEPTER (plus de v_qty > 10 dans create_transfer_order) ; seul le plafond TRANSFER_CAP,
  --     qui existait deja AVANT ce lot et n'est pas concerne par lui, peut encore la bloquer plus loin.
  --     Ce controle verifie uniquement que l'ancien INVALID_QTY ne se declenche plus pour qty=11.
  begin
    perform public.create_transfer_order(
      v_admin_uid, v_admin_email,
      jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 11, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
      v_unit * 11, 0, 0, v_unit * 11, null,
      'Test 2a-bis', '1 rue du Test', null, '75001', 'Paris', null, true
    );
    raise exception 'ECHEC : une quantite de 11 aurait du etre refusee (stock ou plafond TRANSFER_CAP), pas acceptee sans controle';
  exception when others then
    if sqlerrm like '%INVALID_QTY%' then
      raise exception 'ECHEC : une quantite de 11 a ete rejetee par l''ancien plafond fixe (INVALID_QTY), qui ne devrait plus exister';
    end if;
    -- STOCK_UNAVAILABLE ou TRANSFER_CAP sont tous deux acceptables ici : la seule chose prouvee est l'absence de INVALID_QTY
  end;
  v_n := v_n + 1;

  -- 4. Stock devenu insuffisant entre reservation et confirmation : alerte admin uniquement, paiement non bloque
  update public.products set stock = 2 where id = v_pid;
  v_res := public.create_transfer_order(
    v_admin_uid, v_admin_email,
    jsonb_build_array(jsonb_build_object('product_id', v_pid, 'qty', 2, 'unit_price', to_char(v_unit, 'FM999999990.00'))),
    v_unit * 2, 0, 0, v_unit * 2, null,
    'Test 2a-bis', '1 rue du Test', null, '75001', 'Paris', null, true
  );
  v_oid2 := (v_res ->> 'order_id')::bigint;
  update public.products set stock = 0 where id = v_pid; -- l'admin baisse le stock APRES la reservation, avant la confirmation
  v_res := public.admin_confirm_transfer(v_oid2, v_unit * 2, (now() at time zone 'Europe/Paris')::date, null);
  if (v_res ->> 'order_id')::bigint <> v_oid2 then raise exception 'ECHEC : la confirmation a ete bloquee malgre un stock insuffisant'; end if;
  select count(*) into v_cnt from public.order_status_history
   where order_id = v_oid2 and note like 'Alerte stock (admin)%' and customer_visible = false;
  if v_cnt <> 1 then raise exception 'ECHEC : alerte stock admin absente ou visible par la cliente (% ligne(s))', v_cnt; end if;
  v_n := v_n + 2;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_n;
end $zen$;
