import React, { useMemo, useState, useEffect } from "react";
import Head from "next/head";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag, Search, User, Heart, Menu, X, Sparkles, ArrowRight,
  Star, Leaf, Shield, Gem, Instagram, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import AuthModal from "@/components/AuthModal";

// ============================================================
// CATALOGUE ZENORIA — basé sur la structure réelle des dossiers
// Pour ajouter tes vraies photos/vidéos :
// 1. Dépose les fichiers dans /public/images/<dossier-collection>/
// 2. Renseigne le champ "photos" et "video" ci-dessous avec les
//    noms de fichiers exacts.
// ============================================================

const products = [
  {
    id: 1,
    slug: "bleu-de-mer",
    name: "Bleu de Mer",
    family: "Collection Bleus",
    collection: "Sérénité",
    energy: "Calme, apaisement et lâcher-prise",
    price: 89,
    color: "from-cyan-200 via-sky-100 to-blue-300",
    stone: "🌊",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250628_170109.jpg", "IMG_20250628_170326.jpg"],
    video: "VID_20250628_165912.mp4",
  },
  {
    id: 2,
    slug: "bleu-saphir",
    name: "Bleu Saphir",
    family: "Collection Bleus",
    collection: "Protection",
    energy: "Confiance, protection et force intérieure",
    price: 99,
    color: "from-blue-700 via-indigo-300 to-slate-100",
    stone: "💎",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250801_164130.jpg", "IMG_20250801_164300.jpg"],
    video: "VID_20250801_164013.mp4",
  },
  {
    id: 3,
    slug: "bleu-violette",
    name: "Bleu Violette",
    family: "Collection Bleus",
    collection: "Intuition",
    energy: "Spiritualité, intuition et méditation",
    price: 95,
    color: "from-indigo-400 via-violet-200 to-sky-100",
    stone: "🔮",
    photoCount: 3,
    videoCount: 1,
    photos: ["IMG_20250620_194129.jpg", "IMG_20250620_194549.jpg", "IMG_20250620_194624.jpg"],
    video: "VID_20250620_194400.mp4",
  },
  {
    id: 4,
    slug: "bleue",
    name: "Bleue",
    family: "Collection Bleus",
    collection: "Harmonie",
    energy: "Équilibre, harmonie et pureté",
    price: 85,
    color: "from-sky-300 via-blue-100 to-white",
    stone: "💙",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250620_140124_1.jpg", "IMG_20250620_193815.jpg"],
    video: "VID_20250620_135856.mp4",
  },
  {
    id: 5,
    slug: "chocolat",
    name: "Chocolat",
    family: "Collection Nature",
    collection: "Ancrage",
    energy: "Stabilité, terre et ancrage",
    price: 79,
    color: "from-amber-900 via-orange-200 to-stone-100",
    stone: "🤎",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250623_152138.jpg", "IMG_20250623_152156.jpg"],
    video: "VID_20250623_150531.mp4",
  },
  {
    id: 6,
    slug: "citron",
    name: "Citron",
    family: "Collection Nature",
    collection: "Vitalité",
    energy: "Vitalité, créativité et lumière",
    price: 79,
    color: "from-yellow-300 via-lime-100 to-white",
    stone: "🍋",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250623_152304.jpg", "IMG_20250623_152337.jpg"],
    video: "VID_20250623_150825.mp4",
  },
  {
    id: 7,
    slug: "rose",
    name: "Rose",
    family: "Collection Roses",
    collection: "Amour",
    energy: "Amour, douceur et féminité",
    price: 89,
    color: "from-rose-300 via-pink-100 to-white",
    stone: "🌸",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250620_193338.jpg", "IMG_20250620_193406.jpg"],
    video: "VID_20250620_141433.mp4",
  },
  {
    id: 8,
    slug: "rose-bonbon",
    name: "Rose Bonbon",
    family: "Collection Roses",
    collection: "Joie",
    energy: "Optimisme, tendresse et énergie positive",
    price: 85,
    color: "from-pink-400 via-rose-100 to-fuchsia-100",
    stone: "🍬",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250626_173150.jpg", "IMG_20250626_173203.jpg"],
    video: "VID_20250626_172809.mp4",
  },
  {
    id: 9,
    slug: "verte",
    name: "Verte",
    family: "Collection Nature",
    collection: "Abondance",
    energy: "Croissance, renouveau et abondance",
    price: 89,
    color: "from-emerald-400 via-green-100 to-lime-100",
    stone: "🌿",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250628_171902.jpg", "IMG_20250628_172016.jpg"],
    video: "VID_20250628_171744.mp4",
  },
  {
    id: 10,
    slug: "violette",
    name: "Violette",
    family: "Collection Violettes",
    collection: "Éveil spirituel",
    energy: "Sagesse, méditation et connexion intérieure",
    price: 95,
    color: "from-purple-500 via-violet-200 to-white",
    stone: "💜",
    photoCount: 2,
    videoCount: 1,
    photos: ["IMG_20250620_141016.jpg", "IMG_20250620_193626.jpg"],
    video: "VID_20250620_140816.mp4",
  },
];

