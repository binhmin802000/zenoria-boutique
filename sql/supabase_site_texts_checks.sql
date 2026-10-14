-- ============================================================
-- ZENORIA : vérifications (LECTURE SEULE) pour la carte « Textes du site »
-- Aucun script d'installation n'est nécessaire : la lecture publique de la clé « site_texts » et son contrôle sont
-- déjà installés par supabase_ring_animation.sql et supabase_shipping.sql. Ces requêtes le confirment.
-- Si l'éditeur n'affiche que le dernier résultat, sélectionnez chaque requête puis « Run selected ».
-- ============================================================

-- 1) Règle de lecture publique de site_settings
--    Attendu : site_settings_select_public lit season_fx, ring_animation, site_texts ET shipping.
--    Si « site_texts » manque : exécutez supabase_shipping.sql (il reprend les quatre clés d'un coup).
select tablename, policyname, cmd, qual
from pg_policies
where tablename = 'site_settings'
order by policyname;

-- 2) Contrainte sur la valeur de « site_texts »
--    Attendu : une ligne site_settings_site_texts_valid (objet JSON de moins de 40 000 octets).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.site_settings'::regclass
  and conname = 'site_settings_site_texts_valid';

-- 3) Textes enregistrés
--    Avant le premier enregistrement depuis l'administration : aucune ligne, le site affiche ses textes d'origine.
select key, value, updated_at from public.site_settings where key = 'site_texts';
