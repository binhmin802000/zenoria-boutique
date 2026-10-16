// ZENORIA_MENTIONS_LEGALES_V1
import React from "react";
import Head from "next/head";

// ============================================================
// PAGE « MENTIONS LÉGALES & CGV » — /mentions-legales
//
// VERSION PROVISOIRE : les passages « À COMPLÉTER » doivent être renseignés, et l'ensemble relu
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
        <title>Mentions légales &amp; CGV – Zenoria</title>
        <meta name="robots" content="noindex" />
      </Head>

      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl text-[#412f3b]">Mentions légales &amp; Conditions générales de vente</h1>
        <p className="text-sm text-[#8b737e] mt-2">Dernière mise à jour : 16 octobre 2026</p>

        <div data-testid="draft-notice" className="mt-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[13px] leading-5 px-4 py-3">
          Version provisoire : les passages surlignés doivent être complétés et le texte relu avant l&apos;ouverture de la boutique.
        </div>

        <Section id="editeur" title="Qui édite ce site ?">
          <p>
            Le site Zenoria est édité par <Todo>nom et prénom, micro-entrepreneur (entreprise individuelle), adresse du siège de l&apos;activité</Todo>, immatriculé sous le numéro SIRET <Todo>numéro SIRET</Todo>.
          </p>
          <p>
            Contact : <Todo>adresse e-mail professionnelle</Todo> — <Todo>numéro de téléphone non surtaxé</Todo>.
          </p>
          <p>
            TVA non applicable, article 293 B du Code général des impôts <Todo>à confirmer selon le régime fiscal réellement choisi</Todo>.
          </p>
          <p>
            Directeur de la publication : <Todo>nom et prénom</Todo>.
          </p>
        </Section>

        <Section id="hebergement" title="Hébergement">
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Vercel Inc.</strong>, 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis — hébergement du site.</li>
            <li><strong>Supabase Inc.</strong> — hébergement de la base de données, de l&apos;authentification et des fichiers.</li>
          </ul>
        </Section>

        <Section id="propriete" title="Propriété intellectuelle">
          <p>
            L&apos;ensemble des éléments présents sur le site (textes, photographies, vidéos, logos, charte graphique, nom « Zenoria ») est protégé par le droit de la propriété intellectuelle. Toute reproduction non autorisée est interdite.
          </p>
        </Section>

        <Section id="produits" title="Les produits">
          <p>
            Les bagues proposées sont façonnées à la main en cristaux Swarovski, réparties en collections saisonnières. En cas de rupture de stock, le produit reste commandable avec un délai de fabrication complémentaire affiché sur la fiche produit.
          </p>
        </Section>

        <Section id="prix-commande" title="Prix et commande">
          <p>
            Les prix sont indiqués en euros, toutes taxes comprises. Les frais de livraison sont indiqués avant la validation définitive de la commande. La commande n&apos;est définitive qu&apos;après confirmation du paiement.
          </p>
        </Section>

        <Section id="paiement" title="Paiement">
          <p>
            Le paiement s&apos;effectue en ligne, par carte bancaire, via la plateforme sécurisée Stripe. Vos coordonnées bancaires ne sont à aucun moment transmises ou conservées par Zenoria : elles sont traitées directement par Stripe, certifié PCI-DSS.
          </p>
        </Section>

        <Section id="livraison" title="Livraison">
          <p>
            Les produits sont livrés à l&apos;adresse indiquée lors de la commande, en France métropolitaine. Les délais de livraison incluent, le cas échéant, le délai de fabrication artisanale complémentaire, clairement indiqué avant la validation de la commande.
          </p>
        </Section>

        <Section id="retractation" title="Droit de rétractation">
          <p>
            Conformément aux articles L. 221-18 et suivants du Code de la consommation, vous disposez d&apos;un délai de 14 jours calendaires à compter de la réception du bien pour exercer votre droit de rétractation, sans avoir à justifier de motif ni à payer de pénalité, à l&apos;exception des frais de retour qui restent à votre charge.
          </p>
          <p>
            Pour exercer ce droit, notifiez votre décision avant l&apos;expiration du délai (e-mail, courrier, ou le formulaire ci-dessous). Le remboursement intervient dans un délai maximal de 14 jours suivant la réception du bien retourné.
          </p>
          <p className="text-[13px] text-[#8b737e] italic">
            Si une bague est réalisée sur mesure selon vos spécifications propres, l&apos;article L. 221-28 du Code de la consommation peut exclure le droit de rétractation pour cet article — <Todo>préciser si ce cas s&apos;applique à votre catalogue</Todo>.
          </p>
        </Section>

        <Section id="garanties" title="Garanties légales">
          <p>
            Tous les produits bénéficient de la garantie légale de conformité (articles L. 217-3 et suivants du Code de la consommation) et de la garantie légale contre les vices cachés (articles 1641 et suivants du Code civil).
          </p>
        </Section>

        <Section id="mediation" title="Médiation de la consommation">
          <p>
            Conformément à l&apos;article L. 616-1 du Code de la consommation, en cas de litige non résolu directement avec le service client, vous pouvez recourir gratuitement à un médiateur de la consommation : <Todo>nom et coordonnées du médiateur choisi et adhéré</Todo>.
          </p>
        </Section>

        <Section id="droit-applicable" title="Droit applicable">
          <p>
            Les présentes conditions sont soumises au droit français. En cas de litige non résolu à l&apos;amiable ou par médiation, les tribunaux français compétents seront saisis selon les règles de droit commun applicables en matière de consommation.
          </p>
        </Section>

        <Section id="formulaire-retractation" title="Formulaire type de rétractation">
          <div className="rounded-xl bg-white border border-[#eadfe4] px-5 py-4 text-[14px] leading-6">
            <p className="mb-2">(Complétez et envoyez ce formulaire uniquement si vous souhaitez vous rétracter.)</p>
            <p>À l&apos;attention de <Todo>nom et adresse e-mail de contact</Todo> :</p>
            <p>Je notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :</p>
            <p>Commandé le / reçu le : ..................................................................</p>
            <p>Numéro de commande : ..................................................................</p>
            <p>Nom du consommateur : ..................................................................</p>
            <p>Adresse du consommateur : ..................................................................</p>
            <p>Date : ..................................................................</p>
          </div>
        </Section>
      </main>
    </div>
  );
}