const energies = [
  { name: "Bleus", desc: "4 créations · Sérénité et protection", icon: Shield, bg: "from-sky-100 to-indigo-200" },
  { name: "Roses", desc: "2 créations · Amour et joie", icon: Heart, bg: "from-rose-100 to-pink-200" },
  { name: "Nature", desc: "3 créations · Ancrage et abondance", icon: Leaf, bg: "from-emerald-100 to-amber-100" },
  { name: "Violettes", desc: "1 création · Intuition et éveil", icon: Sparkles, bg: "from-violet-100 to-purple-200" },
];

function CrystalLogo({ mode = 1, compact = false }) {
  const styles = [
    "from-[#bd8792] via-[#d8b36d] to-[#705185]",
    "from-[#6f4a8e] via-[#ead4b0] to-[#bf8797]",
    "from-[#222] via-[#9d6f86] to-[#d7b66f]",
  ];
  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${compact ? "h-10 w-10" : "h-14 w-14"} rounded-full bg-gradient-to-br ${styles[mode - 1]} p-[2px] shadow-lg`}>
        <div className="relative h-full w-full rounded-full bg-[#fbf8f4] overflow-hidden">
          <div className="absolute -left-1 top-0 h-full w-[58%] rounded-r-full bg-gradient-to-br from-[#76518f] to-[#c89aa6]" />
          <div className="absolute right-1 top-1 h-[46%] w-[46%] rounded-full bg-[#fbf8f4]" />
          <div className="absolute left-2 bottom-2 h-2.5 w-2.5 rounded-full bg-[#fbf8f4] ring-1 ring-[#d8b36d]" />
          <div className="absolute right-3 top-3 h-2.5 w-2.5 rotate-45 bg-gradient-to-br from-white to-[#d8b36d] shadow" />
        </div>
      </div>
      <div>
        <div className={`${compact ? "text-xl" : "text-3xl"} tracking-[.22em] font-serif text-[#412f3b]`}>ZENORIA</div>
        {!compact && <div className="text-[10px] tracking-wide text-[#755f6e] italic">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</div>}
      </div>
    </div>
  );
}

