-- Retour arriere du lot 5a : supprime la fonction (aucune donnee n'est touchee)
drop function if exists public.admin_cancel_transfer_order(bigint, text, text);
