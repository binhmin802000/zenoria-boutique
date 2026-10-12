import React, { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { supabase } from "@/lib/supabase";
import { useSiteStatus } from "@/lib/siteStatus";
import MediaGuard from "@/components/MediaGuard";
import BannerBar from "@/components/BannerBar";
import { QuizHeader, QuizFooter, ShippingStrip } from "@/components/QuizChrome";
import QuizSteps from "@/components/QuizSteps";
import QuizResult from "@/components/QuizResult";
import ProductSheet from "@/components/ProductSheet";
import QuizCartDialog from "@/components/QuizCartDialog";
import { visibleFamilies, buildSeasonCards, gradientFor } from "@/lib/seasons";
import { pickPublicBanner, bannerKey, readClosedKeys, writeClosedKeys, getSessionStorage } from "@/lib/publicBanner";
import { recommend, isValidProfile, SEASON_KEYS, SEASON_NAMES } from "@/lib/colorEngine";
import { SEASON_DEFAULTS } from "@/lib/quizOutfits";
import { QUIZ_STEPS, mapCatalog, seasonNamesFrom, encodeResultHash, encodeCartReturnHash, parseResultHash, addToStoredCart, cartCount as readCartCount } from "@/lib/quizState";

// ============================================================
// PAGE /quiz — le quiz couleurs : un mannequin qui se colore à chaque choix (cheveux, yeux, peau), puis des bagues,
// et des couleurs de vêtements conseillées pour l'occasion.
//
//  - Les bagues viennent de la base (catalogue en ligne, familles et saisons de l'onglet Familles de /admin).
//  - Rien n'est enregistré : le résultat s'écrit après le « # » de l'adresse (jamais envoyé au serveur), ce qui permet
//    de revenir au résultat avec le bouton « retour » du navigateur.
//  - Le panier est celui de la boutique (même clé dans le navigateur).
// ============================================================

// Requête dont l'échec ne doit jamais empêcher la page de s'afficher (table pas encore créée, réseau coupé...)
const optionalQuery = (query) => Promise.resolve(query).then((res) => res, () => ({ data: null, error: true }));

const EMPTY_PROFILE = { hair: null, eye: null, skin: null, metal: null };

function getLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}