// Visuel produit : utilise la vraie photo (ou la vidéo pour le Hero) si présente
// dans /public/images/<slug>/, sinon affiche un visuel graphique de remplacement.
function RingVisual({ product, large = false, circle = false, video = false }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = product.photos && product.photos[0] ? `/images/${product.slug}/${product.photos[0]}` : null;
  const videoSrc = product.video ? `/images/${product.slug}/${product.video}` : null;

  // Cercle du Hero affichant la vidéo de la collection en lecture automatique.
  if (circle && video && videoSrc && !imgError) {
    return (
      <div className="relative w-full h-full rounded-full overflow-hidden bg-black">
        <video
          key={videoSrc}
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center"
        />
      </div>
    );
  }

  if (imgSrc && !imgError) {
    if (circle) {
      return (
        <div className="relative w-full h-full rounded-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center"
          />
        </div>
      );
    }
    return (
      <div className={`relative overflow-hidden ${large ? "h-[360px]" : "h-56"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={product.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-center"
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${product.color} ${large ? "h-[360px]" : "h-56"} flex items-center justify-center`}>
      <div className={`${large ? "h-44 w-44" : "h-28 w-28"} rounded-full border-[10px] border-[#d2a66d] shadow-[inset_0_0_18px_rgba(89,53,31,.28),0_20px_35px_rgba(78,45,67,.18)] relative`}>
        <div className={`absolute left-1/2 -translate-x-1/2 -top-10 ${large ? "h-24 w-24 text-5xl" : "h-16 w-16 text-3xl"} rotate-45 rounded-2xl bg-white/75 backdrop-blur border border-white shadow-xl flex items-center justify-center`}>
          <span className="-rotate-45">{product.stone}</span>
        </div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,.9),transparent_18%),radial-gradient(circle_at_72%_18%,rgba(255,255,255,.75),transparent_10%)]" />
    </div>
  );
}

