import React, { useEffect, useState } from "react";
import Head from "next/head";
import { Plus, Pencil, Trash2, X, LogOut, Tag, Package, ArrowLeft, Upload, Film, Users } from "lucide-react";
import { supabase, getMediaUrl, uploadProductMedia, deleteProductMedia } from "@/lib/supabase";
import AuthModal from "@/components/AuthModal";
import AdminConnections from "@/components/AdminConnections";

// ============================================================
// PAGE D'ADMINISTRATION — /admin
//
// Accès réservé : il faut être connecté ET figurer dans la table
// "admin_users" de Supabase (voir supabase_admin_schema.sql).
// Toutes les lectures/écritures passent par les politiques de
// sécurité (RLS) définies côté base de données.
//
// Les photos et vidéos sont envoyées directement depuis cette page
// vers Supabase Storage (voir supabase_storage_setup.sql) : plus
// besoin de déposer des fichiers dans le code du site.
//
// L'onglet « Connexions » lit les comptes et le journal des connexions
// via deux fonctions SQL réservées aux administrateurs
// (voir supabase_admin_connections.sql).
// ============================================================

const MAX_FILE_MB = 95; // marge sous la limite de 100 Mo du bucket

const emptyProduct = {
  id: null,
  slug: "",
  name: "",
  family: "Collection Bleus",
  collection: "",
  energy: "",
  price: "",
  promo_price: "",
  stock: 5,
  pitch: "",
  crystals: [],
  photos: [],
  video: "",
  color: "from-rose-300 via-pink-100 to-white",
  stone: "💎",
  active: true,
};

const emptyPromo = {
  code: "",
  type: "percent",
  value: "",
  label: "",
  active: true,
};

const FAMILIES = ["Collection Bleus", "Collection Roses", "Collection Nature", "Collection Violettes"];

// Liste fermée de dégradés de couleur (utilisés comme visuel de secours si une
// photo ne charge pas). On utilise une liste fermée plutôt qu'un champ libre
// car ce sont des classes Tailwind : seules celles écrites explicitement dans
// le code du site peuvent être générées au moment de la mise en ligne.
const GRADIENT_OPTIONS = [
  { label: "Bleu océan", value: "from-cyan-200 via-sky-100 to-blue-300" },
  { label: "Bleu saphir", value: "from-blue-700 via-indigo-300 to-slate-100" },
  { label: "Bleu violet", value: "from-indigo-400 via-violet-200 to-sky-100" },
  { label: "Bleu clair", value: "from-sky-300 via-blue-100 to-white" },
  { label: "Chocolat", value: "from-amber-900 via-orange-200 to-stone-100" },
  { label: "Citron", value: "from-yellow-300 via-lime-100 to-white" },
  { label: "Rose tendre", value: "from-rose-300 via-pink-100 to-white" },
  { label: "Rose bonbon", value: "from-pink-400 via-rose-100 to-fuchsia-100" },
  { label: "Vert nature", value: "from-emerald-400 via-green-100 to-lime-100" },
  { label: "Violet profond", value: "from-purple-500 via-violet-200 to-white" },
];

