-- ============================================================
-- 02b SIMULER L'ECHEANCE EN JOURS CALENDAIRES (pour tester le lot 5-bis-C)
-- Ne change QUE transfer_due_at, uniquement pour une commande is_test en attente de virement (pending_transfer).
-- L'echeance est placee a la FIN du jour cible (23:59:59, heure de Paris), comme le font desormais les vraies commandes.
--   'normal_3j'  -> dans 3 jours
--   'aujourdhui' -> aujourd'hui           : "En attente" - "echeance aujourd'hui"
--   'retard_1j'  -> hier                  : orange "Echeance depassee de 1 jour"
--   'retard_4j'  -> il y a 4 jours        : orange (derniere valeur avant le rouge)
--   'retard_5j'  -> il y a 5 jours        : ROUGE "En retard" (seuil = 5 jours)
--   'retard_6j'  -> il y a 6 jours        : rouge
-- ============================================================
do $$
declare
  v_id     bigint := 0;              -- <== A MODIFIER : numero de commande
  v_mode   text   := 'retard_4j';    -- <== A MODIFIER : voir la liste ci-dessus
  v_offset integer;
begin
  v_offset := case v_mode
                when 'normal_3j'  then 3
                when 'aujourdhui' then 0
                when 'retard_1j'  then -1
                when 'retard_4j'  then -4
                when 'retard_5j'  then -5
                when 'retard_6j'  then -6
                else null end;
  if v_offset is null then
    raise exception 'MODE INCONNU : %', v_mode;
  end if;

  update public.orders
     set transfer_due_at = (((now() at time zone 'Europe/Paris')::date + v_offset)::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Europe/Paris'
   where id = v_id
     and is_test is true
     and status = 'pending_transfer';

  if not found then
    raise exception 'AUCUNE MODIFICATION : la commande % n''est pas is_test + pending_transfer', v_id;
  end if;
end $$;

select id, status,
       to_char(transfer_due_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI:SS') as echeance_paris,
       ((now() at time zone 'Europe/Paris')::date - (transfer_due_at at time zone 'Europe/Paris')::date) as jours_de_retard
  from public.orders
 where is_test is true and status = 'pending_transfer'
 order by id;
