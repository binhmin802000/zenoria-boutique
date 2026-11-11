-- ZENORIA_NEW_BADGE_V2 : retour arrière du réglage « new_badge ». Sans danger : le site retrouve 14 jours, activé.
-- La ligne de réglage éventuelle (clé new_badge) n'est PAS supprimée : elle devient simplement inutilisée.
begin;
drop policy if exists site_settings_select_public_new_badge on public.site_settings;
alter table public.site_settings drop constraint if exists site_settings_new_badge_valid;
commit;
