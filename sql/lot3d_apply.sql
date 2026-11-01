-- ============================================================
-- LOT 3d (SQL) : retire aux clientes la LECTURE DIRECTE de order_status_history.
-- Raison : depuis le sous-lot 3c-2, Mon compte ne lit plus cette table directement ; il passe par
-- la fonction customer_order_events (lot 3a, SECURITY DEFINER), qui filtre deja les notes non visibles
-- et ne renvoie jamais l'adresse e-mail de l'auteur. Tant que la regle de lecture directe restait ouverte,
-- une cliente connectee pouvait en theorie lire TOUTES les lignes de SES commandes (notes internes et
-- adresse e-mail de l'administratrice compris) en interrogeant directement l'API, meme si aucun ecran
-- ne l'affichait.
-- Verifie avant d'ecrire ce script (voir conversation) : toutes les ecritures sur order_status_history passent
-- par supabaseAdmin (cote serveur) ou par des fonctions SECURITY DEFINER (admin_*, customer_*, issue_invoice_for_order,
-- list_reviewable_items, submit_review) : aucune n'est affectee par un retrait de lecture cote client.
-- Seul lecteur direct cote client identifie : pages/compte.js (remplace par customer_order_events au lot 3c-2).
-- components/AdminCrm.js lit aussi la table directement, mais avec les droits ADMINISTRATEUR : inchange par ce lot.
--
-- Effet : retire la regle RLS qui autorisait la lecture par la proprietaire de la commande ; garde la regle admin.
-- Aucune donnee modifiee. Tout ou rien : ABANDON sans rien faire si la regle attendue est absente ou si le lot
-- est deja applique.
-- Retour arriere : lot3d_rollback.sql
-- ============================================================
do $zen$
declare
  v_def text;
begin
  select pg_get_expr(pol.polqual, pol.polrelid) into v_def
    from pg_policy pol
   where pol.polrelid = 'public.order_status_history'::regclass
     and pol.polname = 'order_status_history_select_own';

  if v_def is null then
    raise exception 'ABANDON : regle order_status_history_select_own introuvable (deja retiree, ou nom different) ; rien n''a ete modifie';
  end if;
  if not exists (
    select 1 from pg_policy pol
     where pol.polrelid = 'public.order_status_history'::regclass and pol.polname = 'order_status_history_admin_write'
  ) then
    raise exception 'ABANDON : regle order_status_history_admin_write introuvable (attendue pour l''administration) ; rien n''a ete modifie';
  end if;

  drop policy order_status_history_select_own on public.order_status_history;
end $zen$;

-- Verification (lecture seule) : attendu = une seule ligne restante, la regle admin (ALL)
select policyname, cmd, qual from pg_policies
 where schemaname = 'public' and tablename = 'order_status_history'
 order by policyname;
