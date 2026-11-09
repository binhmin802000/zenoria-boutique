-- ZENORIA_NEWSLETTER_V1 — annule supabase_newsletter.sql
-- Retire la clé "newsletter" de la politique publique, la contrainte, et la ligne en base.

begin;

delete from public.site_settings where key = 'newsletter';

alter table public.site_settings drop constraint if exists site_settings_newsletter_valid;

alter policy site_settings_select_public on public.site_settings
  using (key = any (array[
    'season_fx','ring_animation','site_texts','shipping','reviews','contact','payment_methods','cgv_text','grid_order'
  ]::text[]));

commit;
