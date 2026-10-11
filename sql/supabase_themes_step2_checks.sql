-- ============================================================
-- ZENORIA — Contrôles APRÈS l'étape 2 (lecture seule : ne modifie rien)
--
-- À exécuter dans : Supabase > SQL Editor > New query > Run
-- Le SQL Editor n'affiche que le DERNIER résultat : exécutez les deux requêtes ci-dessous l'une après l'autre
-- (sélectionnez la première, Run ; puis la seconde, Run), et envoyez-moi les deux résultats.
-- ============================================================

-- ------------------------------------------------------------
-- REQUÊTE 1 : état de la base
-- ------------------------------------------------------------
select n, controle, resultat, attendu from (
  select 1 as n, 'Familles' as controle, count(*)::text as resultat, '5' as attendu
    from public.families
  union all
  select 2, 'Saisons du quiz (verrouillées, en ligne)', count(*)::text, '4'
    from public.families where is_season and active
  union all
  select 3, 'Famille masquée', coalesce(string_agg(name, ', '), 'aucune'), 'Édition limitée'
    from public.families where not active
  union all
  select 4, 'Collections rattachées à une saison', count(*)::text, 'voir ligne 5'
    from public.products where family_id is not null
  union all
  select 5, 'Collections SANS famille (à me communiquer)', coalesce(string_agg(slug, ', ' order by slug), 'aucune'), 'idéalement : aucune'
    from public.products where family_id is null
  union all
  select 6, 'Rattachement : ' || f.key, coalesce(string_agg(p.slug, ', ' order by p.slug), 'aucune collection'), 'voir mon tableau'
    from public.families f
    left join public.products p on p.family_id = f.id
    where f.is_season
    group by f.key
  union all
  select 7, 'Règles de lecture (SELECT) sur promo_codes', count(*)::text || ' : ' || coalesce(string_agg(policyname::text, ', '), '-'), '1 règle : promo_codes_select_public'
    from pg_policies where schemaname = 'public' and tablename = 'promo_codes' and cmd = 'SELECT'
  union all
  select 8, 'Codes promo avec des dates', count(*)::text, '0'
    from public.promo_codes where starts_at is not null or ends_at is not null
  union all
  select 9, 'Bandeaux', count(*)::text, '0'
    from public.banners
  union all
  select 10, 'Sécurité (RLS) activée', string_agg(c.relname::text || '=' || c.relrowsecurity::text, ', ' order by c.relname::text), 'banners=true, families=true'
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relname in ('families', 'banners')
) t
order by n, controle;

-- ------------------------------------------------------------
-- REQUÊTE 2 : ce que voit un VISITEUR (sans compte). Exécutez-la seule.
-- Attendu : 4 lignes (printemps, ete, automne, hiver) ; la famille « limited » ne doit PAS apparaître.
-- ------------------------------------------------------------
begin;
set local role anon;
select key, name, active from public.families order by sort_order;
rollback;
