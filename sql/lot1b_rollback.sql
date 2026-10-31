-- ============================================================
-- ROLLBACK LOT 1b (SQL) : remet la contrainte site_settings_shipping_valid dans sa forme d'origine
-- (enabled = booleen, threshold = entier de 1 a 1 000 ; le champ « fee » n'est plus controle par la base).
-- Aucune donnee modifiee : une valeur contenant « fee » reste en place et reste valide avec l'ancienne contrainte.
-- Tout ou rien : s'arrete SANS rien modifier si le lot 1b n'est pas applique.
-- ============================================================
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.site_settings'::regclass and c.conname = 'site_settings_shipping_valid';

  if v_def is null then
    raise exception 'ABANDON : contrainte site_settings_shipping_valid introuvable ; rien n''a ete modifie';
  end if;
  if v_def not like '%''fee''%' then
    raise exception 'ABANDON : le lot 1b (SQL) n''est pas applique ; rien n''a ete modifie';
  end if;

  alter table public.site_settings drop constraint site_settings_shipping_valid;
  alter table public.site_settings add constraint site_settings_shipping_valid check (
    key <> 'shipping'
    or (
      coalesce(jsonb_typeof(value), '') = 'object'
      and coalesce(jsonb_typeof(value -> 'enabled'), '') = 'boolean'
      and case
            when coalesce(jsonb_typeof(value -> 'threshold'), '') = 'number'
            then ((value ->> 'threshold')::numeric >= 1
                  and (value ->> 'threshold')::numeric <= 1000
                  and (value ->> 'threshold')::numeric = trunc((value ->> 'threshold')::numeric))
            else false
          end
    )
  );
end $$;

select pg_get_constraintdef(c.oid) like '%''fee''%' as contrainte_a_jour   -- attendu : false
  from pg_constraint c
 where c.conrelid = 'public.site_settings'::regclass and c.conname = 'site_settings_shipping_valid';
