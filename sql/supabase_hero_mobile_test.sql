-- ============================================================
-- ZENORIA_HERO_MOBILE_V1 : TEST du réglage « hero_mobile » — à lancer APRÈS supabase_hero_mobile.sql
-- Tout se passe dans une transaction ANNULÉE à la fin (rollback) : rien n'est conservé en base.
-- Résultat attendu : une série de NOTICE « OK : ... », puis le dernier SELECT qui renvoie « TEST_OK ».
-- Si un contrôle échoue, un message « ÉCHEC DU TEST : ... » s'affiche et la transaction s'arrête.
-- ============================================================
begin;

-- 1) Valeurs VALIDES : doivent être acceptées
do $$
declare v text; good text[] := array[
  '{"autoplay": true}', '{"autoplay": false}'];
begin
  foreach v in array good loop
    delete from public.site_settings where key = 'hero_mobile';
    insert into public.site_settings (key, value) values ('hero_mobile', v::jsonb);
    raise notice 'OK : valeur valide acceptée : %', v;
  end loop;
end $$;

-- 2) Valeurs INVALIDES : doivent TOUTES être rejetées par la contrainte (check_violation), sans autre erreur
do $$
declare v text; bad text[] := array[
  '{}', '{"autoplay": "true"}', '{"autoplay": "false"}', '{"autoplay": 1}', '{"autoplay": 0}',
  '{"autoplay": null}', '{"autoplay": [true]}', '{"autoplay": {"a": 1}}',
  '{"autoplay": true, "mode": "x"}', '{"enabled": true}',
  'true', '"texte"', '[1,2]', '5', 'null'];
begin
  foreach v in array bad loop
    begin
      delete from public.site_settings where key = 'hero_mobile';
      insert into public.site_settings (key, value) values ('hero_mobile', v::jsonb);
      raise exception 'ÉCHEC DU TEST : la valeur invalide % a été acceptée.', v;
    exception
      when check_violation then
        raise notice 'OK : valeur invalide rejetée proprement : %', v;
    end;
  end loop;
end $$;

-- 3) La contrainte ne touche JAMAIS les autres clés
do $$
begin
  insert into public.site_settings (key, value) values ('zz_autre_reglage', '{"nimporte": "quoi"}'::jsonb);
  raise notice 'OK : une autre clé n''est pas affectée par la contrainte.';
end $$;

-- 4) Lecture par un visiteur ANONYME (le cas réel du site) : la clé « hero_mobile » est lisible, les autres non
delete from public.site_settings where key = 'hero_mobile';
insert into public.site_settings (key, value) values ('hero_mobile', '{"autoplay": true}'::jsonb);
set local role anon;
do $$
declare n_hero int; n_autre int;
begin
  select count(*) into n_hero from public.site_settings where key = 'hero_mobile';
  select count(*) into n_autre from public.site_settings where key = 'zz_autre_reglage';
  if n_hero <> 1 then raise exception 'ÉCHEC DU TEST : un visiteur anonyme ne peut pas lire hero_mobile (% ligne(s) au lieu de 1). Le site ne verrait pas le réglage.', n_hero; end if;
  if n_autre <> 0 then raise exception 'ÉCHEC DU TEST : un visiteur anonyme peut lire une autre clé non publique (% ligne(s)). La politique est trop large.', n_autre; end if;
  raise notice 'OK : visiteur anonyme : hero_mobile lisible (1 ligne), autre clé non publique invisible (0 ligne).';
end $$;
reset role;

-- 5) Résultat final (visible dans le tableau de résultats), puis annulation de tout
select 'TEST_OK' as resultat, value from public.site_settings where key = 'hero_mobile';
rollback;
