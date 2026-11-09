-- ZENORIA_NEWSLETTER_V1 — à exécuter APRÈS supabase_newsletter.sql pour vérifier la contrainte.
-- N'écrit rien de permanent (transaction annulée à la fin).

begin;

-- Doit échouer (contrainte) : valeur sans champ "enabled" (objet vide)
-- Ce cas précis a déjà été accepté à tort une première fois (jsonb_typeof(value->'enabled') valait NULL,
-- et une contrainte CHECK accepte une ligne quand le résultat est NULL) ; corrigé via coalesce(..., 'absent').
do $$
begin
  begin
    insert into public.site_settings (key, value) values ('newsletter', '{}'::jsonb)
    on conflict (key) do update set value = excluded.value;
    raise exception 'ÉCHEC DU TEST : une valeur invalide ({}) a été acceptée.';
  exception
    when check_violation then
      raise notice 'OK : {} correctement rejeté par la contrainte.';
  end;
end $$;

-- Doit échouer (contrainte) : "enabled" présent mais explicitement null (autre façon d'obtenir NULL)
do $$
begin
  begin
    insert into public.site_settings (key, value) values ('newsletter', '{"enabled": null}'::jsonb)
    on conflict (key) do update set value = excluded.value;
    raise exception 'ÉCHEC DU TEST : {"enabled": null} a été accepté à tort.';
  exception
    when check_violation then
      raise notice 'OK : {"enabled": null} correctement rejeté.';
  end;
end $$;

-- Doit échouer (contrainte) : champ supplémentaire non autorisé
do $$
begin
  begin
    insert into public.site_settings (key, value) values ('newsletter', '{"enabled": true, "mode": "x"}'::jsonb)
    on conflict (key) do update set value = excluded.value;
    raise exception 'ÉCHEC DU TEST : une valeur avec un champ en trop a été acceptée.';
  exception
    when check_violation then
      raise notice 'OK : champ en trop correctement rejeté.';
  end;
end $$;

-- Doit échouer SANS LEVER D'ERREUR INATTENDUE (pas "cannot delete from scalar" ni autre erreur technique,
-- mais bien un rejet propre de la contrainte) : valeurs qui ne sont pas des objets JSON.
do $$
declare
  v text;
  bad_values text[] := array['true', '"texte"', '[1,2]', '5', 'null'];
begin
  foreach v in array bad_values loop
    begin
      insert into public.site_settings (key, value) values ('newsletter', v::jsonb)
      on conflict (key) do update set value = excluded.value;
      raise exception 'ÉCHEC DU TEST : la valeur non-objet % a été acceptée à tort.', v;
    exception
      when check_violation then
        raise notice 'OK : valeur non-objet % correctement rejetée (sans erreur technique).', v;
    end;
  end loop;
end $$;

-- Doit réussir : forme valide
insert into public.site_settings (key, value) values ('newsletter', '{"enabled": false}'::jsonb)
on conflict (key) do update set value = excluded.value;

select key, value from public.site_settings where key = 'newsletter';

rollback; -- rien n'est conservé : à exécuter ensuite "pour de vrai" via l'admin (interrupteur) ou un insert dédié