function formatEUR(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default function AdminPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [tab, setTab] = useState("products"); // "products" | "promos" | "connections"

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [promoCodes, setPromoCodes] = useState([]);
  const [promosLoading, setPromosLoading] = useState(true);

  const [productForm, setProductForm] = useState(null);
  const [promoForm, setPromoForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  // Upload de médias (photos / vidéo)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [mediaError, setMediaError] = useState("");

  // --- Authentification + vérification du rôle admin ---
  useEffect(() => {
    let active = true;

    const checkAdmin = async (currentUser) => {
      if (!currentUser) {
        if (active) {
          setIsAdmin(false);
          setAuthLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      if (active) {
        setIsAdmin(Boolean(data));
        setAuthLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      const currentUser = data.session ? data.session.user : null;
      setUser(currentUser);
      checkAdmin(currentUser);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session ? session.user : null;
      setUser(currentUser);
      setAuthLoading(true);
      checkAdmin(currentUser);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadProducts = async () => {
    setProductsLoading(true);
    const { data, error } = await supabase.from("products").select("*").order("id");
    if (!error && data) setProducts(data);
    setProductsLoading(false);
  };

  const loadPromoCodes = async () => {
    setPromosLoading(true);
    const { data, error } = await supabase.from("promo_codes").select("*").order("code");
    if (!error && data) setPromoCodes(data);
    setPromosLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      loadProducts();
      loadPromoCodes();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- Formulaire produit ---
  const openNewProduct = () => {
    setFormError("");
    setMediaError("");
    setProductForm({ ...emptyProduct });
  };

  const openEditProduct = (p) => {
    setFormError("");
    setMediaError("");
    setProductForm({
      ...p,
      price: p.price ?? "",
      promo_price: p.promo_price ?? "",
      photos: Array.isArray(p.photos) ? p.photos : [],
      crystals: Array.isArray(p.crystals) ? p.crystals : [],
    });
  };

  const closeProductForm = () => setProductForm(null);

  const addCrystalRow = () => {
    setProductForm((f) => ({ ...f, crystals: [...f.crystals, { color: "", count: 1, hex: "#e9dde3" }] }));
  };
  const updateCrystalRow = (idx, field, value) => {
    setProductForm((f) => {
      const crystals = [...f.crystals];
      crystals[idx] = { ...crystals[idx], [field]: field === "count" ? Number(value) || 0 : value };
      return { ...f, crystals };
    });
  };
  const removeCrystalRow = (idx) => {
    setProductForm((f) => ({ ...f, crystals: f.crystals.filter((_, i) => i !== idx) }));
  };

  // --- Upload de photos ---
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // permet de resélectionner le même fichier plus tard
    if (!files.length) return;

    if (!productForm.slug.trim()) {
      setMediaError("Renseignez d'abord l'identifiant (slug) avant d'ajouter des photos.");
      return;
    }

    setMediaError("");
    setUploadingPhoto(true);
    try {
      const newPaths = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`« ${file.name} » n'est pas une image.`);
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`« ${file.name} » dépasse ${MAX_FILE_MB} Mo.`);
        }
        const path = await uploadProductMedia(file, productForm.slug.trim());
        newPaths.push(path);
      }
      setProductForm((f) => ({ ...f, photos: [...f.photos, ...newPaths] }));
    } catch (err) {
      setMediaError("Échec de l'envoi : " + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (idx) => {
    const path = productForm.photos[idx];
    setProductForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== idx) }));
    deleteProductMedia(path);
  };

  // --- Upload de vidéo ---
  const handleVideoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (!productForm.slug.trim()) {
      setMediaError("Renseignez d'abord l'identifiant (slug) avant d'ajouter une vidéo.");
      return;
    }
    if (!file.type.startsWith("video/")) {
      setMediaError(`« ${file.name} » n'est pas une vidéo.`);
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setMediaError(`La vidéo dépasse ${MAX_FILE_MB} Mo.`);
      return;
    }

    setMediaError("");
    setUploadingVideo(true);
    try {
      const path = await uploadProductMedia(file, productForm.slug.trim());
      setProductForm((f) => ({ ...f, video: path }));
    } catch (err) {
      setMediaError("Échec de l'envoi : " + err.message);
    } finally {
      setUploadingVideo(false);
    }
  };

  const removeVideo = () => {
    const path = productForm.video;
    setProductForm((f) => ({ ...f, video: "" }));
    deleteProductMedia(path);
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!productForm.slug.trim() || !productForm.name.trim() || !productForm.price) {
      setFormError("Le nom, l'identifiant (slug) et le prix sont obligatoires.");
      return;
    }

    const payload = {
      slug: productForm.slug.trim(),
      name: productForm.name.trim(),
      family: productForm.family,
      collection: productForm.collection.trim(),
      energy: productForm.energy.trim(),
      price: Number(productForm.price),
      promo_price: productForm.promo_price === "" ? null : Number(productForm.promo_price),
      stock: Number(productForm.stock) || 0,
      pitch: productForm.pitch,
      crystals: productForm.crystals.filter((c) => c.color && c.count > 0),
      photos: productForm.photos,
      video: productForm.video || null,
      color: productForm.color,
      stone: productForm.stone,
      active: productForm.active,
    };

    setSaving(true);
    const result = productForm.id
      ? await supabase.from("products").update(payload).eq("id", productForm.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);

    if (result.error) {
      setFormError(
        result.error.message.includes("duplicate")
          ? "Cet identifiant (slug) est déjà utilisé par une autre collection."
          : "Erreur lors de l'enregistrement : " + result.error.message
      );
      return;
    }

    setToast(productForm.id ? "Collection mise à jour." : "Collection créée.");
    setProductForm(null);
    loadProducts();
  };

  const deleteProduct = async (p) => {
    if (!window.confirm(`Supprimer définitivement « ${p.name} » ? Cette action est irréversible.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (!error) {
      setToast("Collection supprimée.");
      loadProducts();
    }
  };

  const toggleActive = async (p) => {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    loadProducts();
  };

  // --- Formulaire code promo ---
  const openNewPromo = () => {
    setFormError("");
    setPromoForm({ ...emptyPromo });
  };
  const openEditPromo = (p) => {
    setFormError("");
    setPromoForm({ ...p });
  };
  const closePromoForm = () => setPromoForm(null);

  const savePromo = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!promoForm.code.trim() || !promoForm.label.trim()) {
      setFormError("Le code et le libellé sont obligatoires.");
      return;
    }

    const payload = {
      code: promoForm.code.trim().toUpperCase(),
      type: promoForm.type,
      value: Number(promoForm.value) || 0,
      label: promoForm.label.trim(),
      active: promoForm.active,
    };

    setSaving(true);
    const isRename = promoForm.originalCode && promoForm.originalCode !== payload.code;
    let result;
    if (isRename) {
      await supabase.from("promo_codes").delete().eq("code", promoForm.originalCode);
      result = await supabase.from("promo_codes").insert(payload);
    } else if (promoForm.originalCode) {
      result = await supabase.from("promo_codes").update(payload).eq("code", payload.code);
    } else {
      result = await supabase.from("promo_codes").insert(payload);
    }
    setSaving(false);

    if (result.error) {
      setFormError(
        result.error.message.includes("duplicate")
          ? "Ce code promo existe déjà."
          : "Erreur lors de l'enregistrement : " + result.error.message
      );
      return;
    }

    setToast(promoForm.originalCode ? "Code promo mis à jour." : "Code promo créé.");
    setPromoForm(null);
    loadPromoCodes();
  };

  const deletePromo = async (p) => {
    if (!window.confirm(`Supprimer le code « ${p.code} » ?`)) return;
    const { error } = await supabase.from("promo_codes").delete().eq("code", p.code);
    if (!error) {
      setToast("Code promo supprimé.");
      loadPromoCodes();
    }
  };

  // ============================================================
  // RENDU
  // ============================================================

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fbf8f4] text-[#342b32]">
        <p className="text-sm text-[#8b737e]">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fbf8f4] text-[#342b32] p-6">
        <Head><title>Administration — Zenoria</title></Head>
        <div className="text-center max-w-sm">
          <div className="font-serif text-3xl mb-3">Administration Zenoria</div>
          <p className="text-sm text-[#70656a] mb-6">Connectez-vous avec votre compte administrateur pour accéder au back-office.</p>
          <button
            onClick={() => setAuthModalOpen(true)}
            className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm"
          >
            Se connecter
          </button>
          <div className="mt-6">
            <a href="/" className="text-xs text-[#8b737e] underline">Retour au site</a>
          </div>
        </div>
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#fbf8f4] text-[#342b32] p-6">
        <Head><title>Administration — Zenoria</title></Head>
        <div className="text-center max-w-sm">
          <div className="font-serif text-3xl mb-3">Accès réservé</div>
          <p className="text-sm text-[#70656a] mb-2">Vous êtes connecté(e) en tant que <strong>{user.email}</strong>,</p>
          <p className="text-sm text-[#70656a] mb-6">mais ce compte n&apos;a pas les droits d&apos;administration sur Zenoria.</p>
          <button onClick={handleLogout} className="text-sm text-[#8f6075] underline">Se déconnecter</button>
          <div className="mt-4">
            <a href="/" className="text-xs text-[#8b737e] underline">Retour au site</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head><title>Administration — Zenoria</title></Head>

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#eadfe4]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label="Retour au site">
              <ArrowLeft size={18} />
            </a>
            <div className="font-serif text-xl">Administration Zenoria</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#8b737e] hidden sm:inline">{user.email}</span>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-[#8f6075] hover:text-[#71485b]">
              <LogOut size={15} /> Se déconnecter
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 flex gap-1 pb-3 overflow-x-auto">
          <button
            onClick={() => setTab("products")}
            className={`flex items-center gap-1.5 rounded-full px-4 h-9 text-sm transition whitespace-nowrap ${tab === "products" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#54434c]"}`}
          >
            <Package size={15} /> Collections
          </button>
          <button
            onClick={() => setTab("promos")}
            className={`flex items-center gap-1.5 rounded-full px-4 h-9 text-sm transition whitespace-nowrap ${tab === "promos" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#54434c]"}`}
          >
            <Tag size={15} /> Codes promo
          </button>
          <button
            onClick={() => setTab("connections")}
            className={`flex items-center gap-1.5 rounded-full px-4 h-9 text-sm transition whitespace-nowrap ${tab === "connections" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#54434c]"}`}
          >
            <Users size={15} /> Connexions
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {toast && (
          <div className="mb-5 rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm">{toast}</div>
        )}

        {tab === "products" && (
          <>
            <div className="flex justify-between items-center mb-5">
              <div>
                <h1 className="font-serif text-2xl">Collections</h1>
                <p className="text-sm text-[#8b737e]">{products.length} collection{products.length > 1 ? "s" : ""} au catalogue</p>
              </div>
              <button
                onClick={openNewProduct}
                className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm"
              >
                <Plus size={16} /> Nouvelle collection
              </button>
            </div>

            {productsLoading ? (
              <p className="text-sm text-[#8b737e]">Chargement des collections...</p>
            ) : (
              <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                      <th className="px-4 py-3 font-medium">Collection</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Famille</th>
                      <th className="px-4 py-3 font-medium">Prix</th>
                      <th className="px-4 py-3 font-medium">Stock</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-t border-[#eee2e5]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-[#f5edf1]">
                              {p.photos && p.photos[0] ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={getMediaUrl(p.photos[0], p.slug)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full grid place-items-center text-sm">{p.stone}</div>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-[#8b737e]">{p.collection}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-[#54434c]">{p.family.replace("Collection ", "")}</td>
                        <td className="px-4 py-3">
                          {p.promo_price ? (
                            <>
                              <span className="line-through text-[#b0a3a9] mr-1.5">{formatEUR(p.price)}</span>
                              <span className="text-emerald-700 font-medium">{formatEUR(p.promo_price)}</span>
                            </>
                          ) : (
                            formatEUR(p.price)
                          )}
                        </td>
                        <td className="px-4 py-3">{p.stock}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleActive(p)}
                            className={`rounded-full px-3 py-1 text-xs ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-[#f0e6ea] text-[#8b737e]"}`}
                          >
                            {p.active ? "En ligne" : "Masquée"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => openEditProduct(p)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label={`Modifier ${p.name}`}>
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => deleteProduct(p)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea] text-red-600" aria-label={`Supprimer ${p.name}`}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "promos" && (
          <>
            <div className="flex justify-between items-center mb-5">
              <div>
                <h1 className="font-serif text-2xl">Codes promo</h1>
                <p className="text-sm text-[#8b737e]">{promoCodes.length} code{promoCodes.length > 1 ? "s" : ""} configuré{promoCodes.length > 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={openNewPromo}
                className="flex items-center gap-1.5 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm"
              >
                <Plus size={16} /> Nouveau code
              </button>
            </div>

            {promosLoading ? (
              <p className="text-sm text-[#8b737e]">Chargement des codes promo...</p>
            ) : (
              <div className="bg-white rounded-2xl border border-[#eee2e5] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f5edf1] text-left text-[#8b737e]">
                      <th className="px-4 py-3 font-medium">Code</th>
                      <th className="px-4 py-3 font-medium">Avantage</th>
                      <th className="px-4 py-3 font-medium">Statut</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoCodes.map((p) => (
                      <tr key={p.code} className="border-t border-[#eee2e5]">
                        <td className="px-4 py-3 font-medium">{p.code}</td>
                        <td className="px-4 py-3 text-[#54434c]">{p.label}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-[#f0e6ea] text-[#8b737e]"}`}>
                            {p.active ? "Actif" : "Inactif"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => openEditPromo({ ...p, originalCode: p.code })} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea]" aria-label={`Modifier ${p.code}`}>
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => deletePromo(p)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-[#f0e6ea] text-red-600" aria-label={`Supprimer ${p.code}`}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "connections" && <AdminConnections />}
      </main>

      {/* FORMULAIRE PRODUIT */}
      {productForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeProductForm} />
          <div className="fixed z-40 inset-x-4 top-[4%] max-w-2xl mx-auto bg-white rounded-[2rem] shadow-2xl max-h-[92vh] overflow-y-auto">
            <form onSubmit={saveProduct} className="p-7">
              <div className="flex justify-between items-start mb-5">
                <h2 className="font-serif text-2xl">{productForm.id ? "Modifier la collection" : "Nouvelle collection"}</h2>
                <button type="button" onClick={closeProductForm} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]"><X size={18} /></button>
              </div>

              {formError && <div className="mb-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3">{formError}</div>}

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Nom de la collection</span>
                  <input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Identifiant technique (slug)</span>
                  <input required value={productForm.slug} onChange={(e) => setProductForm({ ...productForm, slug: e.target.value })}
                    placeholder="ex. bleu-de-mer"
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>

                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Famille</span>
                  <select value={productForm.family} onChange={(e) => setProductForm({ ...productForm, family: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white">
                    {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Intention (ex. Sérénité, Amour...)</span>
                  <input required value={productForm.collection} onChange={(e) => setProductForm({ ...productForm, collection: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="text-xs text-[#8b737e]">Phrase d&apos;énergie (sous-titre affiché sur la fiche)</span>
                  <input value={productForm.energy} onChange={(e) => setProductForm({ ...productForm, energy: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>

                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Prix (€)</span>
                  <input required type="number" min="0" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>
                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Prix promotionnel (€, optionnel)</span>
                  <input type="number" min="0" step="0.01" value={productForm.promo_price} onChange={(e) => setProductForm({ ...productForm, promo_price: e.target.value })}
                    placeholder="laisser vide si aucune promotion"
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>

                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Stock disponible</span>
                  <input type="number" min="0" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>
                <label className="text-sm flex items-end">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={productForm.active} onChange={(e) => setProductForm({ ...productForm, active: e.target.checked })} className="h-4 w-4" />
                    <span>Visible sur le site</span>
                  </span>
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="text-xs text-[#8b737e]">Phrases de présentation (descriptif de vente)</span>
                  <textarea rows={3} value={productForm.pitch} onChange={(e) => setProductForm({ ...productForm, pitch: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 py-2 outline-none focus:border-[#8f6075]" />
                </label>

                {/* PHOTOS — upload direct */}
                <div className="sm:col-span-2">
                  <span className="text-xs text-[#8b737e]">Photos</span>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {productForm.photos.map((path, idx) => (
                      <div key={path + idx} className="relative h-20 w-20 rounded-xl overflow-hidden bg-[#f5edf1] border border-[#eadfe4]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getMediaUrl(path, productForm.slug)} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80"
                          aria-label="Retirer cette photo"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <label
                      className={`h-20 w-20 rounded-xl border-2 border-dashed grid place-items-center text-center text-[11px] leading-tight px-1 ${
                        !productForm.slug.trim() || uploadingPhoto
                          ? "border-[#eadfe4] text-[#c9bcc3] cursor-not-allowed"
                          : "border-[#d9c5cc] text-[#8f6075] cursor-pointer hover:bg-[#f5edf1]"
                      }`}
                    >
                      {uploadingPhoto ? (
                        "Envoi..."
                      ) : (
                        <span className="flex flex-col items-center gap-1">
                          <Upload size={16} /> Ajouter
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={!productForm.slug.trim() || uploadingPhoto}
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {!productForm.slug.trim() && (
                    <p className="text-[11px] text-amber-700 mt-1.5">Renseignez d&apos;abord l&apos;identifiant (slug) ci-dessus avant d&apos;ajouter des photos.</p>
                  )}
                </div>

                {/* VIDÉO — upload direct */}
                <div className="sm:col-span-2">
                  <span className="text-xs text-[#8b737e]">Vidéo (optionnelle)</span>
                  <div className="mt-2">
                    {productForm.video ? (
                      <div className="relative inline-block">
                        <video src={getMediaUrl(productForm.video, productForm.slug)} className="h-28 rounded-xl bg-black" controls muted />
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white grid place-items-center hover:bg-black/80"
                          aria-label="Retirer la vidéo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label
                        className={`inline-flex items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm ${
                          !productForm.slug.trim() || uploadingVideo
                            ? "border-[#eadfe4] text-[#c9bcc3] cursor-not-allowed"
                            : "border-[#d9c5cc] text-[#8f6075] cursor-pointer hover:bg-[#f5edf1]"
                        }`}
                      >
                        <Film size={16} />
                        {uploadingVideo ? "Envoi en cours..." : "Ajouter une vidéo"}
                        <input
                          type="file"
                          accept="video/*"
                          disabled={!productForm.slug.trim() || uploadingVideo}
                          onChange={handleVideoUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8b737e] mt-1.5">Formats acceptés : MP4, MOV, WebM. Taille maximale : {MAX_FILE_MB} Mo.</p>
                </div>

                {mediaError && (
                  <div className="sm:col-span-2 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3">{mediaError}</div>
                )}

                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Couleur du visuel de secours</span>
                  <select value={productForm.color} onChange={(e) => setProductForm({ ...productForm, color: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white">
                    {GRADIENT_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                  <span className="text-[11px] text-[#8b737e]">Affiché uniquement si les photos ne chargent pas.</span>
                </label>
                <label className="text-sm">
                  <span className="text-xs text-[#8b737e]">Symbole (emoji)</span>
                  <input value={productForm.stone} onChange={(e) => setProductForm({ ...productForm, stone: e.target.value })}
                    placeholder="💎"
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#8b737e]">Composition en cristaux</span>
                    <button type="button" onClick={addCrystalRow} className="text-xs text-[#8f6075] underline">+ Ajouter une couleur</button>
                  </div>
                  {productForm.crystals.length === 0 && (
                    <p className="text-xs text-[#8b737e] italic">Aucune composition renseignée pour le moment.</p>
                  )}
                  <div className="space-y-2">
                    {productForm.crystals.map((c, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input value={c.color} onChange={(e) => updateCrystalRow(idx, "color", e.target.value)} placeholder="Couleur (ex. Bleu océan)"
                          className="flex-1 min-w-0 rounded-lg border border-[#eadfe4] px-2.5 h-9 text-sm outline-none focus:border-[#8f6075]" />
                        <input type="number" min="0" value={c.count} onChange={(e) => updateCrystalRow(idx, "count", e.target.value)} placeholder="Nb"
                          className="w-16 rounded-lg border border-[#eadfe4] px-2 h-9 text-sm outline-none focus:border-[#8f6075]" />
                        <input type="color" value={c.hex || "#e9dde3"} onChange={(e) => updateCrystalRow(idx, "hex", e.target.value)}
                          className="h-9 w-9 rounded-lg border border-[#eadfe4]" />
                        <button type="button" onClick={() => removeCrystalRow(idx)} className="h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-[#f0e6ea] text-[#9a7384]">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={saving || uploadingPhoto || uploadingVideo} className="flex-1 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm font-medium disabled:opacity-60">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button type="button" onClick={closeProductForm} className="rounded-full border border-[#d9c5cc] px-6 h-11 text-sm">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* FORMULAIRE CODE PROMO */}
      {promoForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closePromoForm} />
          <div className="fixed z-40 inset-x-4 top-[10%] max-w-md mx-auto bg-white rounded-[2rem] shadow-2xl">
            <form onSubmit={savePromo} className="p-7">
              <div className="flex justify-between items-start mb-5">
                <h2 className="font-serif text-2xl">{promoForm.originalCode ? "Modifier le code" : "Nouveau code promo"}</h2>
                <button type="button" onClick={closePromoForm} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#f0e6ea]"><X size={18} /></button>
              </div>

              {formError && <div className="mb-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3">{formError}</div>}

              <div className="space-y-4">
                <label className="text-sm block">
                  <span className="text-xs text-[#8b737e]">Code (tel que la cliente le saisit)</span>
                  <input required value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] uppercase" />
                </label>
                <label className="text-sm block">
                  <span className="text-xs text-[#8b737e]">Type d&apos;avantage</span>
                  <select value={promoForm.type} onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075] bg-white">
                    <option value="percent">Pourcentage de remise</option>
                    <option value="fixed">Montant fixe en euros</option>
                    <option value="shipping">Livraison offerte</option>
                  </select>
                </label>
                {promoForm.type !== "shipping" && (
                  <label className="text-sm block">
                    <span className="text-xs text-[#8b737e]">{promoForm.type === "percent" ? "Pourcentage (ex. 10)" : "Montant en euros (ex. 5)"}</span>
                    <input required type="number" min="0" step="0.01" value={promoForm.value} onChange={(e) => setPromoForm({ ...promoForm, value: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                  </label>
                )}
                <label className="text-sm block">
                  <span className="text-xs text-[#8b737e]">Libellé affiché dans le panier</span>
                  <input required value={promoForm.label} onChange={(e) => setPromoForm({ ...promoForm, label: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#eadfe4] px-3 h-10 outline-none focus:border-[#8f6075]" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={promoForm.active} onChange={(e) => setPromoForm({ ...promoForm, active: e.target.checked })} className="h-4 w-4" />
                  <span>Code actif</span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={saving} className="flex-1 rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white h-11 text-sm font-medium">
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button type="button" onClick={closePromoForm} className="rounded-full border border-[#d9c5cc] px-6 h-11 text-sm">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
