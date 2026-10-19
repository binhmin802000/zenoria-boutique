// ZENORIA_FAVORITES_V1
import { supabase } from "@/lib/supabase";

// ============================================================
// Favoris : logique de stockage local (mode invité) et Supabase
// (cliente connectée), avec fusion additive à la connexion.
//
// Le site (pages/index.js) reste responsable d'orchestrer ces
// fonctions selon l'état de connexion ; ce fichier ne gère aucun
// état React, uniquement la lecture/écriture des données.
// ============================================================

export const FAVORITES_STORAGE_KEY = "zenoria_favorites";
export const FAVORITES_TABLE = "customer_favorites";

// --- Mode invité (localStorage) ---

export function readLocalFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" || typeof id === "number") : [];
  } catch {
    return [];
  }
}

export function writeLocalFavorites(ids) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // stockage indisponible (navigation privée, quota dépassé...) : on ignore silencieusement
  }
}

// Ajoute ou retire un produit des favoris locaux ; renvoie la nouvelle liste
export function toggleLocalFavorite(productId) {
  const current = readLocalFavorites();
  const exists = current.includes(productId);
  const next = exists ? current.filter((id) => id !== productId) : [...current, productId];
  writeLocalFavorites(next);
  return next;
}

export function clearLocalFavorites() {
  writeLocalFavorites([]);
}

// --- Cliente connectée (Supabase) ---

export async function fetchFavoriteIds(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from(FAVORITES_TABLE)
    .select("product_id")
    .eq("user_id", userId);
  if (error) {
    console.error("fetchFavoriteIds", error);
    return [];
  }
  return (data || []).map((row) => row.product_id);
}

export async function addFavorite(userId, productId) {
  const { error } = await supabase
    .from(FAVORITES_TABLE)
    .upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id" });
  if (error) console.error("addFavorite", error);
  return !error;
}

export async function removeFavorite(userId, productId) {
  const { error } = await supabase
    .from(FAVORITES_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) console.error("removeFavorite", error);
  return !error;
}

// Fusion additive : au moment de la connexion, les favoris stockés
// localement (mode invité) sont ajoutés à ceux déjà enregistrés pour
// cette cliente, sans écraser ni dupliquer (contrainte unique en base).
// Le stockage local est vidé une fois la fusion faite. Renvoie la liste
// finale des identifiants favoris, à utiliser pour mettre à jour l'état React.
export async function mergeLocalFavoritesIntoAccount(userId) {
  const localIds = readLocalFavorites();
  if (localIds.length === 0) {
    return fetchFavoriteIds(userId);
  }
  const rows = localIds.map((productId) => ({ user_id: userId, product_id: productId }));
  const { error } = await supabase
    .from(FAVORITES_TABLE)
    .upsert(rows, { onConflict: "user_id,product_id" });
  if (error) console.error("mergeLocalFavoritesIntoAccount", error);
  clearLocalFavorites();
  return fetchFavoriteIds(userId);
}
