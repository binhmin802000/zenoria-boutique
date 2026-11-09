// ZENORIA_PWA_V1 : nouveau fichier.
// pages/_document.js definit le HTML commun a toutes les pages (balise <html>,
// <head>, <body>) en Next.js (Pages Router). Il n'existait pas encore dans le
// projet : sans lui, Next.js utilise un document par defaut minimal.
//
// Ce fichier ajoute uniquement ce qui est necessaire a l'installation de
// l'application sur l'ecran d'accueil (PWA) : lien vers le manifest, couleur
// de la barre de navigation mobile, et balises specifiques a iOS (qui ne lit
// pas le manifest.json de la meme facon qu'Android/Chrome).
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="fr">
      <Head>
        {/* Installation sur l'ecran d'accueil (Android/Chrome) */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#8f6075" />

        {/* iOS (Safari) : balises specifiques, le manifest.json seul ne suffit pas */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Zenoria" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
