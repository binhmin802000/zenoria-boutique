-- ============================================================
-- ZENORIA : retire tous les textes modifiés depuis l'administration (carte « Textes du site »)
-- Le site retrouve ses textes d'origine (ceux de lib/siteTexts.js). Rien d'autre n'est touché : la règle de lecture et
-- la contrainte restent en place (elles servent aussi aux autres réglages).
-- ============================================================

delete from public.site_settings where key = 'site_texts';
