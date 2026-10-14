-- ============================================================
-- ZENORIA : annule supabase_shipping.sql
-- À lancer seulement pour revenir en arrière. Le site retombe sur le réglage par défaut (activée, 75 €).
-- ============================================================

begin;

-- Le réglage enregistré est retiré
delete from public.site_settings where key = 'shipping';

alter table public.site_settings drop constraint if exists site_settings_shipping_valid;

-- Lecture publique : on revient aux trois clés précédentes
-- (si le script de l'animation n'a jamais été exécuté, les clés « ring_animation » et « site_texts » restent sans effet)
alter policy site_settings_select_public on public.site_settings
  using (key = any (array['season_fx'::text, 'ring_animation'::text, 'site_texts'::text]));

commit;
