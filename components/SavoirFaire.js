import React, { useState } from "react";
import { motion } from "framer-motion";
import { Gem, Palette, Link2, Circle } from "lucide-react";
import { getMediaUrl } from "@/lib/supabase";

// ============================================================
// SECTION « SAVOIR-FAIRE » — présentation de la fabrication
//
// Contenu basé uniquement sur les informations fournies :
// - bagues entièrement faites à la main
// - 50 mini cristaux (ou perles) Swarovski par bague, de couleurs différentes selon le modèle
// - un cabochon central, de couleur différente selon le modèle
// - cristaux superposés et liés par un fil de nylon
// - montés sur une bague en laiton de couleur cuivre
//
// Pour modifier un texte, changez simplement les phrases ci-dessous.
// ============================================================

const KEY_FIGURES = [
  { value: "50", label: "mini cristaux Swarovski par bague" },
  { value: "1", label: "cabochon central" },
  { value: "100 %", label: "fait main" },
];

const STEPS = [
  {
    icon: Palette,
    title: "Le choix des couleurs",
    text: "Chaque modèle suit sa propre palette : les mini cristaux Swarovski, ou perles, sont choisis dans des couleurs différentes pour composer l'harmonie de la bague.",
  },
  {
    icon: Gem,
    title: "Le cabochon central",
    text: "Au cœur de la bague, un cabochon aux couleurs propres à chaque modèle devient le point de départ de la création.",
  },
  {
    icon: Link2,
    title: "L'assemblage à la main",
    text: "Les 50 mini cristaux Swarovski, ou perles, sont superposés puis liés grâce à un fil de nylon, un geste réalisé entièrement à la main.",
  },
  {
    icon: Circle,
    title: "La monture en laiton cuivré",
    text: "L'ensemble est posé sur une bague en laiton de couleur cuivre, qui encadre la création.",
  },
];

export default function SavoirFaire({ product }) {
  const [imgError, setImgError] = useState(false);
  const photoSrc =
    product && product.photos && product.photos[0]
      ? getMediaUrl(product.photos[0], product.slug)
      : null;

  return (
    <section id="savoir-faire" className="bg-[#fbf8f4] py-24">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-14 items-center">
        {/* Visuel */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="relative flex justify-center"
        >
          <div className="relative w-[380px] max-w-[84vw] aspect-square rounded-full border border-white shadow-[0_30px_80px_rgba(91,54,77,.18)] overflow-hidden bg-gradient-to-br from-[#d8c4d9] via-[#f5e8e6] to-[#dbc9a9]">
            {photoSrc && !imgError ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoSrc}
                alt={`Bague ${product.name} réalisée à la main`}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full grid place-items-center">
                <Gem className="text-[#9b6980]" size={64} />
              </div>
            )}
          </div>
          <div className="absolute -bottom-3 right-2 sm:right-10 rounded-2xl bg-white/90 backdrop-blur px-5 py-3 shadow-lg border border-[#eee2e5]">
            <div className="text-[10px] uppercase tracking-[.25em] text-[#9a7384]">Fait main</div>
            <div className="font-serif text-lg text-[#412f3b]">Pièce par pièce</div>
          </div>
        </motion.div>

        {/* Texte */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          <div className="text-xs tracking-[.3em] text-[#9c7285] uppercase mb-3">Notre savoir-faire</div>
          <h2 className="font-serif text-4xl leading-tight text-[#412f3b] mb-5">
            Une bague,
            <br />
            cinquante cristaux Swarovski,
            <br />
            un geste à la main.
          </h2>
          <p className="text-[#6e6268] leading-7 max-w-xl mb-8">
            Chez Zenoria, chaque bague est entièrement réalisée à la main. Cinquante mini cristaux
            Swarovski, ou perles, sont assemblés autour d&apos;un cabochon central, dans une
            palette de couleurs pensée pour chaque modèle.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-9 max-w-md">
            {KEY_FIGURES.map((f) => (
              <div key={f.label} className="rounded-2xl bg-white border border-[#eee2e5] px-3 py-4 text-center">
                <div className="font-serif text-3xl text-[#8f6075]">{f.value}</div>
                <div className="text-[11px] leading-4 text-[#756a70] mt-1">{f.label}</div>
              </div>
            ))}
          </div>

          <ol className="space-y-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <div className="shrink-0 h-11 w-11 rounded-full bg-gradient-to-br from-[#f5e8e6] to-[#e6d6ea] border border-white grid place-items-center text-[#8f6075]">
                  <s.icon size={19} />
                </div>
                <div>
                  <div className="font-serif text-xl text-[#412f3b]">
                    <span className="text-[#b88d9f] mr-2 text-base">0{i + 1}</span>
                    {s.title}
                  </div>
                  <p className="text-sm leading-6 text-[#70656a] mt-1">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-[11px] leading-4 text-[#8b737e]">
            Swarovski® est une marque de son propriétaire. Zenoria est une marque indépendante,
            non affiliée à Swarovski.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
