-- ============================================================
-- LOT 5-BIS-C (SQL) : l'echeance d'un virement tombe a la FIN DE LA JOURNEE de Paris (23:59:59), pas a l'heure de la commande.
--   create_transfer_order : echeance = fin du jour (aujourd'hui + delai de paiement), heure de Paris
--   admin_extend_transfer : nouvelle echeance = fin du jour [max(jour de l'echeance actuelle, aujourd'hui) + N jours], heure de Paris
-- Methode : la definition ACTUELLE de chaque fonction est lue dans la base, UNE ligne est remplacee, puis la fonction est recreee.
--   -> aucun autre changement, signature et droits d'execution conserves (CREATE OR REPLACE).
-- Garde-fous : tout ou rien. S'arrete SANS rien modifier si une ligne attendue est absente ou en double, ou si le lot est deja applique.
-- Donnees existantes : aucune modifiee (les anciennes echeances restent telles quelles ; l'ecran les lit en jours de Paris).
-- Retour arriere : lot5bis_c_rollback.sql
-- ============================================================
do $$
declare
  c_old_create constant text := 'v_due := now() + make_interval(days => v_delay);';
  c_new_create constant text := 'v_due := (((now() at time zone ''Europe/Paris'')::date + v_delay)::timestamp + interval ''23 hours 59 minutes 59 seconds'') at time zone ''Europe/Paris''; -- ZENORIA_DUE_EOD_V1';
  c_old_extend constant text := 'v_new := greatest(coalesce(v_o.transfer_due_at, now()), now()) + make_interval(days => p_days);';
  c_new_extend constant text := 'v_new := ((greatest((coalesce(v_o.transfer_due_at, now()) at time zone ''Europe/Paris'')::date, (now() at time zone ''Europe/Paris'')::date) + p_days)::timestamp + interval ''23 hours 59 minutes 59 seconds'') at time zone ''Europe/Paris''; -- ZENORIA_DUE_EOD_V1';
  v_create text;
  v_extend text;
begin
  select pg_get_functiondef(p.oid) into v_create from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'create_transfer_order';
  select pg_get_functiondef(p.oid) into v_extend from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_extend_transfer';

  if v_create is null then raise exception 'ABANDON : fonction create_transfer_order introuvable'; end if;
  if v_extend is null then raise exception 'ABANDON : fonction admin_extend_transfer introuvable'; end if;
  if v_create like '%ZENORIA_DUE_EOD_V1%' or v_extend like '%ZENORIA_DUE_EOD_V1%' then
    raise exception 'ABANDON : le lot 5-bis-C (SQL) est deja applique';
  end if;
  if (length(v_create) - length(replace(v_create, c_old_create, ''))) / length(c_old_create) <> 1 then
    raise exception 'ABANDON : create_transfer_order n''a pas la ligne attendue (une seule occurrence) ; rien n''a ete modifie';
  end if;
  if (length(v_extend) - length(replace(v_extend, c_old_extend, ''))) / length(c_old_extend) <> 1 then
    raise exception 'ABANDON : admin_extend_transfer n''a pas la ligne attendue (une seule occurrence) ; rien n''a ete modifie';
  end if;

  execute replace(v_create, c_old_create, c_new_create);
  execute replace(v_extend, c_old_extend, c_new_extend);
end $$;

-- Verification (lecture seule) : attendu = patch_present true pour les deux ; create_transfer_order false/false ; admin_extend_transfer false/true
select p.proname,
       pg_get_functiondef(p.oid) like '%ZENORIA_DUE_EOD_V1%'        as patch_present,
       has_function_privilege('anon', p.oid, 'EXECUTE')              as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')     as authenticated
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('create_transfer_order', 'admin_extend_transfer')
 order by p.proname;