export default function QuizPage() {
  // --- état du quiz ---
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [step, setStep] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [occasion, setOccasion] = useState("anniv");
  const [outfitIndex, setOutfitIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [announce, setAnnounce] = useState("");

  // --- catalogue, bandeau, panier ---
  const [catalog, setCatalog] = useState({ loading: true, products: [], collections: [], families: [] });
  const [bannerRows, setBannerRows] = useState([]);
  const [validCodes, setValidCodes] = useState(() => new Set());
  const [closedBanners, setClosedBanners] = useState([]);
  const [nowMs, setNowMs] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [sheet, setSheet] = useState(null); // { product, why } : la fiche ouverte par « Voir la bague », sans quitter le quiz
  const [cartAsk, setCartAsk] = useState(false); // la question « revenir au quiz après le panier ? »
  const siteStatus = useSiteStatus();
  const shopPaused = siteStatus.mode === "shop_pause";
  const previewingMaintenance = siteStatus.mode === "full";

  // Au chargement : résultat éventuel lu dans l'adresse, panier, heure, bandeaux déjà fermés
  useEffect(() => {
    const fromHash = typeof window !== "undefined" ? parseResultHash(window.location.hash) : null;
    if (fromHash) {
      setProfile(fromHash);
      setStep(QUIZ_STEPS.length - 1);
      setShowResult(true);
    }
    setCartCount(readCartCount(getLocalStorage()));
    setNowMs(Date.now());
    setClosedBanners(readClosedKeys(getSessionStorage()));
    setHydrated(true);
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Catalogue, familles, bandeaux et codes promo
  useEffect(() => {
    let active = true;
    (async () => {
      const [prodRes, famRes, banRes, promoRes] = await Promise.all([
        optionalQuery(supabase.from("products").select("*").eq("active", true).order("id")),
        optionalQuery(supabase.from("families").select("*").order("sort_order", { ascending: true })),
        optionalQuery(supabase.from("banners").select("*")),
        optionalQuery(supabase.from("promo_codes").select("code").eq("active", true)),
      ]);
      if (!active) return;
      const families = visibleFamilies(famRes && famRes.data);
      const { products, collections } = mapCatalog(prodRes && Array.isArray(prodRes.data) ? prodRes.data : [], families);
      setCatalog({ loading: false, products, collections, families });
      setBannerRows((banRes && Array.isArray(banRes.data) && banRes.data) || []);
      setValidCodes(new Set(((promoRes && promoRes.data) || []).map((r) => r.code)));
    })();
    return () => {
      active = false;
    };
  }, []);

  // Un administrateur reçoit aussi les bandeaux programmés : on vérifie alors leur début (comme sur l'accueil)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const u = data && data.session ? data.session.user : null;
        if (!u) return;
        const { data: row } = await supabase.from("admin_users").select("user_id").eq("user_id", u.id).maybeSingle();
        if (active) setIsAdmin(Boolean(row));
      } catch (e) {
        // sans effet : le bandeau est simplement jugé comme pour une visiteuse
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Le résultat s'écrit dans l'adresse (après le « # ») ; il s'efface quand on revient aux questions
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      if (window.location.hash.includes("access_token")) return; // ne jamais écraser un lien de connexion
      const hash = showResult && isValidProfile(profile) ? encodeResultHash(profile) : "";
      window.history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    } catch (e) {
      // adresse non modifiable : le quiz fonctionne quand même
    }
  }, [showResult, profile, hydrated]);

  useEffect(() => {
    if (!toast || cartAsk) return undefined; // le message reste affiché tant que la question du panier est ouverte
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast, cartAsk]);

  // Échap ferme la question du panier, ou à défaut la fiche bague ; le quiz et son résultat restent tels quels
  useEffect(() => {
    if (!sheet && !cartAsk) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (cartAsk) setCartAsk(false);
      else setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, cartAsk]);

  // --- noms, couleurs et textes des saisons : ceux de l'onglet Familles, avec des valeurs de secours ---
  const seasonNames = useMemo(() => seasonNamesFrom(catalog.families, SEASON_NAMES), [catalog.families]);
  const seasonCards = useMemo(() => buildSeasonCards(catalog.families, catalog.products), [catalog.families, catalog.products]);
  const views = useMemo(() => {
    const out = {};
    for (const k of SEASON_KEYS) {
      const card = seasonCards.find((c) => c.key === k);
      out[k] = {
        key: k,
        name: seasonNames[k],
        tagline: (card && card.tagline) || SEASON_DEFAULTS[k].tag,
        dots: card && card.palette.length > 0 ? card.palette : SEASON_DEFAULTS[k].dots,
        grad: card ? card.grad : gradientFor({ is_season: true, key: k }),
      };
    }
    return out;
  }, [seasonCards, seasonNames]);
  const productsBySlug = useMemo(() => new Map(catalog.products.map((p) => [p.slug, p])), [catalog.products]);
  const footerSeasons = useMemo(() => seasonCards.map((c) => ({ key: c.key, name: c.name })), [seasonCards]);

  // --- résultat : classement de la visiteuse et bagues conseillées ---
  const rec = useMemo(() => {
    if (!showResult || !isValidProfile(profile)) return null;
    return recommend({ ...profile, metal: profile.metal === 1 || profile.metal === -1 ? profile.metal : 0 }, catalog.collections, { seasonNames });
  }, [showResult, profile, catalog.collections, seasonNames]);

  // --- bandeau (le plus prioritaire ; jamais pendant une pause, une maintenance, ni avec un code devenu invalide) ---
  const currentBanner =
    nowMs === null || catalog.loading
      ? null
      : pickPublicBanner(bannerRows, nowMs, { paused: shopPaused || previewingMaintenance, closedKeys: closedBanners, validCodes, checkStart: isAdmin });
  const closeBanner = () => {
    if (!currentBanner) return;
    const next = [...closedBanners, bannerKey(currentBanner)];
    setClosedBanners(next);
    writeClosedKeys(getSessionStorage(), next);
  };
  const handleBannerButton = (target, url) => {
    if (target === "custom" && url) {
      if (url.startsWith("/")) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (target === "quiz") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (typeof target === "string" && target.startsWith("season:")) {
      window.location.assign("/#saison=" + encodeURIComponent(target.slice(7)));
      return;
    }
    window.location.assign("/#collections");
  };

  // --- actions ---
  const pick = useCallback((key, i) => {
    setProfile((p) => ({ ...p, [key]: i }));
    const list = QUIZ_STEPS.find((s) => s.key === key);
    if (list && list.list[i]) setAnnounce(`${list.title} : ${list.list[i].name}`);
  }, []);
  const chooseMetal = useCallback((value) => {
    setProfile((p) => ({ ...p, metal: p.metal === value ? null : value }));
  }, []);
  const goTop = () => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const next = () => {
    if (profile[QUIZ_STEPS[step].key] === null) return;
    if (step < QUIZ_STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setShowResult(true);
    goTop();
  };
  const back = () => {
    if (step > 0) setStep(step - 1);
  };
  const edit = () => {
    setStep(0);
    setShowResult(false);
    goTop();
  };
  const restart = () => {
    setProfile(EMPTY_PROFILE);
    setStep(0);
    setShowWhy(false);
    setOccasion("anniv");
    setOutfitIndex(0);
    setShowResult(false);
    setAnnounce("");
    goTop();
  };
  const chooseOccasion = (key) => {
    setOccasion(key);
    setOutfitIndex(0);
  };
  // « Voir la bague » : la fiche de l'accueil s'ouvre par-dessus le quiz ; en la fermant, on retrouve le résultat
  const openSheet = (product, pick) => setSheet({ product, why: pick && pick.why ? pick.why : "" });
  const closeSheet = () => setSheet(null);
  const hasResult = showResult && isValidProfile(profile);
  // Voir le panier : avec un résultat affiché, on demande si la visiteuse veut revenir au quiz ensuite ;
  // sans résultat (pendant les questions), il n'y a rien à retrouver : on ouvre simplement le panier de l'accueil.
  const openCart = () => {
    if (hasResult) setCartAsk(true);
    else window.location.assign("/#panier");
  };
  const leaveToCart = (comeBack) => {
    window.location.assign(comeBack && hasResult ? "/" + encodeCartReturnHash(profile) : "/#panier");
  };
  const sheetLabel = sheet ? [sheet.product.seasonKey ? seasonNames[sheet.product.seasonKey] : "", sheet.product.collection].filter(Boolean).join(" · ") : "";

  const addToCart = (product) => {
    const storage = getLocalStorage();
    const r = addToStoredCart(storage, product.id);
    if (r.ok) {
      setCartCount(readCartCount(storage));
      setToast({ kind: "ok", text: `« ${product.name} » ajoutée au panier.` });
    } else if (r.reason === "max") {
      setToast({ kind: "warn", text: `Quantité maximale atteinte pour « ${product.name} ».` });
    } else {
      setToast({ kind: "warn", text: "Impossible d'ajouter au panier : le stockage de ce navigateur est indisponible." });
    }
  };

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32] selection:bg-[#dcc8dd]">
      <MediaGuard />
      <Head>
        <title>Quiz couleurs — Zenoria</title>
        <meta name="description" content="Choisissez la couleur de vos cheveux, de vos yeux et de votre peau : Zenoria vous conseille les bagues faites à la main et les couleurs de vêtements qui vous mettent en valeur." />
      </Head>

      {currentBanner && <BannerBar banner={currentBanner} nowMs={nowMs} onClose={closeBanner} onButton={handleBannerButton} />}
      <ShippingStrip />
      <QuizHeader cartCount={cartCount} onCartClick={openCart} />

      <main className="max-w-6xl mx-auto px-5 sm:px-6 py-10 md:py-14">
        {!showResult && (
          <>
            <div className="text-center mb-8 md:mb-10">
              <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">Quiz couleurs</div>
              <h1 className="font-serif text-3xl md:text-5xl leading-tight">Quelle bague s&apos;accorde à vos couleurs ?</h1>
              <p className="text-[#6e6268] mt-3 max-w-2xl mx-auto leading-7">
                Trois choix, un mannequin : à chaque réponse, ses couleurs changent. Nous en déduisons les bagues et les vêtements qui vous mettent en valeur.
              </p>
            </div>
            <QuizSteps profile={profile} step={step} onPick={pick} onMetal={chooseMetal} onBack={back} onNext={next} showWhy={showWhy} onToggleWhy={() => setShowWhy(!showWhy)} />
          </>
        )}
        {showResult && rec && (
          <QuizResult
            profile={profile}
            rec={rec}
            views={views}
            catalog={catalog}
            productsBySlug={productsBySlug}
            occasion={occasion}
            outfitIndex={outfitIndex}
            onOccasion={chooseOccasion}
            onOutfit={setOutfitIndex}
            onRestart={restart}
            onEdit={edit}
            onAdd={addToCart}
            onView={openSheet}
          />
        )}
      </main>

      {/* Annonces pour les lecteurs d'écran (choix effectué) */}
      <div className="sr-only" aria-live="polite" data-testid="quiz-live">
        {announce}
      </div>

      {toast && (
        <div role="status" data-testid="quiz-toast" className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] rounded-2xl px-5 py-3 text-sm shadow-xl flex flex-wrap items-center gap-x-4 gap-y-1 ${toast.kind === "ok" ? "bg-[#3b2b39] text-white" : "bg-amber-100 text-amber-900"}`}>
          <span>{toast.text}</span>
          {toast.kind === "ok" && (
            <button type="button" onClick={openCart} data-testid="quiz-toast-cart" className="underline underline-offset-2 text-[#f0d79a]">
              Voir le panier
            </button>
          )}
        </div>
      )}

      <QuizFooter seasons={footerSeasons} />

      {/* Fiche bague : le même composant que sur l'accueil, avec « Pourquoi elle vous va » en plus */}
      <ProductSheet
        product={sheet ? sheet.product : null}
        initialMode="video"
        label={sheetLabel}
        onClose={closeSheet}
        onAdd={(p) => {
          closeSheet();
          addToCart(p);
        }}
        extra={
          sheet && sheet.why ? (
            <p data-testid="sheet-why" className="text-sm leading-6 text-[#54434c] mt-4 rounded-xl bg-[#faf6f8] border border-[#eee2e5] px-4 py-3">
              <strong className="font-medium">Pourquoi elle vous va.</strong> {sheet.why}
            </p>
          ) : null
        }
      />

      <QuizCartDialog open={cartAsk} onStay={() => setCartAsk(false)} onYes={() => leaveToCart(true)} onNo={() => leaveToCart(false)} />
    </div>
  );
}
