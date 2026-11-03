-- ============================================================
-- LOT 5e-1 : comptes « à surveiller » (3 annulations ou plus par la cliente sur 30 jours)
--
-- Crée UNE fonction en lecture seule : public.admin_flagged_accounts()
--   - réservée aux administrateurs (is_admin()) : pour toute autre personne, elle renvoie 0 ligne
--   - ne compte que les annulations faites par la cliente (orders.cancelled_by = 'customer')
--   - fenêtre glissante de 30 jours sur orders.cancelled_at, seuil de 3 inclus
--   - commandes de test comprises (toutes les données actuelles sont des tests)
--   - exécutable par « authenticated » seulement (pas par « anon »)
--
-- Aucune table, aucune colonne, aucune donnée n'est modifiée.
-- Retour arrière : drop function public.admin_flagged_accounts();
-- ============================================================

create or replace function public.admin_flagged_accounts()
returns table (account_id uuid, cancellations integer, last_cancelled_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.user_id as account_id,
         count(*)::integer as cancellations,
         max(o.cancelled_at) as last_cancelled_at
  from public.orders o
  where public.is_admin()
    and o.user_id is not null
    and o.cancelled_by = 'customer'
    and o.cancelled_at >= now() - interval '30 days'
  group by o.user_id
  having count(*) >= 3;
$$;

revoke all on function public.admin_flagged_accounts() from public;
revoke all on function public.admin_flagged_accounts() from anon;
grant execute on function public.admin_flagged_accounts() to authenticated;
