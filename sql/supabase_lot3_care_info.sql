-- ============================================================
-- LOT 3 - ENTRETIEN DU BIJOU - ZENORIA_CARE_INFO_V1
--
-- Ajoute une seule politique de lecture publique, sur le modele de celle deja en place pour
-- « new_badge » et « account_news_cache ». Ne modifie aucune donnee existante.
-- ============================================================

create policy site_settings_select_public_care_info
  on public.site_settings for select
  to public
  using (key = 'care_info'::text);

-- ============================================================
-- RETOUR ARRIERE
--
--   drop policy if exists site_settings_select_public_care_info on public.site_settings;
--   delete from public.site_settings where key = 'care_info'; -- si le reglage a ete enregistre
-- ============================================================
