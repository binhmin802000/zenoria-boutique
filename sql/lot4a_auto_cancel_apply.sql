-- ============================================================
-- LOT 4a (SQL) : annulation automatique des commandes par virement non payées.
-- Règle : une commande « en attente de virement » est annulée quand  échéance en vigueur + délai de grâce  est dépassée.
--   L'échéance en vigueur tient compte des prolongations (admin_extend_transfer modifie transfer_due_at).
--   Délai de grâce : réglage bank_transfer.grace_days (0 à 30 jours ; 0 = dès l'échéance) ; absent = 2 jours.
-- Effets de l'annulation : statut « cancelled », cancelled_by = 'system', pièces ET stock remis en vente
--   (release_order_items), ligne de journal VISIBLE par la cliente :
--   « Annulée automatiquement : virement non reçu dans le délai. Votre bijou a été remis en vente. »
-- Contenu :
--   1. contrainte orders_cancelled_by_valid : ajoute 'system'
--   2. contrainte site_settings_bank_transfer_valid : accepte grace_days (entier de 0 à 30, facultatif), le reste inchangé
--   3. fonction auto_cancel_overdue_transfers() : fermée à tous les rôles ; chaque commande dans son propre bloc
--      (une erreur sur une commande n'empêche pas les autres) ; renvoie le nombre de commandes annulées
--   4. tâche pg_cron « zenoria-auto-cancel-transfers » : toutes les heures (à la minute 7)
-- Aucune commande existante n'est modifiée par ce script (la tâche, elle, agira à sa première exécution).
-- Tout ou rien. Retour arrière : lot4a_auto_cancel_rollback.sql
-- ============================================================
do $zen$
declare
  v_def text;
begin
  -- Contrôles préalables
  if to_regprocedure('public.auto_cancel_overdue_transfers()') is not null then
    raise exception 'ABANDON : le lot 4a est deja applique (fonction presente) ; rien n''a ete modifie';
  end if;
  if exists (select 1 from cron.job where jobname = 'zenoria-auto-cancel-transfers') then
    raise exception 'ABANDON : une tache pg_cron zenoria-auto-cancel-transfers existe deja ; rien n''a ete modifie';
  end if;
  if to_regprocedure('public.release_order_items(bigint,text)') is null then
    raise exception 'ABANDON : release_order_items introuvable (lot 2a) ; rien n''a ete modifie';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'orders_cancelled_by_valid';
  if v_def is null or v_def not like '%''customer''%' or v_def not like '%''admin''%' or v_def like '%''system''%' then
    raise exception 'ABANDON : contrainte orders_cancelled_by_valid absente ou de forme inattendue : % ; rien n''a ete modifie', v_def;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'site_settings_bank_transfer_valid';
  if v_def is null or v_def not like '%delay_days%' or v_def like '%grace_days%' then
    raise exception 'ABANDON : contrainte site_settings_bank_transfer_valid absente ou de forme inattendue ; rien n''a ete modifie';
  end if;

  -- 1. cancelled_by accepte 'system'
  execute $ddl$ alter table public.orders drop constraint orders_cancelled_by_valid $ddl$;
  execute $ddl$ alter table public.orders add constraint orders_cancelled_by_valid
    check (cancelled_by is null or cancelled_by = any (array['customer'::text, 'admin'::text, 'system'::text])) $ddl$;

  -- 2. bank_transfer accepte grace_days (facultatif, entier de 0 à 30) ; règles existantes inchangées
  execute $ddl$ alter table public.site_settings drop constraint site_settings_bank_transfer_valid $ddl$;
  execute $ddl$ alter table public.site_settings add constraint site_settings_bank_transfer_valid check (
    key <> 'bank_transfer'
    or (
      coalesce(jsonb_typeof(value), '') = 'object'
      and case
            when jsonb_typeof(value -> 'delay_days') = 'number'
            then ((value ->> 'delay_days')::numeric >= 1 and (value ->> 'delay_days')::numeric <= 60
                  and (value ->> 'delay_days')::numeric = trunc((value ->> 'delay_days')::numeric))
            else false
          end
      and char_length(coalesce(value ->> 'beneficiary', '')) <= 120
      and char_length(coalesce(value ->> 'iban', '')) <= 40
      and char_length(coalesce(value ->> 'bic', '')) <= 16
      and case
            when (value -> 'grace_days') is null then true
            when jsonb_typeof(value -> 'grace_days') = 'number'
            then ((value ->> 'grace_days')::numeric >= 0 and (value ->> 'grace_days')::numeric <= 30
                  and (value ->> 'grace_days')::numeric = trunc((value ->> 'grace_days')::numeric))
            else false
          end
    )
  ) $ddl$;

  -- 3. Fonction d'annulation automatique
  execute $ddl$
  create function public.auto_cancel_overdue_transfers()
   returns integer
   language plpgsql
   security definer
   set search_path to ''
  as $function$
  declare
    v_cfg jsonb;
    v_grace integer := 2;
    r record;
    v_n integer := 0;
  begin
    select value into v_cfg from public.site_settings where key = 'bank_transfer';
    if v_cfg is not null and jsonb_typeof(v_cfg -> 'grace_days') = 'number'
       and (v_cfg ->> 'grace_days')::numeric between 0 and 30 then
      v_grace := floor((v_cfg ->> 'grace_days')::numeric)::integer;
    end if;

    for r in
      select o.id
        from public.orders o
       where o.status = 'pending_transfer'
         and o.transfer_due_at is not null
         and o.transfer_due_at + make_interval(days => v_grace) < now()
       order by o.id
    loop
      begin
        update public.orders
           set status = 'cancelled', cancelled_by = 'system', cancelled_at = now()
         where id = r.id and status = 'pending_transfer';
        if found then
          perform public.release_order_items(r.id, 'expired');
          insert into public.order_status_history (order_id, status, note, actor_email, customer_visible)
          values (r.id, 'cancelled',
                  'Annulée automatiquement : virement non reçu dans le délai. Votre bijou a été remis en vente.',
                  null, true);
          v_n := v_n + 1;
        end if;
      exception when others then
        raise warning 'auto_cancel_overdue_transfers : commande % non annulee : %', r.id, sqlerrm;
      end;
    end loop;
    return v_n;
  end
  $function$
  $ddl$;
  execute $ddl$ revoke all on function public.auto_cancel_overdue_transfers() from public, anon, authenticated $ddl$;

  -- 4. Tâche horaire (minute 7 de chaque heure)
  perform cron.schedule('zenoria-auto-cancel-transfers', '7 * * * *', 'select public.auto_cancel_overdue_transfers()');
end $zen$;

-- Vérification (lecture seule)
select jobname, schedule, command, active from cron.job where jobname = 'zenoria-auto-cancel-transfers';
select has_function_privilege('anon', 'public.auto_cancel_overdue_transfers()'::regprocedure, 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.auto_cancel_overdue_transfers()'::regprocedure, 'EXECUTE') as authenticated;
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'orders_cancelled_by_valid';
