-- ============================================================
-- ROLLBACK LOT 3d (SQL) : remet la regle de lecture directe order_status_history_select_own
-- (meme definition que l'originale : is_admin() OR commande appartenant a la cliente).
-- Aucune donnee modifiee. Tout ou rien : ABANDON sans rien faire si la regle existe deja.
-- ============================================================
do $zen$
begin
  if exists (
    select 1 from pg_policy pol
     where pol.polrelid = 'public.order_status_history'::regclass and pol.polname = 'order_status_history_select_own'
  ) then
    raise exception 'ABANDON : la regle order_status_history_select_own existe deja ; rien n''a ete modifie';
  end if;

  create policy order_status_history_select_own on public.order_status_history
    for select
    using (
      is_admin() or exists (
        select 1 from public.orders o
         where o.id = order_status_history.order_id and o.user_id = auth.uid()
      )
    );
end $zen$;

select policyname, cmd, qual from pg_policies
 where schemaname = 'public' and tablename = 'order_status_history'
 order by policyname;
