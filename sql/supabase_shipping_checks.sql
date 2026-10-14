-- ============================================================
-- ZENORIA : vérifications (LECTURE SEULE) pour le réglage de la livraison
-- À lancer dans Supabase > SQL Editor, avant puis après supabase_shipping.sql.
-- Aucune de ces requêtes ne modifie rien. Si l'éditeur n'affiche que le dernier résultat, sélectionnez chaque
-- requête puis « Run selected ».
-- ============================================================

-- 1) Règle de lecture publique de site_settings
--    Après le script : site_settings_select_public doit lire season_fx, ring_animation, site_texts ET shipping.
select tablename, policyname, cmd, qual
from pg_policies
where tablename = 'site_settings'
order by policyname;

-- 2) Contraintes de site_settings
--    Après le script : une ligne site_settings_shipping_valid apparaît.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.site_settings'::regclass
order by conname;

-- 3) Réglages enregistrés
--    Avant le premier enregistrement depuis l'administration, aucune ligne « shipping » : le site utilise 75 €, activée.
select key, value, updated_at from public.site_settings order by key;
