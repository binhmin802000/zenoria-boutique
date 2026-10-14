-- ============================================================
-- ZENORIA : vérifications (LECTURE SEULE) pour l'animation « Le geste »
-- À lancer dans Supabase > SQL Editor, avant puis après supabase_ring_animation.sql. Aucune de ces requêtes ne modifie rien.
-- ============================================================

-- 1) Contraintes des deux tables
--    Avant le script : site_media_slot_check ne liste que hero_video et savoir_faire_photo.
--    Après le script : elle liste aussi ring_animation_photo, et deux contraintes site_settings_* apparaissent.
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.site_media'::regclass, 'public.site_settings'::regclass)
order by 1, 2;

-- 2) Règles d'accès de site_settings
--    Après le script : site_settings_select_public doit lire les trois clés season_fx, ring_animation, site_texts.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename in ('site_media', 'site_settings')
order by tablename, policyname;

-- 3) Le stockage accepte-t-il les PNG ?
--    allowed_mime_types doit être vide (null) ou contenir image/png. Sinon l'envoi de la bague sera refusé :
--    Supabase > Storage > product-media > Edit bucket, puis ajoutez image/png.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'product-media';

-- 4) Contenu actuel des emplacements et des réglages
select slot, path, updated_at from public.site_media order by slot;
select key, value, updated_at from public.site_settings order by key;
