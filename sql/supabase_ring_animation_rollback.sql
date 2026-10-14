-- ============================================================
-- ZENORIA : annule supabase_ring_animation.sql
-- À lancer seulement pour revenir en arrière. Le site retombe sur la bague par défaut et les réglages recommandés.
-- ============================================================

begin;

-- La bague personnalisée et les réglages enregistrés sont retirés (le fichier de la bague reste dans le stockage :
-- supprimez-le depuis l'onglet Technique > fichiers orphelins, ou dans Storage > product-media > site/ring_animation_photo)
delete from public.site_media where slot = 'ring_animation_photo';
delete from public.site_settings where key in ('ring_animation', 'site_texts');

alter table public.site_settings drop constraint if exists site_settings_ring_animation_valid;
alter table public.site_settings drop constraint if exists site_settings_site_texts_valid;

alter policy site_settings_select_public on public.site_settings
  using (key = 'season_fx'::text);

alter table public.site_media drop constraint if exists site_media_slot_check;
alter table public.site_media
  add constraint site_media_slot_check
  check (slot = any (array['hero_video'::text, 'savoir_faire_photo'::text]));

commit;
