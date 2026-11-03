-- ============================================================
-- LOT 4b (SQL) : transfer_grace_days() — le délai de grâce avant annulation automatique, lisible par Mon compte.
-- Le réglage bank_transfer est réservé à l'administration (IBAN) : cette fonction n'en expose QUE le délai de grâce
-- (même lecture que auto_cancel_overdue_transfers : entier de 0 à 30, sinon 2 jours).
-- Purement additif. Tout ou rien. Retour arrière : lot4b_grace_rollback.sql
-- ============================================================
do $zen$
begin
  if to_regprocedure('public.transfer_grace_days()') is not null then
    raise exception 'ABANDON : transfer_grace_days existe deja ; rien n''a ete modifie';
  end if;
  execute $ddl$
  create function public.transfer_grace_days()
   returns integer
   language sql
   stable
   security definer
   set search_path to ''
  as $function$
    select coalesce((
      select case
               when jsonb_typeof(s.value -> 'grace_days') = 'number'
                    and (s.value ->> 'grace_days')::numeric between 0 and 30
               then floor((s.value ->> 'grace_days')::numeric)::integer
               else null
             end
        from public.site_settings s
       where s.key = 'bank_transfer'
    ), 2)
  $function$
  $ddl$;
  execute $ddl$ revoke all on function public.transfer_grace_days() from public $ddl$;
  execute $ddl$ grant execute on function public.transfer_grace_days() to anon, authenticated $ddl$;
end $zen$;

-- Vérification : attendu delai = 2 (ou la valeur enregistrée), anon = true, authenticated = true
select public.transfer_grace_days() as delai,
       has_function_privilege('anon', 'public.transfer_grace_days()'::regprocedure, 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.transfer_grace_days()'::regprocedure, 'EXECUTE') as authenticated;
