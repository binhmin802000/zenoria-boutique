import React from "react";
import Head from "next/head";

// ============================================================
// PAGE « POLITIQUE DE CONFIDENTIALITÉ » — /confidentialite
//
// VERSION PROVISOIRE : les passages « À COMPLÉTER » doivent être renseignés, et l'ensemble relu
// (idéalement par un juriste) avant l'ouverture de la boutique. Le texte décrit uniquement ce que
// le site fait aujourd'hui ; il faudra le mettre à jour quand le paiement en ligne sera actif.
//
// Le paragraphe sur le journal technique des erreurs correspond au fonctionnement réel de
// lib/errorLogger.js et de supabase_admin_diagnostic.sql : si l'un des deux change, changez l'autre.
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

export default function Confidentialite() {
  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Politique de confidentialité — Zenoria</title>
        <meta name="robots" content="noindex" />
      </Head>

      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-[.22em] text-[#412f3b]">ZENORIA</a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl text-[#412f3b]">Politique de confidentialité</h1>
        <p className="text-sm text-[#8b737e] mt-2">Dernière mise à jour : 11 octobre 2026</p>

        <div data-testid="draft-notice" className="mt-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[13px] leading-5 px-4 py-3">
          Version provisoire : les passages surlignés doivent être complétés et le texte relu avant l&apos;ouverture de la boutique.
        </div>

        <Section id="responsable" title="Qui est responsable de vos données ?">
          <p>
            Le site Zenoria est édité par <Todo>nom ou raison sociale, adresse, numéro d&apos;immatriculation éventuel</Todo>. Pour toute question sur vos données :{" "}
            <Todo>adresse e-mail de contact</Todo>.
          </p>
        </Section>

        <Section id="donnees" title="Quelles données collectons-nous, et pourquoi ?">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Votre compte.</strong> Si vous créez un compte, nous enregistrons votre adresse e-mail et votre mot de passe (conservé sous forme chiffrée par notre prestataire
              d&apos;authentification). Ces données servent à vous connecter et à vous envoyer les e-mails liés à votre compte (confirmation, mot de passe oublié).
            </li>
            <li>
              <strong>Les connexions à votre compte.</strong> Lors d&apos;une connexion, la date et l&apos;heure et, selon la configuration de notre prestataire, l&apos;adresse IP et le type de
              navigateur sont enregistrés. Seuls les administrateurs du site y ont accès, pour la sécurité des comptes. <Todo>durée de conservation</Todo>
            </li>
            <li>
              <strong>Votre panier.</strong> Il est conservé dans votre navigateur, sur votre appareil. Il n&apos;est pas envoyé à nos serveurs tant que vous ne passez pas commande.
            </li>
            <li>
              <strong>Commandes et paiement.</strong> Le paiement en ligne n&apos;est pas encore actif. <Todo>à compléter à l&apos;ouverture du paiement : données de commande et de livraison, prestataire de
              paiement, durées de conservation légales</Todo>
            </li>
          </ul>
        </Section>

        <Section id="journal" title="Journal technique des erreurs">
          <p>
            Pour repérer et corriger les défauts du site, une page qui rencontre une erreur envoie un court rapport technique. Ce rapport contient uniquement : le type d&apos;erreur, un message
            technique (nettoyé des adresses e-mail, des identifiants et des paramètres d&apos;adresse), la page concernée, et la famille de navigateur et de système (par exemple « Chrome · Windows »).
          </p>
          <p>
            Ce journal <strong>n&apos;enregistre ni votre adresse IP, ni votre adresse e-mail, ni l&apos;identifiant de votre compte, ni le contenu de votre panier</strong>. Les rapports identiques sont
            regroupés dans un compteur, et supprimés au bout de 30 jours. Seuls les administrateurs du site peuvent les consulter.
          </p>
          <p>
            Base légale : l&apos;intérêt légitime d&apos;assurer le bon fonctionnement et la sécurité du site. Vous pouvez vous y opposer en nous écrivant à l&apos;adresse de contact ci-dessus, même si ce journal
            ne permet pas de vous identifier.
          </p>
        </Section>

        {/* ZENORIA_STORY_REVIEWS_V1 : avis clientes et journal des connexions */}
        <Section id="avis" title="Avis clientes">
          <p>Si vous publiez un avis, nous traitons votre prénom suivi de l&apos;initiale de votre nom, votre note, votre commentaire, la date de l&apos;avis et le bijou concerné. L&apos;avis est rattaché à votre commande, pour garantir la mention « Achat vérifié ».</p>
          <p>Un avis reste en ligne pendant 3 ans, ou jusqu&apos;à ce que vous demandiez sa suppression à l&apos;adresse <a href="mailto:bagues.mandala@proton.me" className="underline text-[#8f6075]">bagues.mandala@proton.me</a>.</p>
        </Section>

        <Section id="connexions" title="Journal des connexions">
          <p>Pour la sécurité de votre compte, nous enregistrons les connexions, déconnexions, inscriptions et changements de mot de passe : adresse e-mail, date, heure et adresse IP. Ce journal sert uniquement à détecter et analyser les accès anormaux.</p>
          <p>Ces données sont conservées 12 mois, puis supprimées.</p>
        </Section>

        <Section id="cookies" title="Cookies et stockage dans votre navigateur">
          <p>
            Le site n&apos;utilise ni cookie publicitaire ni outil de mesure d&apos;audience. Il utilise le stockage local de votre navigateur pour conserver votre panier et, si vous êtes connecté(e), votre
            session. Ces éléments sont nécessaires au fonctionnement du site.
          </p>
        </Section>

        <Section id="prestataires" title="Qui héberge et traite vos données ?">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Vercel</strong> héberge le site. <Todo>lieu d&apos;hébergement et garanties pour les transferts hors Union européenne</Todo>
            </li>
            <li>
              <strong>Supabase</strong> héberge la base de données, l&apos;authentification et les fichiers (photos et vidéos). Les données sont hébergées dans l&apos;Union européenne (Irlande, région eu-west-1). <Todo>garanties pour les éventuels transferts hors Union européenne</Todo>
            </li>
            <li>
              <strong>Resend</strong> envoie les e-mails liés aux comptes. <Todo>lieu de traitement et garanties de transfert</Todo>
            </li>
          </ul>
        </Section>

        <Section id="droits" title="Vos droits">
          <p>
            Vous pouvez demander l&apos;accès à vos données, leur rectification ou leur effacement, vous opposer à un traitement, ou en demander la limitation, en écrivant à l&apos;adresse de contact ci-dessus.
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (<a href="https://www.cnil.fr" className="text-[#8f6075] underline" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
          </p>
        </Section>
      </main>
    </div>
  );
}
