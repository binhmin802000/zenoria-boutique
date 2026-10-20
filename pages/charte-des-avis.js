// ZENORIA_STORY_REVIEWS_V1 · ZENORIA_REVIEWS_STEP1_V1
import React from "react";
import Head from "next/head";
import { supabase } from "@/lib/supabase";
import { fetchReviewsSetting, REVIEWS_RULES } from "@/lib/reviewsSettings";

// ============================================================
// PAGE « CHARTE DES AVIS CLIENTES » — /charte-des-avis
//
// Visible seulement si l'interrupteur « Avis clientes » est activé (/admin > Contenu du site).
// Désactivé, absent ou illisible : vraie page 404.
// S'adapte au mode d'affichage : « étoiles + commentaires » ou « étoiles seulement ».
// Informations exigées par l'article D111-17 du Code de la consommation : contrôle des avis,
// dates, critère de classement, contrepartie, délais de publication et de conservation.
// Les valeurs chiffrées viennent de REVIEWS_RULES (lib/reviewsSettings.js).
// ============================================================

const CONTACT_EMAIL = "bagues.mandala@proton.me";

const Section = ({ id, title, children }) => (
  <section id={id} className="mt-9">
    <h2 className="font-serif text-2xl mb-3 text-[#412f3b]">{title}</h2>
    <div className="space-y-3 text-[15px] leading-7 text-[#54434c]">{children}</div>
  </section>
);

export async function getServerSideProps({ res }) {
  const setting = await fetchReviewsSetting(supabase);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (!setting.enabled) return { notFound: true };
  return { props: { mode: setting.mode } };
}

export default function CharteDesAvis({ mode }) {
  const r = REVIEWS_RULES;
  const starsOnly = mode === "stars";
  const maxChars = r.maxCommentLength.toLocaleString("fr-FR");
  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Charte des avis clientes – Zenoria</title>
      </Head>

      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl text-[#412f3b]">Charte des avis clientes</h1>
        <p className="mt-4 text-[15px] leading-7 text-[#54434c]">
          Vos avis aident d&apos;autres clientes à choisir leur bijou. Cette charte explique comment ils sont recueillis, contrôlés et publiés.
        </p>

        <Section id="qui" title="Qui peut déposer un avis ?">
          <p>Seules les clientes disposant d&apos;un compte et ayant reçu leur commande peuvent donner leur avis sur les bijoux achetés. Chaque avis porte ainsi la mention « Achat vérifié ».</p>
        </Section>

        <Section id="quand" title="Quand ?">
          <p>Pendant les {r.windowDays} jours qui suivent la livraison.</p>
        </Section>

        <Section id="contenu" title="Contenu d'un avis">
          {starsOnly ? (
            <p>Un avis se compose d&apos;une note de 1 à 5 étoiles. Les commentaires écrits ne sont actuellement pas publiés.</p>
          ) : (
            <p>Une note de 1 à 5 étoiles (obligatoire) et un commentaire facultatif de {maxChars} caractères maximum.</p>
          )}
        </Section>

        <Section id="controle" title="Contrôle des avis">
          <p>Chaque avis est relu par notre équipe avant publication, sous {r.moderationDays} jours ouvrés maximum. Nous ne modifions jamais le contenu d&apos;un avis, et nous publions aussi bien les avis positifs que les avis négatifs.</p>
          <p>Un avis peut être refusé uniquement s&apos;il contient des propos injurieux ou discriminatoires, des données personnelles, de la publicité, ou s&apos;il ne concerne pas le produit. Son autrice est alors informée du motif du refus dans son espace « Mes commandes &amp; avis ».</p>
        </Section>

        <Section id="affichage" title="Affichage et classement">
          <p>Les avis sont présentés du plus récent au plus ancien. Chaque avis affiche sa date de publication et la date de la commande concernée. La note moyenne d&apos;un bijou apparaît à partir de {r.minReviewsForAverage} avis publiés.</p>
          {!starsOnly && <p>Zenoria peut répondre publiquement à un avis ; la réponse est affichée sous l&apos;avis concerné.</p>}
        </Section>

        <Section id="contrepartie" title="Contrepartie">
          <p>Aucune contrepartie n&apos;est offerte en échange d&apos;un avis.</p>
        </Section>

        <Section id="duree" title="Durée de publication">
          <p>Un avis reste en ligne {r.publicationYears} ans. Son autrice peut le retirer à tout moment depuis son espace « Mes commandes &amp; avis », ou en nous écrivant.</p>
        </Section>

        <Section id="donnees" title="Vos données">
          <p>
            Le traitement des données liées aux avis est décrit dans notre{" "}
            <a href="/confidentialite#avis" className="underline text-[#8f6075]">politique de confidentialité</a>.
          </p>
        </Section>

        <Section id="contact" title="Contact">
          <p>
            Pour toute question sur un avis :{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-[#8f6075]">{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </main>
    </div>
  );
}
