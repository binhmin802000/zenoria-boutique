-- ============================================================
-- ZENORIA : animation « Le geste » pilotée depuis l'administration
-- (onglet « Contenu du site » > carte « Animation Le geste »)
--
-- À exécuter UNE FOIS dans Supabase > SQL Editor, après avoir lu supabase_ring_animation_checks.sql (lecture seule).
-- Le script peut être relancé sans danger. Pour l'annuler : supabase_ring_animation_rollback.sql.
--
-- Il fait trois choses, et rien d'autre :
--  1. site_media : autorise un troisième emplacement, « ring_animation_photo » (la bague détourée).
--  2. site_settings : lecture publique de deux clés de plus, « ring_animation » (vitesse, lecture, couleur du cœur)
--     et « site_texts » (textes modifiables du site, prévus pour l'étape suivante), en plus de « season_fx ».
--  3. site_settings : contrôle des valeurs de ces deux clés, pour qu'une saisie abîmée ne casse jamais le site.
--
-- Les règles d'écriture ne changent pas : seuls les administrateurs (is_admin()) peuvent écrire.
-- ============================================================

begin;

-- 1) Emplacements autorisés dans site_media
alter table public.site_media drop constraint if exists site_media_slot_check;
alter table public.site_media
  add constraint site_media_slot_check
  check (slot = any (array['hero_video'::text, 'savoir_faire_photo'::text, 'ring_animation_photo'::text]));

-- 2) Lecture publique des réglages (les visiteurs lisent ces clés ; l'écriture reste réservée aux administrateurs)
alter policy site_settings_select_public on public.site_settings
  using (key = any (array['season_fx'::text, 'ring_animation'::text, 'site_texts'::text]));

-- 3) Contrôle des valeurs
alter table public.site_settings drop constraint if exists site_settings_ring_animation_valid;
alter table public.site_settings
  add constraint site_settings_ring_animation_valid
  check (
    key <> 'ring_animation'
    or (
      coalesce(jsonb_typeof(value), ''::text) = 'object'
      and coalesce(value ->> 'speed', 'normal') = any (array['slow'::text, 'normal'::text, 'fast'::text])
      and coalesce(value ->> 'mode', 'once') = any (array['once'::text, 'loop'::text, 'vanish'::text])
      and coalesce(value ->> 'heart_color', 'ring') = any (array['ring'::text, 'season'::text])
    )
  );

alter table public.site_settings drop constraint if exists site_settings_site_texts_valid;
alter table public.site_settings
  add constraint site_settings_site_texts_valid
  check (
    key <> 'site_texts'
    or (
      coalesce(jsonb_typeof(value), ''::text) = 'object'
      and pg_column_size(value) < 40000
    )
  );

commit;
