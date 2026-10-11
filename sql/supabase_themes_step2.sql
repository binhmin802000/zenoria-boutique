-- ============================================================
-- ZENORIA — Thème des 4 saisons, ÉTAPE 2 : la base de données
--
-- À exécuter UNE FOIS dans : Supabase > SQL Editor > New query > Run
-- (branche theme-saisons ; le site en ligne continue de fonctionner sans changement)
--
-- Ce script est UNIQUEMENT ADDITIF :
--   * il crée les tables « families » (familles) et « banners » (bandeaux) ;
--   * il ajoute des colonnes à « products » (family_id, neighbour_family_id, dominant_colors)
--     et à « promo_codes » (starts_at, ends_at) ;
--   * il rattache les 10 collections connues à leur saison (par leur identifiant « slug »).
--
-- Il ne supprime ni ne modifie rien d'existant :
--   * l'ancienne colonne products.family (« Collection Bleus »…) reste INTACTE : le site actuel s'en sert encore ;
--   * le suivi « modifiée le / par » des collections n'est pas touché (garde-fou vérifié à la fin) ;
--   * la composition en cristaux (products.crystals) reste en base, simplement masquée plus tard.
--
-- Une seule règle existante change : la lecture publique des codes promo ignore désormais les codes dont les dates
-- sont dépassées ou pas encore commencées. Aucun code actuel n'a de dates : rien ne change tant que vous n'en saisissez pas.
--
-- Tout est dans UNE transaction : si une erreur survient, rien n'est appliqué. Relançable sans risque.
-- Retour arrière : supabase_themes_step2_rollback.sql
-- Contrôles après exécution : supabase_themes_step2_checks.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Photographie des collections AVANT toute modification
--    (sert au garde-fou de la section 8 ; supprimée automatiquement à la fin)
-- ------------------------------------------------------------
create temp table zen_products_before on commit drop as
  select id, family, created_at, updated_at, updated_by_email
  from public.products;

-- ------------------------------------------------------------
-- 1. Fonctions utilitaires
-- ------------------------------------------------------------

