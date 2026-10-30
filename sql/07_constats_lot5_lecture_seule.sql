-- ============================================================
-- 07 CONSTATS LOT 5 (lecture seule, ne modifie rien)
-- Objet : repondre avec des faits (et non des suppositions) aux
--   remarques de la grille : notes, historique, heures, pieces
--   uniques / stock, fonctions concernees.
-- A MODIFIER : remplacer les trois 0 par les numeros de commande
--   utilises pour O1, O2, O3 (il y a une seule liste ci-dessous,
--   a recopier dans les 5 occurrences "array[0,0,0]").
-- Resultat : un seul tableau (k, info).
-- ============================================================
select k, info from (

  -- a. journal des commandes (heures en Europe/Paris)
  select 'a journal' as k,
         h.order_id::text || ' | #' || h.id::text || ' | ' || h.status || ' | '
         || to_char(h.changed_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI:SS')
         || ' | ' || coalesce(h.actor_email, '-') || ' | note=' || coalesce(h.note, '(vide)') as info
    from public.order_status_history h
   where h.order_id = any (array[0,0,0]::bigint[])

  union all
  -- b. commandes
  select 'b commande',
         o.id::text || ' | ' || o.status || ' | total=' || o.total::text
         || ' | recu=' || coalesce(o.transfer_received_amount::text, '-')
         || ' | recu_le=' || coalesce(to_char(o.transfer_received_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'), '-')
         || ' | paid_at=' || coalesce(to_char(o.paid_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'), '-')
         || ' | annulee_par=' || coalesce(o.cancelled_by, '-')
    from public.orders o
   where o.id = any (array[0,0,0]::bigint[])

  union all
  -- c. reservations
  select 'c reservation',
         p.order_id::text || ' | produit=' || p.product_id::text || ' | ' || p.status
         || ' | liberee=' || coalesce(to_char(p.released_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'), '-')
         || ' | raison=' || coalesce(p.release_reason, '-')
    from public.product_holds p
   where p.order_id = any (array[0,0,0]::bigint[])

  union all
  -- d. valeurs de statut reellement utilisees dans product_holds
  select 'd valeurs holds',
         'status=' || coalesce(status, '-') || ' | raison=' || coalesce(release_reason, '-') || ' | nb=' || count(*)::text
    from public.product_holds
   group by status, release_reason

  union all
  -- e. produits concernes (piece unique ?)
  select 'e produit',
         pr.id::text || ' | is_unique=' || coalesce(pr.is_unique::text, 'null')
    from public.products pr
   where pr.id in (select product_id from public.product_holds where order_id = any (array[0,0,0]::bigint[]))

  union all
  -- f. colonnes de la table products (existe-t-il une quantite en stock ?)
  select 'f colonne products', column_name || ' (' || data_type || ')'
    from information_schema.columns
   where table_schema = 'public' and table_name = 'products'

  union all
  -- g. factures
  select 'g facture',
         i.order_id::text || ' | ' || i.number || ' | mode=' || coalesce(i.payment_method, '-')
         || ' | payee_le=' || coalesce(to_char(i.paid_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'), '-')
    from public.invoices i
   where i.order_id = any (array[0,0,0]::bigint[])

  union all
  -- h. fonctions SQL liees au virement / annulation / reservation
  select 'h fonction', p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname ~* '(transfer|cancel|extend|confirm|hold|piece|zen|invoice)'

) t
order by k, info;
