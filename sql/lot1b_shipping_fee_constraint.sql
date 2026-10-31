-- ============================================================
-- LOT 1b (SQL) : la base controle aussi le champ « fee » (frais de livraison) du reglage « shipping ».
-- Regle : « fee » est FACULTATIF ; s'il est present, c'est un nombre de 0,50 a 50,00 avec au plus 2 decimales.
-- Le reste de la contrainte est inchange : enabled = booleen, threshold = entier de 1 a 1 000.
-- Effet immediat : aucun. La ligne actuelle {"enabled":true,"threshold":99} reste valide (pas de fee : le site utilise 4,90 EUR).
-- Une seule table touchee : public.site_settings (contrainte site_settings_shipping_valid). Aucune donnee modifiee.
-- Ordre libre avec le patch du code : l'ancienne contrainte acceptait deja un champ en plus, la nouvelle le controle.
-- Garde-fous : tout ou rien ; s'arrete SANS rien modifier si la contrainte est absente, deja a jour ou de forme inattendue.
-- Retour arriere : lot1b_rollback.sql
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
  if v_def like '%''fee''%' then
    raise exception 'ABANDON : le lot 1b (SQL) est deja applique ; rien n''a ete modifie';
  end if;
  if v_def not like '%''enabled''%' or v_def not like '%''threshold''%' then
    raise exception 'ABANDON : la contrainte n''a pas la forme attendue ; rien n''a ete modifie';
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
      and case
            when (value -> 'fee') is null then true
            when jsonb_typeof(value -> 'fee') = 'number'
            then ((value ->> 'fee')::numeric >= 0.5
                  and (value ->> 'fee')::numeric <= 50
                  and (value ->> 'fee')::numeric = round((value ->> 'fee')::numeric, 2))
            else false
          end
    )
  );
end $$;

-- Verification (lecture seule) : attendu = ligne_shipping_ok true ; la contrainte contient bien 'fee'
select pg_get_constraintdef(c.oid) like '%''fee''%' as contrainte_a_jour,
       (select value::text from public.site_settings where key = 'shipping') as valeur_actuelle
  from pg_constraint c
 where c.conrelid = 'public.site_settings'::regclass and c.conname = 'site_settings_shipping_valid';
