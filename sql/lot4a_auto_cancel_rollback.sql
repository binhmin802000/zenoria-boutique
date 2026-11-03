-- ============================================================
-- ROLLBACK LOT 4a : supprime la tâche horaire et la fonction, et remet les deux contraintes dans leur forme d'avant.
-- ABANDON sans rien modifier si des commandes portent déjà cancelled_by = 'system', ou si le réglage bank_transfer
-- contient grace_days (à retirer d'abord), car les anciennes contraintes les refuseraient.
-- ============================================================
do $zen$
begin
  if exists (select 1 from public.orders where cancelled_by = 'system') then
    raise exception 'ABANDON : des commandes ont ete annulees automatiquement (cancelled_by = system) ; rien n''a ete modifie';
  end if;
  if exists (select 1 from public.site_settings where key = 'bank_transfer' and (value -> 'grace_days') is not null) then
    raise exception 'ABANDON : le reglage bank_transfer contient grace_days ; retirez-le d''abord ; rien n''a ete modifie';
  end if;
  if exists (select 1 from cron.job where jobname = 'zenoria-auto-cancel-transfers') then
    perform cron.unschedule('zenoria-auto-cancel-transfers');
  end if;
  execute $ddl$ drop function if exists public.auto_cancel_overdue_transfers() $ddl$;
  execute $ddl$ alter table public.orders drop constraint orders_cancelled_by_valid $ddl$;
  execute $ddl$ alter table public.orders add constraint orders_cancelled_by_valid
    check (cancelled_by is null or cancelled_by = any (array['customer'::text, 'admin'::text])) $ddl$;
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
    )
  ) $ddl$;
end $zen$;

select count(*) as taches_restantes from cron.job where jobname = 'zenoria-auto-cancel-transfers'; -- attendu : 0
