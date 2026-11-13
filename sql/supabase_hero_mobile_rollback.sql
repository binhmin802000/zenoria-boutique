-- ZENORIA_HERO_MOBILE_V1 : retour arrière du réglage « hero_mobile ». Sans danger : le site retrouve l'image fixe + ▶ sur mobile.
-- La ligne de réglage éventuelle (clé hero_mobile) n'est PAS supprimée : elle devient simplement inutilisée.
begin;
drop policy if exists site_settings_select_public_hero_mobile on public.site_settings;
alter table public.site_settings drop constraint if exists site_settings_hero_mobile_valid;
commit;
