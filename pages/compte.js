// ZENORIA_ACCOUNT_STEP11_V1
import React, { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchReviewsSetting, DEFAULT_REVIEWS } from "@/lib/reviewsSettings";

// ============================================================
// PAGE « MON COMPTE » — /compte (espace cliente) · étape 1.1 : structure et navigation
//
// Page affichée côté navigateur (la session Supabase vit dans le navigateur), non indexée.
// Non connectée ou session expirée : retour à l'accueil avec la fenêtre de connexion ouverte
// (/?connexion=compte), puis retour automatique ici après la connexion (pages/index.js).
// Rubriques accessibles par adresse directe : /compte#accueil, #commandes, #avis, #favoris, #profil, #donnees.
// « Mes avis » : visible si l'interrupteur des avis est sur ON, ou pour l'administration.
// Le contenu des rubriques arrive aux étapes suivantes (1.2 à 1.6 de la feuille de route).
// ============================================================

const SECTIONS = [
  { id: "accueil", label: "Accueil", icon: Home, step: "1.3" },
  { id: "commandes", label: "Mes commandes", icon: Package, step: "1.3" },
  { id: "avis", label: "Mes avis", icon: Star, step: "1.4", reviews: true },
  { id: "favoris", label: "Mes favoris", icon: Heart, step: "1.4" },
  { id: "profil", label: "Profil & sécurité", icon: UserCog, step: "1.6" },
  { id: "donnees", label: "Mes données", icon: ShieldCheck, step: "1.6" },
];
const RETURN_KEY = "zenoria_return_to";

function readHash() {
  if (typeof window === "undefined") return "accueil";
  const h = window.location.hash.replace("#", "");
  return SECTIONS.some((s) => s.id === h) ? h : "accueil";
}

export default function Compte() {
  const [user, setUser] = useState(undefined); // undefined : vérification en cours ; null : non connectée
  const [isAdmin, setIsAdmin] = useState(false);
  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS);
  const [section, setSection] = useState("accueil");

  const goLogin = useCallback(() => {
    try {
      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ to: "/compte" + window.location.hash, at: Date.now() }));
    } catch (e) {
      // stockage indisponible : la cliente reviendra simplement à l'accueil
    }
    window.location.replace("/?connexion=compte");
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data && data.session ? data.session.user : null;
      if (!alive) return;
      if (!u) {
        setUser(null);
        goLogin();
        return;
      }
      setUser(u);
      const [adm, cfg] = await Promise.all([
        supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle(),
        fetchReviewsSetting(supabase),
      ]);
      if (!alive) return;
      setIsAdmin(Boolean(adm && !adm.error && adm.data));
      setReviewsCfg(cfg);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        window.location.replace("/");
      }
    });
    return () => {
      alive = false;
      if (listener && listener.subscription) listener.subscription.unsubscribe();
    };
  }, [goLogin]);

  useEffect(() => {
    const sync = () => setSection(readHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const showReviews = Boolean(reviewsCfg.enabled || isAdmin);
  const visible = SECTIONS.filter((s) => !s.reviews || showReviews);
  const current = visible.find((s) => s.id === section) || visible[0];

  const go = (id) => {
    window.history.replaceState(null, "", "#" + id);
    setSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.replace("/");
  };

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Mon compte — Zenoria</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>

      {!user ? (
        <main className="max-w-6xl mx-auto px-6 py-24 text-center text-sm text-[#8b737e]" data-testid="account-loading">
          {user === null ? "Redirection vers la connexion…" : "Chargement de votre espace…"}
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8" data-testid="account-page">
          {/* BANDEAU D'ACCUEIL (image modifiable à l'étape 1.2) */}
          <section
            data-testid="account-hero"
            className="relative rounded-[1.5rem] overflow-hidden min-h-[170px] sm:min-h-[190px] flex items-end sm:items-center mb-6"
            style={{ background: "linear-gradient(120deg,#fbf3ef 0%,#f6e4e6 55%,#efd9df 100%)" }}
          >
            <div className="relative px-6 sm:px-8 py-6 max-w-md">
              <p className="text-[11px] uppercase tracking-[.25em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-4xl text-[#412f3b] mt-1">Bonjour</h1>
              <p className="text-xs text-[#8b737e] mt-1 truncate">{user.email}</p>
            </div>
          </section>

          <div className="grid lg:grid-cols-[230px_1fr] gap-6">
            {/* MENU : à gauche sur ordinateur, onglets défilants sur mobile */}
            <nav aria-label="Rubriques de mon compte" className="lg:self-start lg:sticky lg:top-4">
              <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible rounded-full lg:rounded-2xl bg-white border border-[#eadfe4] p-1.5 lg:p-2.5">
                {visible.map((s) => {
                  const Icon = s.icon;
                  const on = current && current.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(s.id)}
                      aria-current={on ? "page" : undefined}
                      data-testid={`account-nav-${s.id}`}
                      className={`shrink-0 flex items-center gap-2 whitespace-nowrap rounded-full lg:rounded-xl px-3.5 py-2 text-sm text-left ${on ? "bg-[#f5edf1] text-[#412f3b] font-medium" : "text-[#54434c] hover:bg-[#fbf7f9]"}`}
                    >
                      <Icon size={16} className="text-[#8f6075]" /> {s.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={logout}
                  data-testid="account-logout"
                  className="hidden lg:flex items-center gap-2 rounded-xl px-3.5 py-2 mt-1 text-sm text-[#8b737e] border-t border-[#eadfe4] hover:bg-[#fbf7f9]"
                >
                  <LogOut size={16} /> Se déconnecter
                </button>
              </div>
            </nav>

            {/* CONTENU DE LA RUBRIQUE */}
            <section data-testid={`account-section-${current ? current.id : "accueil"}`} className="rounded-2xl bg-white border border-[#eadfe4] p-6 min-h-[260px]">
              <h2 className="font-serif text-2xl text-[#412f3b]">{current ? current.label : "Accueil"}</h2>
              <p className="text-sm text-[#8b737e] mt-2">
                Cette rubrique sera bientôt disponible.
                {isAdmin && current && <span className="block text-[11px] mt-1">(Admin : contenu prévu à l&apos;étape {current.step} de la feuille de route.)</span>}
              </p>
              <button
                type="button"
                onClick={logout}
                className="lg:hidden mt-8 inline-flex items-center gap-2 text-sm text-[#8b737e] underline"
              >
                <LogOut size={15} /> Se déconnecter
              </button>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