-- Liste de couleurs « #rrggbb » (au plus max_len éléments)
create or replace function public.zen_valid_palette(p jsonb, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    else jsonb_array_length(p) <= max_len
      and not exists (
        select 1
        from jsonb_array_elements(p) as e(v)
        where jsonb_typeof(e.v) <> 'string'
           or (e.v #>> '{}') !~ '^#[0-9a-fA-F]{6}$'
      )
  end;
$$;

-- Couleurs dominantes d'une bague : 0 à 3 éléments { "name": "Brun doré", "hex": "#a0764f" }
create or replace function public.zen_valid_dominant_colors(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    else jsonb_array_length(p) <= 3
      and not exists (
        select 1
        from jsonb_array_elements(p) as e(v)
        where jsonb_typeof(e.v) <> 'object'
           or jsonb_typeof(e.v -> 'name') is distinct from 'string'
           or jsonb_typeof(e.v -> 'hex') is distinct from 'string'
           or char_length(e.v ->> 'name') not between 1 and 30
           or (e.v ->> 'hex') !~ '^#[0-9a-fA-F]{6}$'
      )
  end;
$$;

-- Renseigne « créé / modifié le … par … » à partir du compte connecté (le navigateur ne peut pas le falsifier)
create or replace function public.zen_stamp_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mail text := null;
begin
  if uid is not null then
    select u.email::text into mail from auth.users u where u.id = uid;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := uid;
    new.created_by_email := mail;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
  end if;
  new.updated_at := now();
  new.updated_by := uid;
  new.updated_by_email := mail;
  return new;
end;
$$;

-- Cette fonction n'est utile que comme déclencheur : personne ne doit pouvoir l'appeler directement
revoke all on function public.zen_stamp_row() from public, anon, authenticated;

-- Protège les saisons : on ne les supprime pas et on ne change pas leur identifiant technique
create or replace function public.zen_families_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_season then
      raise exception 'La famille « % » est une saison utilisée par le quiz : elle ne peut pas être supprimée.', old.name
        using errcode = '23514';
    end if;
    return old;
  end if;
  if new.key is distinct from old.key then
    raise exception 'L identifiant technique d une famille ne peut pas être modifié (il est utilisé par le site).'
      using errcode = '23514';
  end if;
  if new.is_season is distinct from old.is_season then
    raise exception 'Le statut « saison du quiz » d une famille ne peut pas être modifié.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Table des familles (les 4 saisons + familles supplémentaires)
-- ------------------------------------------------------------
create table if not exists public.families (
  id bigint generated by default as identity primary key,
  key text not null,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  accent text not null default '#8f6075',
  palette jsonb not null default '[]'::jsonb,
  is_season boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  constraint families_key_unique unique (key),
  constraint families_key_format check (key ~ '^[a-z0-9-]{2,30}$'),
  constraint families_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint families_tagline_len check (char_length(tagline) <= 80),
  constraint families_description_len check (char_length(description) <= 240),
  constraint families_accent_hex check (accent ~ '^#[0-9a-fA-F]{6}$'),
  constraint families_palette_valid check (public.zen_valid_palette(palette, 6)),
  constraint families_season_active check (not is_season or active)
);

create unique index if not exists families_name_unique on public.families (lower(btrim(name)));

drop trigger if exists families_guard on public.families;
create trigger families_guard
  before update or delete on public.families
  for each row execute function public.zen_families_guard();

drop trigger if exists families_stamp on public.families;
create trigger families_stamp
  before insert or update on public.families
  for each row execute function public.zen_stamp_row();

alter table public.families enable row level security;

-- Lecture : tout le monde voit les familles en ligne ; un administrateur voit aussi les familles masquées
drop policy if exists "families_select_public" on public.families;
create policy "families_select_public"
  on public.families for select
  using (active = true or public.is_admin());

drop policy if exists "families_insert_admin" on public.families;
create policy "families_insert_admin"
  on public.families for insert
  with check (public.is_admin());

drop policy if exists "families_update_admin" on public.families;
create policy "families_update_admin"
  on public.families for update
  using (public.is_admin())
  with check (public.is_admin());

-- Les saisons ne se suppriment pas (règle doublée par le trigger families_guard)
drop policy if exists "families_delete_admin" on public.families;
create policy "families_delete_admin"
  on public.families for delete
  using (public.is_admin() and not is_season);

grant select on public.families to anon, authenticated;
grant insert, update, delete on public.families to authenticated;

-- Les 4 saisons du quiz + une famille supplémentaire masquée et vide
insert into public.families (key, name, tagline, description, accent, palette, is_season, sort_order, active) values
  ('printemps', 'Printemps', 'Fraîcheur et lumière', 'Teintes chaudes, claires et lumineuses.', '#e98a63',
   '["#f26b5b","#f8b79a","#f0c24b","#9fdcb6"]'::jsonb, true, 1, true),
  ('ete', 'Été', 'Douceur et légèreté', 'Teintes fraîches, douces et poudrées.', '#8a8fd1',
   '["#e8b7c4","#9db9e6","#b9a7e0","#a8bfa2"]'::jsonb, true, 2, true),
  ('automne', 'Automne', 'Chaleur et profondeur', 'Teintes chaudes, riches et profondes.', '#b5622e',
   '["#c8643b","#d9a02b","#7b7a2c","#a8452a"]'::jsonb, true, 3, true),
  ('hiver', 'Hiver', 'Éclat et contraste', 'Teintes froides, nettes et contrastées.', '#2f4a9a',
   '["#2748b8","#c2182b","#0f8a5f","#4b2a7a"]'::jsonb, true, 4, true),
  ('limited', 'Édition limitée', 'Séries courtes', 'Créations exclusives, en séries courtes.', '#d8b36d',
   '["#d8b36d","#8f6075","#2e2e2e"]'::jsonb, false, 5, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 3. Nouvelles colonnes de « products » (collections)
-- ------------------------------------------------------------
alter table public.products add column if not exists family_id bigint;
alter table public.products add column if not exists neighbour_family_id bigint;
alter table public.products add column if not exists dominant_colors jsonb not null default '[]'::jsonb;

alter table public.products drop constraint if exists products_family_id_fkey;
alter table public.products
  add constraint products_family_id_fkey
  foreign key (family_id) references public.families (id) on delete restrict;

alter table public.products drop constraint if exists products_neighbour_family_id_fkey;
alter table public.products
  add constraint products_neighbour_family_id_fkey
  foreign key (neighbour_family_id) references public.families (id) on delete set null;

alter table public.products drop constraint if exists products_neighbour_differs;
alter table public.products
  add constraint products_neighbour_differs
  check (neighbour_family_id is null or family_id is null or neighbour_family_id <> family_id);

alter table public.products drop constraint if exists products_dominant_colors_valid;
alter table public.products
  add constraint products_dominant_colors_valid
  check (public.zen_valid_dominant_colors(dominant_colors));

create index if not exists products_family_id_idx on public.products (family_id);
create index if not exists products_neighbour_family_id_idx on public.products (neighbour_family_id);

-- ------------------------------------------------------------
-- 4. Dates de validité des codes promo
-- ------------------------------------------------------------
alter table public.promo_codes add column if not exists starts_at timestamptz;
alter table public.promo_codes add column if not exists ends_at timestamptz;

alter table public.promo_codes drop constraint if exists promo_codes_dates_order;
alter table public.promo_codes
  add constraint promo_codes_dates_order
  check (starts_at is null or ends_at is null or ends_at > starts_at);

-- La lecture publique ne montre plus que les codes actifs ET dans leur période (horloge de la base de données).
-- Les codes sans dates restent visibles comme avant.
drop policy if exists "promo_codes_select_public" on public.promo_codes;
create policy "promo_codes_select_public"
  on public.promo_codes for select
  using (
    public.is_admin()
    or (
      active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
    )
  );

-- ------------------------------------------------------------
-- 5. Table des bandeaux (message affiché en haut du site pour une occasion)
-- ------------------------------------------------------------
create table if not exists public.banners (
  id bigint generated by default as identity primary key,
  name text not null,
  message text not null,
  code text,
  button_label text not null default '',
  button_target text not null default 'collections',
  button_url text,
  mode text not null default 'dates',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_days integer,
  priority integer not null default 1,
  countdown boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  constraint banners_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint banners_message_len check (char_length(btrim(message)) between 1 and 240),
  constraint banners_code_format check (code is null or code ~ '^\S{1,40}$'),
  constraint banners_button_label_len check (char_length(button_label) <= 40),
  constraint banners_button_target_valid check (
    button_target in ('collections', 'quiz', 'season:printemps', 'season:ete', 'season:automne', 'season:hiver', 'custom')
  ),
  -- lien personnalisé : adresse du site (« / » ou « /page ») ou adresse https ; jamais « // », « http: » ni « javascript: »
  constraint banners_button_url_valid check (
    button_target <> 'custom'
    or (
      coalesce(button_url ~ '^(/|/[^/\s]\S*|https://[^\s/]\S*)$', false)
      and char_length(button_url) <= 300
    )
  ),
  constraint banners_mode_valid check (mode in ('dates', 'duration')),
  constraint banners_duration_valid check (duration_days is null or duration_days between 1 and 365),
  constraint banners_dates_order check (ends_at > starts_at),
  constraint banners_priority_valid check (priority between 1 and 9)
);

drop trigger if exists banners_stamp on public.banners;
create trigger banners_stamp
  before insert or update on public.banners
  for each row execute function public.zen_stamp_row();

alter table public.banners enable row level security;

-- Lecture : les visiteurs ne voient que les bandeaux ACTIVÉS et EN COURS (horloge de la base) ; un administrateur voit tout
drop policy if exists "banners_select_public" on public.banners;
create policy "banners_select_public"
  on public.banners for select
  using (
    public.is_admin()
    or (enabled = true and starts_at <= now() and ends_at > now())
  );

drop policy if exists "banners_insert_admin" on public.banners;
create policy "banners_insert_admin"
  on public.banners for insert
  with check (public.is_admin());

drop policy if exists "banners_update_admin" on public.banners;
create policy "banners_update_admin"
  on public.banners for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "banners_delete_admin" on public.banners;
create policy "banners_delete_admin"
  on public.banners for delete
  using (public.is_admin());

grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;

-- ------------------------------------------------------------
-- 6. Rattachement des 10 collections connues à leur saison (par « slug »)
--    Les triggers de « products » sont suspendus uniquement pendant cette mise à jour, pour ne pas
--    écraser les dates « Modifiée le … » de vos collections. Les autres collections ne sont pas touchées.
-- ------------------------------------------------------------
alter table public.products disable trigger user;

update public.products p
set family_id = f.id
from public.families f
where p.family_id is null
  and f.key = case p.slug
    when 'citron' then 'printemps'
    when 'verte' then 'printemps'
    when 'rose-bonbon' then 'printemps'
    when 'bleue' then 'ete'
    when 'bleu-de-mer' then 'ete'
    when 'rose' then 'ete'
    when 'chocolat' then 'automne'
    when 'bleu-saphir' then 'hiver'
    when 'bleu-violette' then 'hiver'
    when 'violette' then 'hiver'
  end;

alter table public.products enable trigger user;

-- ------------------------------------------------------------
-- 7. Garde-fous : si l'un d'eux échoue, TOUT est annulé
-- ------------------------------------------------------------
do $$
begin
  if (select count(*) from public.products) <> (select count(*) from zen_products_before) then
    raise exception 'Garde-fou : le nombre de collections a changé. Rien n a été appliqué.';
  end if;
  if exists (
    select 1
    from public.products p
    join zen_products_before b on b.id = p.id
    where p.updated_at is distinct from b.updated_at
       or p.updated_by_email is distinct from b.updated_by_email
       or p.created_at is distinct from b.created_at
       or p.family is distinct from b.family
  ) then
    raise exception 'Garde-fou : une collection existante a été modifiée (dates de suivi ou ancienne famille). Rien n a été appliqué.';
  end if;
  if (select count(*) from public.families where is_season and active) <> 4 then
    raise exception 'Garde-fou : les 4 saisons ne sont pas toutes présentes et en ligne. Rien n a été appliqué.';
  end if;
end;
$$;

-- Demande à Supabase de recharger la description de la base (nouvelles tables et colonnes)
notify pgrst, 'reload schema';

commit;

-- ============================================================
-- ÉTAPE SUIVANTE : lancez supabase_themes_step2_checks.sql et envoyez-moi le résultat.
-- Remarque : les collections créées avant cette étape sous d'AUTRES noms que les 10 connues
-- n'ont pas de famille (family_id vide) : le fichier de contrôle les liste.
-- ============================================================
