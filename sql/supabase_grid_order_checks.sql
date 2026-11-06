-- ============================================================
-- ZENORIA : contrôles (LECTURE SEULE) avant et après supabase_grid_order.sql
-- (réglage « Ordre des bijoux », clé « grid_order » de la table site_settings)
--
-- À exécuter dans Supabase > SQL Editor. Aucune de ces requêtes ne modifie quoi que ce soit.
-- Exécutez-les AVANT supabase_grid_order.sql et envoyez-moi les résultats des requêtes 1, 3 et 4,
-- puis relancez-les APRÈS pour confirmer le résultat.
-- ============================================================

-- 1) Politiques de la table site_settings. Avant : la lecture publique doit lister EXACTEMENT 8 clés
--    (season_fx, ring_animation, site_texts, shipping, reviews, contact, payment_methods, cgv_text).
--    Après : les mêmes 8 clés + grid_order, soit 9.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'site_settings'
order by policyname;

-- 2) Contraintes de site_settings. Après : une ligne « site_settings_grid_order_valid » de plus.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.site_settings'::regclass
order by conname;

-- 3) Déclencheurs de site_settings (le journal des réglages, lot C5, doit y figurer)
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.site_settings'::regclass and not tgisinternal;

-- 4) Code de la fonction du déclencheur : je dois vérifier qu'elle journalise TOUTES les clés
--    (et pas seulement une liste), pour que « Ordre des bijoux » apparaisse dans le journal
select p.proname, pg_get_functiondef(p.oid) as code
from pg_proc p
join pg_trigger t on t.tgfoid = p.oid
where t.tgrelid = 'public.site_settings'::regclass and not t.tgisinternal;

-- 5) Une ligne « grid_order » existe-t-elle déjà ? Avant : aucune ligne (le site utilise alors la valeur par défaut :
--    aléatoire, tous les jours).
select key, value, updated_at
from public.site_settings
where key = 'grid_order';

-- 6) Colonnes de site_settings
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'site_settings'
order by ordinal_position;
