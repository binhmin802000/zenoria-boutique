-- ============================================================
-- ZENORIA — RETOUR ARRIÈRE de l'étape 2 (thème des 4 saisons)
--
-- À exécuter dans : Supabase > SQL Editor > New query > Run — uniquement si vous voulez annuler l'étape 2.
-- Relançable sans risque. Tout est dans UNE transaction.
--
-- CE QUI EST SUPPRIMÉ (définitivement) :
--   * la table « families » (noms, descriptions et palettes saisies) ;
--   * la table « banners » (tous les bandeaux) ;
--   * les colonnes family_id, neighbour_family_id et dominant_colors de « products » (couleurs dominantes saisies) ;
--   * les colonnes starts_at et ends_at de « promo_codes » (dates saisies).
-- Si vous avez saisi des bandeaux, des couleurs dominantes ou des dates de codes promo, exportez-les d'abord.
--
-- CE QUI EST CONSERVÉ : toutes vos collections, leur ancienne colonne « family », leurs photos et leur suivi.
-- ============================================================

begin;

-- 1. Sécurité : un code qui n'est pas valable AUJOURD'HUI (expiré ou pas encore commencé) est DÉSACTIVÉ avant
--    la suppression des dates. Sans cela, il redeviendrait utilisable pour tout le monde.
update public.promo_codes
set active = false
where (ends_at is not null and ends_at <= now())
   or (starts_at is not null and starts_at > now());

-- 2. Règle de lecture d'origine des codes promo
drop policy if exists "promo_codes_select_public" on public.promo_codes;
create policy "promo_codes_select_public"
  on public.promo_codes for select
  using (active = true or public.is_admin());

-- 3. Colonnes ajoutées (leurs clés étrangères, contraintes et index partent avec elles)
alter table public.products drop column if exists family_id;
alter table public.products drop column if exists neighbour_family_id;
alter table public.products drop column if exists dominant_colors;

alter table public.promo_codes drop constraint if exists promo_codes_dates_order;
alter table public.promo_codes drop column if exists starts_at;
alter table public.promo_codes drop column if exists ends_at;

-- 4. Tables ajoutées
drop table if exists public.banners;
drop table if exists public.families;

-- 5. Fonctions ajoutées
drop function if exists public.zen_families_guard();
drop function if exists public.zen_stamp_row();
drop function if exists public.zen_valid_dominant_colors(jsonb);
drop function if exists public.zen_valid_palette(jsonb, integer);

notify pgrst, 'reload schema';

commit;
