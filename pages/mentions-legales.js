// ZENORIA_MENTIONS_LEGALES_V1
import React from "react";
import Head from "next/head";

// ============================================================
// PAGE « MENTIONS LÉGALES & CGV » — /mentions-legales
//
// (idéalement par un juriste) avant l'ouverture réelle de la boutique. Rédigé sur le même modèle
// que pages/confidentialite.js (composants Todo et Section), à tenir à jour en parallèle.
// ============================================================

const Todo = ({ children }) => (
  <mark className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[0.92em]">[À COMPLÉTER : {children}]</mark>
);

const Section = ({ id, title, children }) => (
  <section id={id} className="mt-9">
    <h2 className="font-serif text-2xl mb-3 text-[#412f3b]">{title}</h2>
    <div className="space-y-3 text-[15px] leading-7 text-[#54434c]">{children}</div>
  </section>
);

export default function MentionsLegales() {
  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Mentions légales – Zenoria</title>
        <meta name="robots" content="noindex" />
      </Head>

      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/"><img src="/images/logo-facture.png" alt="Zenoria" className="h-9 w-auto" /></a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl text-[#412f3b]">Mentions légales</h1>
        <p className="text-sm text-[#8b737e] mt-2">Dernière mise à jour : 16 octobre 2026</p>


        <Section id="editeur" title="Qui édite ce site ?">
          <p>
            Le site Zenoria est édité par une entreprise individuelle immatriculée sous le numéro SIRET 821 828 183 00011.
          </p>
          <p>
            Contact : bagues.mandala@proton.me
          </p>
          <p>
            TVA non applicable — article 293 B du Code général des impôts.
          </p>
        </Section>

        <Section id="hebergement" title="Hébergement">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Vercel Inc.</strong> — hébergement du site. Données hébergées à Dublin, Irlande.</li>
            <li><strong>Supabase Inc.</strong> — hébergement de la base de données, de l'authentification et des fichiers. Données hébergées à Dublin, Irlande.</li>
          </ul>
        </Section>

        <Section id="propriete" title="Propriété intellectuelle">
          <p>
            L&apos;ensemble des éléments présents sur le site (textes, photographies, vidéos, logos, charte graphique, nom « Zenoria ») est protégé par le droit de la propriété intellectuelle. Toute reproduction non autorisée est interdite.
          </p>
        </Section>

        
      </main>
    </div>
  );
}
