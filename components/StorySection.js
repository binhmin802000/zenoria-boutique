import React, { useEffect, useRef, useState } from "react";
import TextLines from "@/components/TextLines";

// ============================================================
// SECTION « NOTRE HISTOIRE » (page d'accueil) — ZENORIA_STORY_REVIEWS_V1
//
// Textes : lib/siteTexts.js, groupe « story » (modifiables dans /admin > Contenu du site > Textes du site).
//   story_eyebrow, story_title, story_lead : visibles d'emblée ;
//   story_body : version longue, paragraphes séparés par une ligne vide ;
//   story_signature : phrase finale en italique doré.
// Le bouton « Découvrir notre histoire » du bloc philosophie envoie l'événement OPEN_STORY_EVENT :
// la section se déplie et vient à l'écran. L'adresse /#notre-histoire fait de même.
// ============================================================

export const OPEN_STORY_EVENT = "zenoria:open-story";

export function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function StorySection({ texts }) {
  const t = texts || {};
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const paragraphs = splitParagraphs(t.story_body);

  useEffect(() => {
    const reveal = () => {
      setOpen(true);
      // laisse React afficher la version longue avant de faire défiler
      setTimeout(() => {
        if (ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    };
    window.addEventListener(OPEN_STORY_EVENT, reveal);
    if (window.location.hash === "#notre-histoire") reveal();
    return () => window.removeEventListener(OPEN_STORY_EVENT, reveal);
  }, []);

  return (
    <section id="notre-histoire" ref={ref} data-testid="story-section" className="max-w-3xl mx-auto px-6 py-20 scroll-mt-24 text-center">
      {t.story_eyebrow && <p className="text-xs uppercase tracking-[.25em] text-[#b48a5a]">{t.story_eyebrow}</p>}
      <h2 className="font-serif text-4xl text-[#412f3b] mt-3">{t.story_title}</h2>
      <p className="font-serif text-lg leading-8 text-[#412f3b] mt-6">
        <TextLines text={t.story_lead} />
      </p>
      {open && (
        <div data-testid="story-more" className="mt-8">
          <div className="mx-auto mb-8 h-px w-12 bg-[#b48a5a]" />
          <div className="space-y-5 text-left text-[15px] leading-7 text-[#54434c]">
            {paragraphs.map((p, i) => (
              <p key={i}>
                <TextLines text={p} />
              </p>
            ))}
          </div>
          {t.story_signature && <p className="font-serif italic text-lg text-[#b48a5a] mt-8">{t.story_signature}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="story-toggle"
        className="mt-8 rounded-full border border-[#412f3b] text-[#412f3b] px-6 h-10 text-sm hover:bg-[#412f3b] hover:text-white transition-colors"
      >
        {open ? "Refermer" : "Lire notre histoire"}
      </button>
    </section>
  );
}
