// ZENORIA_CGV_V1
import React, { useEffect, useState } from "react";
import Head from "next/head";
import { supabase } from "@/lib/supabase";
import { fetchCgvText } from "@/lib/cgvSettings";

// ============================================================
// PAGE « CONDITIONS GÉNÉRALES DE VENTE » — /cgv
//
// Le texte est modifiable depuis /admin > Contenu du site > CGV.
// La date affichée est celle de la dernière vraie modification des
// CGV (clé site_settings dédiée, séparée des autres textes du site).
// ============================================================

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "Europe/Paris",
  });
}

// Transforme le texte brut des CGV en JSX simple : **gras**, puces (- ...),
// et paragraphes separes par une ligne vide. Le texte reste stocke brut
// en base ; cette mise en forme n'a lieu qu'a l'affichage.
function renderInline(line) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderCgvText(text) {
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((paragraph, pIdx) => {
    const rawLines = paragraph.split("\n").filter((l) => l.trim() !== "");
    const isList = rawLines.length > 0 && rawLines.every((l) => l.trim().startsWith("- "));
    if (isList) {
      return (
        <ul key={pIdx} className="list-disc pl-5 space-y-1 mb-5">
          {rawLines.map((l, i) => (
            <li key={i}>{renderInline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={pIdx} className="mb-5">
        {rawLines.map((l, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(l)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export default function Cgv() {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchCgvText(supabase).then((res) => {
      if (!alive) return;
      setText(res.text);
      setUpdatedAt(res.updatedAt);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-screen bg-[#fbf8f4] text-[#342b32]">
      <Head>
        <title>Conditions générales de vente – Zenoria</title>
        <meta name="robots" content="noindex" />
      </Head>
      <header className="border-b border-[#eadfe4] bg-[#fbf8f4]/95">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/"><img src="/images/logo-facture.png" alt="Zenoria" className="h-9 w-auto" /></a>
          <a href="/" className="text-sm text-[#8f6075] underline">Retour à la boutique</a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl text-[#412f3b]">Conditions générales de vente</h1>
        {updatedAt && (
          <p className="text-sm text-[#8b737e] mt-2">Dernière mise à jour : {formatDateTime(updatedAt)}</p>
        )}
        {loading ? (
          <p className="text-sm text-[#8b737e] mt-8">Chargement…</p>
        ) : text ? (
          <div data-testid="cgv-content" className="mt-8 text-[15px] leading-7 text-[#54434c]">
            {renderCgvText(text)}
          </div>
        ) : (
          <p data-testid="cgv-empty" className="mt-8 text-sm text-[#8b737e]">
            Les conditions générales de vente seront bientôt disponibles. Pour toute question, contactez-nous depuis la boutique.
          </p>
        )}
      </main>
    </div>
  );
}