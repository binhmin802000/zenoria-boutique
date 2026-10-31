-- ============================================================
-- LOT 1b : TEST de la contrainte (rien n'est conserve).
-- A lancer APRES lot1b_shipping_fee_constraint.sql. Modifie temporairement la ligne « shipping » puis annule TOUT
-- en levant volontairement une erreur finale : le resultat attendu est le message « TEST_OK : 16 controles passes ».
-- Toute autre erreur (ECHEC : ..., ABANDON : ...) signifie qu'un controle n'a pas le comportement prevu : envoyez-la telle quelle.
-- ============================================================
do $$
declare
  t record;
  v_ok int := 0;
begin
  if not exists (select 1 from public.site_settings where key = 'shipping') then
    raise exception 'ABANDON : ligne shipping absente de site_settings';
  end if;

  for t in
    select * from (values
      ('sans fee (format actuel)',            '{"enabled":true,"threshold":99}'::jsonb,                 true),
      ('fee 4.9',                             '{"enabled":true,"threshold":99,"fee":4.9}'::jsonb,       true),
      ('fee 0.5 (minimum)',                   '{"enabled":true,"threshold":99,"fee":0.5}'::jsonb,       true),
      ('fee 50 (maximum)',                    '{"enabled":false,"threshold":99,"fee":50}'::jsonb,       true),
      ('fee 6.50',                            '{"enabled":true,"threshold":99,"fee":6.50}'::jsonb,      true),
      ('fee 0.49 (trop bas)',                 '{"enabled":true,"threshold":99,"fee":0.49}'::jsonb,      false),
      ('fee 50.01 (trop haut)',               '{"enabled":true,"threshold":99,"fee":50.01}'::jsonb,     false),
      ('fee 4.999 (3 decimales)',             '{"enabled":true,"threshold":99,"fee":4.999}'::jsonb,     false),
      ('fee texte "4,90"',                    '{"enabled":true,"threshold":99,"fee":"4,90"}'::jsonb,    false),
      ('fee null',                            '{"enabled":true,"threshold":99,"fee":null}'::jsonb,      false),
      ('fee 0',                               '{"enabled":true,"threshold":99,"fee":0}'::jsonb,         false),
      ('fee negatif',                         '{"enabled":true,"threshold":99,"fee":-1}'::jsonb,        false),
      ('threshold absent (regle d''origine)', '{"enabled":true,"fee":4.9}'::jsonb,                      false),
      ('enabled texte (regle d''origine)',    '{"enabled":"oui","threshold":99}'::jsonb,                false),
      ('threshold decimal (regle d''origine)','{"enabled":true,"threshold":99.5}'::jsonb,               false),
      ('valeur tableau (regle d''origine)',   '[]'::jsonb,                                              false)
    ) as x(label, val, should_pass)
  loop
    begin
      update public.site_settings set value = t.val where key = 'shipping';
      if not t.should_pass then
        raise exception 'ECHEC : « % » aurait du etre refuse', t.label;
      end if;
      v_ok := v_ok + 1;
    exception when check_violation then
      if t.should_pass then
        raise exception 'ECHEC : « % » aurait du etre accepte', t.label;
      end if;
      v_ok := v_ok + 1;
    end;
  end loop;

  raise exception 'TEST_OK : % controles passes (rien n''est conserve)', v_ok;
end $$;
