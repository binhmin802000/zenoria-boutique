-- ROLLBACK LOT 4b (SQL) : supprime transfer_grace_days(). Mon compte revient alors au délai par défaut (2 jours).
drop function if exists public.transfer_grace_days();
select to_regprocedure('public.transfer_grace_days()') as fonction_restante; -- attendu : null
