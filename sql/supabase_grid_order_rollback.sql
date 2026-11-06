-- ============================================================
-- ZENORIA : annule supabase_grid_order.sql
-- À lancer seulement pour revenir en arrière. Le site retombe sur la valeur par défaut (aléatoire, tous les jours),
-- ou sur l'ordre de la base si le code du lot R2 est lui aussi retiré.
-- ============================================================

begin;

-- Le réglage enregistré est retiré
delete from public.site_settings where key = 'grid_order';

alter table public.site_settings drop constraint if exists site_settings_grid_order_valid;

-- Lecture publique : on revient aux 8 clés précédentes (état relevé le 06/11/2026)
alter policy site_settings_select_public on public.site_settings
  using (key = any (array[
    'season_fx'::text, 'ring_animation'::text, 'site_texts'::text, 'shipping'::text,
    'reviews'::text, 'contact'::text, 'payment_methods'::text, 'cgv_text'::text
  ]));

commit;

-- Vérification (lecture seule) : la politique doit de nouveau lister 8 clés, sans grid_order
select policyname, qual
from pg_policies
where schemaname = 'public' and tablename = 'site_settings' and policyname = 'site_settings_select_public';
