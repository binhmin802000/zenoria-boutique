// ZENORIA_CARE_INFO_V1
import React, { useEffect, useState } from "react";
import Head from "next/head";
import SiteHeader from "@/components/SiteHeader"; // ZENORIA_SITE_HEADER_H3
import CareInfoText from "@/components/CareInfoText";
import { supabase } from "@/lib/supabase";
import { fetchCareInfoSetting } from "@/lib/careInfoSettings";
import { readLocalFavorites } from "@/lib/favorites";
import { fetchAccountHref, DEFAULT_ACCOUNT_HREF, safeLocalStorage } from "@/lib/accountLink"; // ZENORIA_ACCOUNT_PANIER_V1
import { cartCount as readCartCount } from "@/lib/quizState";
// ============================================================
// PAGE « ENTRETIEN DU BIJOU » — /entretien
//
// Le texte est modifiable depuis /admin > Contenu du site > Vitrine & ambiance > Entretien du bijou.
// Page sur le modele de /cgv (pages/cgv.js) : meme en-tete, meme mise en page, meme gabarit.
// ============================================================
export default function Entretien() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [content, setContent] = useState("");
  const [favCount, setFavCount] = useState(0);
  const [accountHref, setAccountHref] = useState(DEFAULT_ACCOUNT_HREF);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchCareInfoSetting(supabase).then((res) => {
      if (!alive) return;
      setEnabled(res.enabled);
      setContent(res.content);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    setFavCount(readLocalFavorites().length);
  }, []);
  useEffect(() => {
    let alive = true;
    fetchAccountHref(supabase).then((href) => {
      if (alive) setAccountHref(href);
    });
    setCartCount(readCartCount(safeLocalStorage()));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Entretien du bijou – Zenoria</title>
        <meta name="robots" content="noindex" />
      </Head>
      <SiteHeader
        logoHref="/"
        showSearch={false}
        showAccount={true}
        onAccountClick={() => window.location.assign(accountHref)}
        showFavorites={true}
        favCount={favCount}
        onFavClick={() => window.location.assign("/#favoris")}
        showCart={true}
        cartCount={cartCount}
        onCartClick={() => window.location.assign("/#panier")}
      />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl text-[#412f3b]">Entretien du bijou</h1>
        {loading ? (
          <p className="text-sm text-[#8b737e] mt-8">Chargement…</p>
        ) : enabled && content ? (
          <CareInfoText data-testid="care-info-content" content={content} className="mt-8 text-[15px] leading-7 text-[#54434c]" />
        ) : (
          <p data-testid="care-info-empty" className="mt-8 text-sm text-[#8b737e]">
            Les conseils d&apos;entretien seront bientôt disponibles. Pour toute question, contactez-nous depuis la boutique.
          </p>
        )}
      </main>
    </div>
  );
}
