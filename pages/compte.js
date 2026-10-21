// ZENORIA_ACCOUNT_STEP11_V1 · ZENORIA_ACCOUNT_STEP12_V1
import React, { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { Home, Package, Star, Heart, UserCog, ShieldCheck, LogOut } from "lucide-react";
import { supabase, getMediaUrl, SITE_MEDIA_TABLE, SITE_SLOT_ACCOUNT_HERO } from "@/lib/supabase";
import { fetchReviewsSetting, DEFAULT_REVIEWS } from "@/lib/reviewsSettings";

// ============================================================
// PAGE « MON COMPTE » — /compte (espace cliente)
//
// Page affichée côté navigateur (la session Supabase vit dans le navigateur), non indexée.
// Non connectée ou session expirée : retour à l'accueil avec la fenêtre de connexion ouverte
// (/?connexion=compte), puis retour automatique ici après la connexion (pages/index.js).
// Rubriques accessibles par adresse directe : /compte#accueil, #commandes, #avis, #favoris, #profil, #donnees.
// « Mes avis » : visible si l'interrupteur des avis est sur ON, ou pour l'administration.
// Bandeau (étape 1.2) : image de l'emplacement « account_hero » (Admin › Contenu du site), sinon image par
// défaut public/images/compte-fondu-lumineux.jpg. Voile ivoire à gauche (ordinateur) ou en bas (mobile).
// Le contenu des rubriques arrive aux étapes suivantes (1.3 à 1.6 de la feuille de route).
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
const DEFAULT_HERO = "/images/compte-fondu-lumineux.jpg";

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
  const [heroUrl, setHeroUrl] = useState(DEFAULT_HERO);

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
      const [adm, cfg, hero] = await Promise.all([
        supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle(),
        fetchReviewsSetting(supabase),
        supabase.from(SITE_MEDIA_TABLE).select("path").eq("slot", SITE_SLOT_ACCOUNT_HERO).maybeSingle(),
      ]);
      if (!alive) return;
      setIsAdmin(Boolean(adm && !adm.error && adm.data));
      setReviewsCfg(cfg);
      if (hero && !hero.error && hero.data && hero.data.path) setHeroUrl(getMediaUrl(hero.data.path, "site"));
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
          {/* BANDEAU D'ACCUEIL (ZENORIA_ACCOUNT_HERO_B_V1) — rendu validé « Proposition B · Ivoire champagne ».
              Photo entière calée à droite ; zone du bijou intacte ; fondu progressif vers la gauche ;
              fond champagne + halo chaud ; voile limité à la zone du texte.
              Image modifiable dans Admin › Contenu du site (emplacement account_hero) :
              cadrer le bijou dans la moitié droite de l'image pour conserver cet effet. */}
          <section
            data-testid="account-hero"
            className="relative rounded-[1.5rem] overflow-hidden h-[220px] sm:h-[240px] flex items-center mb-6 border border-[#efe2d6]"
            style={{
              background: [
                "radial-gradient(ellipse 34% 75% at 17% 45%, rgba(255,244,232,.85) 0%, rgba(255,244,232,0) 100%)",
                "linear-gradient(100deg, #fcf7f0 0%, #f9f0e5 35%, #f6eae0 60%, #f4e7de 100%)",
              ].join(","),
            }}
          >
            {/* Photo : toute la hauteur, calée à droite (décalée sur mobile) ;
                masque : transparent au bord gauche, opaque avant la zone du bijou (environ 42 % de la largeur de l'image) */}
            <img
              src={heroUrl}
              alt=""
              aria-hidden="true"
              draggable="false"
              onError={() => setHeroUrl(DEFAULT_HERO)}
              className="absolute inset-y-0 right-[-26%] sm:right-0 h-full w-auto max-w-none select-none pointer-events-none"
              style={{
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.12) 10%, rgba(0,0,0,.4) 20%, rgba(0,0,0,.75) 31%, #000 42%)",
                maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,.12) 10%, rgba(0,0,0,.4) 20%, rgba(0,0,0,.75) 31%, #000 42%)",
              }}
            />
            {/* Voile champagne limité à la zone du texte (ne touche pas le bijou) */}
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden sm:block"
              style={{ background: "linear-gradient(90deg, rgba(252,247,240,.6) 0%, rgba(250,243,234,.5) 22%, rgba(249,240,229,.18) 38%, rgba(249,240,229,0) 48%)" }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 sm:hidden"
              style={{ background: "linear-gradient(90deg, rgba(252,247,240,.75) 0%, rgba(250,243,234,.55) 34%, rgba(249,240,229,.15) 50%, rgba(249,240,229,0) 58%)" }}
            />

            <div className="relative pl-5 pr-3 sm:px-14 max-w-[56%] sm:max-w-md">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[.28em] text-[#b48a5a]">Mon compte</p>
              <h1 className="font-serif text-3xl sm:text-5xl text-[#4a3743] mt-1.5 leading-tight">Bonjour</h1>
              <span aria-hidden="true" className="block h-px w-12 sm:w-14 mt-2.5 mb-2" style={{ background: "linear-gradient(90deg, #c9a679, rgba(201,166,121,0))" }} />
              <p className="text-[11px] sm:text-sm text-[#705e68] truncate" title={user.email}>{user.email}</p>
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