// Visuel affiché dans la fiche produit (modal).
// Par défaut : lit automatiquement la vidéo de la collection en boucle.
// "initialMode" permet d'ouvrir directement sur les photos ("photo") ou la vidéo ("video").
// L'utilisateur peut ensuite basculer via les onglets "Vidéo" / "X photos" sous le média.
function ProductMedia({ product, initialMode = "video" }) {
  const [videoError, setVideoError] = useState(false);
  const [mode, setMode] = useState(initialMode); // "video" | "photo"
  const [photoIndex, setPhotoIndex] = useState(0);
  const videoSrc = product.video ? `/images/${product.slug}/${product.video}` : null;
  const photos = product.photos || [];

  // Remise à zéro quand on change de produit ou de mode d'ouverture
  useEffect(() => {
    setMode(initialMode);
    setPhotoIndex(0);
    setVideoError(false);
  }, [product.slug, initialMode]);

  const hasVideo = Boolean(videoSrc) && !videoError;
  const hasPhotos = photos.length > 0;

  const goPrevPhoto = () => setPhotoIndex((i) => (i === 0 ? photos.length - 1 : i - 1));
  const goNextPhoto = () => setPhotoIndex((i) => (i === photos.length - 1 ? 0 : i + 1));

  return (
    <div>
      <div className="relative overflow-hidden h-[360px] bg-black">
        {mode === "video" && hasVideo ? (
          <video
            key={videoSrc}
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            controls
            onError={() => setVideoError(true)}
            className="w-full h-full object-cover object-center"
          />
        ) : hasPhotos ? (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photos[photoIndex]}
              src={`/images/${product.slug}/${photos[photoIndex]}`}
              alt={`${product.name} - photo ${photoIndex + 1}`}
              className="w-full h-full object-cover object-center"
            />
            {photos.length > 1 && (
              <>
                <button
                  onClick={goPrevPhoto}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 hover:bg-white grid place-items-center"
                  aria-label="Photo précédente"
                >
                  ‹
                </button>
                <button
                  onClick={goNextPhoto}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 hover:bg-white grid place-items-center"
                  aria-label="Photo suivante"
                >
                  ›
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${i === photoIndex ? "bg-white" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <RingVisual product={product} large />
        )}
      </div>
      <div className="flex gap-2 px-8 pt-4">
        {hasVideo && (
          <button
            onClick={() => setMode("video")}
            className={`rounded-full px-3 py-1 text-xs ${mode === "video" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#826d77]"}`}
          >
            Vidéo
          </button>
        )}
        {hasPhotos && (
          <button
            onClick={() => setMode("photo")}
            className={`rounded-full px-3 py-1 text-xs ${mode === "photo" ? "bg-[#8f6075] text-white" : "bg-[#f5edf1] text-[#826d77]"}`}
          >
            {photos.length} photo{photos.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ZenoriaShop() {
  const [cart, setCart] = useState([]);
  const [fav, setFav] = useState([]);
  const [menu, setMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedMode, setSelectedMode] = useState("video");
  const logo = 1;
  const [quiz, setQuiz] = useState(null);
  const [selectedFamily, setSelectedFamily] = useState(null);

  // --- Authentification (Supabase) ---
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    // Récupère la session active au chargement de la page
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session ? data.session.user : null);
      setAuthLoading(false);
    });

    // Écoute les changements de session (connexion / déconnexion)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? session.user : null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Nettoie l'URL après une connexion automatique via lien d'e-mail
  // (confirmation d'inscription, mot de passe oublié), pour ne plus
  // afficher le jeton d'accès dans la barre d'adresse.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      // On laisse d'abord Supabase lire le jeton, puis on nettoie l'URL.
      const timer = setTimeout(() => {
        window.history.replaceState(null, "", window.location.pathname);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAccountMenuOpen(false);
  };

  const total = useMemo(() => cart.reduce((s, p) => s + p.price, 0), [cart]);
  const add = (p) => {
    setCart([...cart, p]);
    setCartOpen(true);
  };

  // Ouvre la fiche produit, directement sur la vidéo ou sur les photos
  const openProduct = (p, mode = "video") => {
    setSelectedMode(mode);
    setSelected(p);
  };

  // Scroll fluide vers une section par son id, sans utiliser de lien "#" classique
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Clique sur une carte "énergie" : filtre le catalogue sur la famille choisie
  // et fait défiler jusqu'à la section Collections.
  const handleEnergyClick = (energyName) => {
    setSelectedFamily((prev) => (prev === energyName ? null : energyName));
    scrollToSection("collections");
  };

  const filteredProducts = selectedFamily
    ? products.filter((p) => p.family.includes(selectedFamily))
    : products;

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32] selection:bg-[#dcc8dd]">
      <Head>
        <title>Zenoria — L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme</title>
        <meta name="description" content="Bagues artisanales en cristaux Swarovski. Collections Bleus, Roses, Nature et Violettes." />
      </Head>

      <div className="bg-[#342434] text-white/85 text-[11px] py-2 px-4 text-center tracking-wide">
        Livraison offerte dès 70 € · Créations artisanales · Paiement sécurisé
      </div>

      <header className="sticky top-0 z-40 bg-[#fbf8f4]/95 backdrop-blur border-b border-[#eadfe4]">
        <div className="max-w-7xl mx-auto px-5 h-20 flex items-center justify-between">
          <CrystalLogo compact mode={logo} />
          <nav className="hidden lg:flex gap-7 text-sm">
            <button onClick={() => scrollToSection("collections")} className="hover:text-[#8f6075]">Collections</button>
            <button onClick={() => scrollToSection("energies")} className="hover:text-[#8f6075]">Nos énergies</button>
            <button onClick={() => scrollToSection("philosophie")} className="hover:text-[#8f6075]">Notre histoire</button>
            <button onClick={() => scrollToSection("quiz")} className="hover:text-[#8f6075]">Quiz</button>
            <button onClick={() => scrollToSection("contact")} className="hover:text-[#8f6075]">Contact</button>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Search size={19} /></Button>

            {/* Compte utilisateur */}
            <div className="relative hidden sm:block">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (user) {
                    setAccountMenuOpen(!accountMenuOpen);
                  } else {
                    setAuthModalOpen(true);
                  }
                }}
              >
                <User size={19} />
              </Button>
              {user && accountMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-[#eadfe4] p-4 z-50">
                  <div className="text-xs text-[#9a7384] uppercase tracking-widest mb-1">Connecté(e) en tant que</div>
                  <div className="text-sm font-medium truncate mb-3">{user.email}</div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm text-[#8f6075] hover:text-[#71485b]"
                  >
                    <LogOut size={16} /> Se déconnecter
                  </button>
                </div>
              )}
            </div>

            <Button variant="ghost" size="icon" onClick={() => setCartOpen(true)} className="relative">
              <ShoppingBag size={19} />
              {cart.length > 0 && (
                <span className="absolute right-0 top-0 h-5 min-w-5 rounded-full bg-[#9a667c] text-white text-[10px] grid place-items-center">
                  {cart.length}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(!menu)}>
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menu && (
          <div className="lg:hidden px-6 pb-5 flex flex-col gap-3 text-sm">
            <button onClick={() => { scrollToSection("collections"); setMenu(false); }} className="text-left">Collections</button>
            <button onClick={() => { scrollToSection("energies"); setMenu(false); }} className="text-left">Nos énergies</button>
            <button onClick={() => { scrollToSection("philosophie"); setMenu(false); }} className="text-left">Notre histoire</button>
            <button onClick={() => { scrollToSection("quiz"); setMenu(false); }} className="text-left">Quiz</button>
            <button onClick={() => { scrollToSection("contact"); setMenu(false); }} className="text-left">Contact</button>
            {!authLoading && (
              user ? (
                <button onClick={() => { handleLogout(); setMenu(false); }} className="text-left text-[#8f6075]">
                  Se déconnecter ({user.email})
                </button>
              ) : (
                <button onClick={() => { setAuthModalOpen(true); setMenu(false); }} className="text-left text-[#8f6075]">
                  Connexion / Créer un compte
                </button>
              )
            )}
          </div>
        )}
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden min-h-[670px] flex items-center bg-[radial-gradient(circle_at_75%_40%,#ead5ee_0%,#fbf6f0_38%,#f0dbd4_70%,#dfc1c8_100%)]">
          <div className="absolute -right-24 top-10 h-[560px] w-[560px] rounded-full border border-white/50 bg-white/20 backdrop-blur-sm" />
          <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 items-center gap-14 relative z-10">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <div className="text-xs uppercase tracking-[.3em] text-[#8b6578] mb-5">10 collections · Cristaux Swarovski</div>
              <h1 className="font-serif text-6xl md:text-8xl leading-none mb-5 text-[#513642]">ZENORIA</h1>
              <p className="font-serif italic text-2xl md:text-3xl text-[#594856] mb-5">
                L&apos;énergie du cristal,<br />l&apos;harmonie de l&apos;âme.
              </p>
              <p className="max-w-lg text-[#6e6268] leading-7 mb-8">
                Des bagues artisanales imaginées comme des symboles d&apos;équilibre, façonnées pour révéler votre lumière intérieure.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => scrollToSection("collections")}
                  className="rounded-full bg-[#8f6075] hover:bg-[#71485b] px-7 h-12"
                >
                  Découvrir la collection <ArrowRight className="ml-2" size={17} />
                </Button>
                <Button
                  onClick={() => scrollToSection("philosophie")}
                  variant="outline"
                  className="rounded-full border-[#9b7a89] px-7 h-12 bg-white/35"
                >
                  Notre philosophie
                </Button>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative flex justify-center">
              <div className="h-[420px] w-[420px] max-w-[88vw] rounded-full bg-white/35 border border-white shadow-[0_30px_100px_rgba(91,54,77,.2)] overflow-hidden relative">
                <RingVisual product={products[0]} large circle video />
              </div>
              <div className="absolute right-0 bottom-8 rounded-2xl bg-white/65 backdrop-blur p-4 shadow-lg">
                <Gem className="text-[#9b6480] mb-2" />
                <div className="font-serif">Pièce artisanale</div>
                <div className="text-xs text-[#756a70]">Finition lumineuse</div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ENERGIES / FAMILLES */}
        <section id="energies" className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-10">
            <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">Votre intention, votre bijou</div>
            <h2 className="font-serif text-4xl">Trouvez l&apos;énergie qui vous ressemble</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {energies.map((e) => (
              <motion.div
                whileHover={{ y: -7 }}
                key={e.name}
                onClick={() => handleEnergyClick(e.name)}
                role="button"
                tabIndex={0}
                className={`cursor-pointer rounded-[2rem] p-6 min-h-48 bg-gradient-to-br ${e.bg} border shadow-sm transition ${
                  selectedFamily === e.name ? "border-[#8f6075] ring-2 ring-[#8f6075]" : "border-white"
                }`}
              >
                <e.icon className="mb-8 text-[#725464]" />
                <div className="font-serif text-2xl mb-2">{e.name}</div>
                <div className="text-sm text-[#665c61]">{e.desc}</div>
                <ArrowRight className="mt-5" size={18} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* COLLECTIONS / CATALOGUE */}
        <section id="collections" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-end mb-9">
              <div>
                <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">La collection</div>
                <h2 className="font-serif text-4xl">
                  {selectedFamily ? `Collection ${selectedFamily}` : "Nos créations"}
                </h2>
              </div>
              {selectedFamily ? (
                <button onClick={() => setSelectedFamily(null)} className="text-sm border-b border-[#6d4e5c]">
                  Voir toute la collection
                </button>
              ) : (
                <button className="text-sm border-b border-[#6d4e5c]">Voir toute la collection</button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((p) => (
                <Card key={p.id} className="overflow-hidden rounded-[1.5rem] border-[#eee2e5] group">
                  <div className="relative">
                    <RingVisual product={p} />
                    <button
                      onClick={() => setFav(fav.includes(p.id) ? fav.filter((x) => x !== p.id) : [...fav, p.id])}
                      className="absolute right-4 top-4 h-10 w-10 bg-white/80 rounded-full grid place-items-center z-10"
                    >
                      <Heart size={18} fill={fav.includes(p.id) ? "#9a667c" : "none"} className="text-[#9a667c]" />
                    </button>
                    <button className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition z-[5]" onClick={() => openProduct(p)} />
                  </div>
                  <CardContent className="p-5">
                    <div className="text-xs uppercase tracking-widest text-[#9a7384]">{p.family} · {p.collection}</div>
                    <div className="flex justify-between mt-2 gap-3">
                      <div className="font-serif text-xl">{p.name}</div>
                      <div className="font-medium whitespace-nowrap">{p.price},00 €</div>
                    </div>
                    <p className="text-sm text-[#70656a] mt-3">{p.energy}</p>
                    <div className="flex gap-2 mt-4 text-xs text-[#826d77]">
                      <button
                        type="button"
                        onClick={() => openProduct(p, "photo")}
                        className="rounded-full bg-[#f5edf1] hover:bg-[#ead9e1] px-3 py-1 transition"
                      >
                        {p.photoCount} photo{p.photoCount > 1 ? "s" : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => openProduct(p, "video")}
                        className="rounded-full bg-[#f5edf1] hover:bg-[#ead9e1] px-3 py-1 transition"
                      >
                        {p.videoCount} vidéo
                      </button>
                    </div>
                    <Button onClick={() => add(p)} variant="outline" className="w-full mt-5 rounded-full border-[#b88d9f] hover:bg-[#8f6075] hover:text-white">
                      Ajouter au panier
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* PHILOSOPHIE */}
        <section id="philosophie" className="grid lg:grid-cols-2 min-h-[540px]">
          <div className="bg-gradient-to-br from-[#d8c4d9] via-[#f5e8e6] to-[#dbc9a9] grid place-items-center p-12">
            <div className="h-80 w-80 rounded-full border border-white/60 bg-white/30 shadow-2xl grid place-items-center">
              <CrystalLogo mode={logo} />
            </div>
          </div>
          <div className="bg-[#3b2b39] text-white p-12 lg:p-20 flex flex-col justify-center">
            <div className="text-xs tracking-[.3em] uppercase text-[#d7b4c3] mb-4">Notre philosophie</div>
            <h2 className="font-serif text-4xl md:text-5xl leading-tight mb-6">
              Plus qu&apos;un bijou,<br />un symbole d&apos;équilibre.
            </h2>
            <p className="text-white/70 leading-7 max-w-xl">
              Chaque création Zenoria associe l&apos;élégance du cristal à un univers de sérénité. Nos bagues sont pensées pour accompagner les instants précieux et raconter une histoire personnelle.
            </p>
            <Button variant="outline" className="mt-8 w-fit rounded-full border-white/40 bg-transparent text-white">
              Découvrir notre histoire
            </Button>
          </div>
        </section>

        {/* QUIZ */}
        <section id="quiz" className="max-w-6xl mx-auto px-6 py-24">
          <div className="rounded-[2.5rem] p-8 md:p-14 bg-gradient-to-r from-[#eee3f5] to-[#f6e3df] grid lg:grid-cols-[1.2fr_.8fr] gap-10">
            <div>
              <Sparkles className="text-[#956d83] mb-5" />
              <h2 className="font-serif text-4xl mb-4">Quelle énergie recherchez-vous aujourd&apos;hui ?</h2>
              <p className="text-[#6d6068] mb-7">Choisissez votre intention et découvrez la création Zenoria qui lui correspond.</p>
              <div className="flex flex-wrap gap-3">
                {["Sérénité", "Amour", "Protection", "Abondance", "Éveil spirituel"].map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setQuiz(x)}
                    style={{ color: quiz === x ? "#ffffff" : "#54434c" }}
                    className={`rounded-full px-5 h-10 text-sm font-medium border transition ${
                      quiz === x
                        ? "bg-[#82566d] border-[#82566d]"
                        : "bg-white border-[#d9c5cc] hover:bg-[#f5edf1]"
                    }`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-white/70 p-7 min-h-52 flex flex-col justify-center">
              {quiz ? (
                <>
                  <div className="text-xs uppercase tracking-widest text-[#9a6e82]">Votre sélection</div>
                  <div className="font-serif text-3xl my-3">{quiz}</div>
                  <p className="text-sm text-[#6b6166] mb-5">Nous avons sélectionné une création qui accompagne cette intention.</p>
                  <Button
                    onClick={() => openProduct(products.find((p) => p.collection === quiz) || products[0])}
                    className="rounded-full bg-[#8d5e74]"
                  >
                    Voir la recommandation
                  </Button>
                </>
              ) : (
                <>
                  <Gem className="text-[#9b6980] mb-4" size={34} />
                  <div className="font-serif text-2xl">Votre recommandation apparaîtra ici</div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* TEMOIGNAGES */}
        <section className="bg-white py-20">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-10">
              <h2 className="font-serif text-4xl">Elles parlent de Zenoria</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                "Une création délicate, encore plus belle portée.",
                "Le soin du détail et l'univers de la marque m'ont séduite.",
                "Un cadeau lumineux, présenté avec beaucoup d'élégance.",
              ].map((t, i) => (
                <div key={t} className="rounded-3xl bg-[#fbf7f5] p-7">
                  <div className="flex mb-4">
                    {[1, 2, 3, 4, 5].map((x) => (
                      <Star key={x} size={16} fill="#b88966" className="text-[#b88966]" />
                    ))}
                  </div>
                  <p className="font-serif text-xl italic">&ldquo;{t}&rdquo;</p>
                  <div className="mt-5 text-xs uppercase tracking-widest text-[#8b737e]">Cliente Zenoria {i + 1}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* NEWSLETTER */}
        <section id="contact" className="bg-[#d9c5cc] py-16">
          <div className="max-w-5xl mx-auto px-6 text-center">
            <div className="text-xs tracking-[.3em] uppercase mb-3">Le cercle Zenoria</div>
            <h2 className="font-serif text-4xl mb-4">Recevez nos nouveautés</h2>
            <p className="mb-7 text-[#61535a]">Inspirations, nouvelles créations et attentions exclusives.</p>
            <div className="max-w-xl mx-auto flex bg-white rounded-full p-1.5">
              <input placeholder="Votre adresse e-mail" className="flex-1 px-5 bg-transparent outline-none min-w-0" />
              <Button className="rounded-full bg-[#7b5266]">Je m&apos;inscris</Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#2f252d] text-white/70 py-12">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-9">
          <div>
            <CrystalLogo compact mode={logo} />
            <p className="text-xs mt-5 leading-6">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</p>
          </div>
          <div>
            <div className="text-white mb-3">Boutique</div>
            <div className="text-sm space-y-2">
              <p>Collections</p>
              <p>Nouveautés</p>
              <p>Éditions limitées</p>
            </div>
          </div>
          <div>
            <div className="text-white mb-3">Informations</div>
            <div className="text-sm space-y-2">
              <p>Livraison et retours</p>
              <p>FAQ</p>
              <p>Mentions légales</p>
            </div>
          </div>
          <div>
            <div className="text-white mb-3">Suivez-nous</div>
            <div className="flex gap-3">
              <Instagram />
              <Heart />
              <Sparkles />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-xs">© 2026 Zenoria. Prototype e-commerce.</div>
      </footer>

      {/* PANIER */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/35 z-50" onClick={() => setCartOpen(false)} />
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="fixed right-0 top-0 h-full w-full max-w-md bg-[#fbf8f4] z-50 p-7 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="font-serif text-3xl">Votre panier</h3>
                <Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}><X /></Button>
              </div>
              <div className="mt-8 space-y-4">
                {cart.length === 0 ? (
                  <p className="text-[#756a70]">Votre panier est vide.</p>
                ) : (
                  cart.map((p, i) => (
                    <div className="flex justify-between bg-white p-4 rounded-2xl" key={i}>
                      <div>
                        <div className="font-serif">{p.name}</div>
                        <div className="text-xs text-[#8b737e]">{p.collection}</div>
                      </div>
                      <div>{p.price},00 €</div>
                    </div>
                  ))
                )}
              </div>
              {cart.length > 0 && (
                <div className="absolute bottom-7 left-7 right-7">
                  <div className="flex justify-between text-xl font-serif mb-5">
                    <span>Total</span>
                    <span>{total},00 €</span>
                  </div>
                  <Button className="w-full rounded-full h-12 bg-[#82576c]">Commander</Button>
                  <p className="text-[11px] text-center mt-3 text-[#7e7378]">Paiement de démonstration, aucune transaction réelle.</p>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* FICHE PRODUIT */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed z-50 inset-x-4 top-[6%] max-w-4xl mx-auto bg-[#fbf8f4] rounded-[2rem] overflow-hidden shadow-2xl grid md:grid-cols-2 max-h-[88vh] overflow-y-auto"
            >
              <ProductMedia product={selected} initialMode={selectedMode} />
              <div className="p-8 relative">
                <button className="absolute right-5 top-5" onClick={() => setSelected(null)}><X /></button>
                <div className="text-xs uppercase tracking-widest text-[#9a7384]">{selected.family} · {selected.collection}</div>
                <h3 className="font-serif text-4xl mt-3">{selected.name}</h3>
                <div className="text-2xl mt-4">{selected.price},00 €</div>
                <p className="text-sm leading-6 text-[#70656a] my-6">{selected.energy}</p>
                <label className="text-xs uppercase tracking-widest">Taille</label>
                <div className="flex gap-2 mt-2 mb-6">
                  {[50, 52, 54, 56].map((s) => (
                    <button className="h-10 w-10 rounded-full border border-[#b89baa] hover:bg-[#eadde3]" key={s}>{s}</button>
                  ))}
                </div>
                <Button onClick={() => { add(selected); setSelected(null); }} className="w-full rounded-full h-12 bg-[#855a6f]">
                  Ajouter au panier
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AUTHENTIFICATION */}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
