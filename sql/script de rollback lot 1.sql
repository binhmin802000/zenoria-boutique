begin;

alter table public.invoices
  drop constraint if exists invoices_payment_method_valid;
alter table public.invoices
  drop column if exists payment_method,
  drop column if exists paid_at;

-- Pour revenir aux versions precedentes des fonctions, relancer les
-- definitions exactes recuperees par pg_get_functiondef avant ce lot
-- (celles que vous m'avez deja envoyees dans cette conversation).

commit;