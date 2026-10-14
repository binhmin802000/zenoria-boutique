import React, { useEffect, useRef, useState } from "react";
import { Info, RefreshCw, ArrowRight } from "lucide-react";
import Mannequin from "@/components/Mannequin";
import SeasonIcon from "@/components/SeasonIcon";
import { getMediaUrl } from "@/lib/supabase";
import { HAIR, EYES, SKIN, SEASON_WHY, traitLabels, borderlineNote } from "@/lib/colorEngine";
import { OCCASIONS, AVOID, outfitFor, occasionByKey, flatteringGarment } from "@/lib/quizOutfits";

// ============================================================
// QUIZ — le résultat : carte « révélation », bagues conseillées, couleurs de vêtements, barre compacte.
// Composant d'affichage : l'état et les actions viennent de pages/quiz.js.
//
// Rappel de ton : c'est un conseil d'inspiration fondé sur les quatre saisons, jamais un « diagnostic ».
// ============================================================

const formatPrice = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

// Vignette d'une bague : la vraie photo, ou un visuel de remplacement si elle ne charge pas
function RingThumb({ product }) {
  const [failed, setFailed] = useState(false);
  const src = product && product.photos && product.photos[0] ? getMediaUrl(product.photos[0], product.slug) : null;
  if (src && !failed) {
    return (
      <div className="relative h-48 sm:h-full min-h-[150px] overflow-hidden bg-[#f5edf1]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={product.name} onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover object-center" />
      </div>
    );
  }
  return (
    <div className={`relative h-48 sm:h-full min-h-[150px] bg-gradient-to-br ${(product && product.color) || "from-rose-300 via-pink-100 to-white"} grid place-items-center text-5xl`} aria-hidden="true">
      {(product && product.stone) || "💎"}
    </div>
  );
}

function Dots({ colors, className = "h-6 w-6 border-2 border-white shadow" }) {
  return (colors || []).map((d, i) => <i key={i} className={`rounded-full ${className}`} style={{ background: d }} />);
}

export default function QuizResult({ profile, rec, views, catalog, productsBySlug, occasion, outfitIndex, onOccasion, onOutfit, onRestart, onEdit, onAdd, onView }) {
  const revRef = useRef(null);
  const headingRef = useRef(null);
  const [barVisible, setBarVisible] = useState(false);

  // Le titre reçoit le focus à l'arrivée sur le résultat
  useEffect(() => {
    if (headingRef.current) headingRef.current.focus({ preventScroll: true });
  }, []);

  // La barre compacte apparaît quand la carte « révélation » est sortie de l'écran par le haut
  useEffect(() => {
    const el = revRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const en = entries[entries.length - 1];
        setBarVisible(!en.isIntersecting && en.boundingClientRect.top < 0);
      },
      { rootMargin: "-90px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!rec) return null;
  const { result, picks, thin } = rec;
  const P = views[result.primary];
  const S2 = views[result.secondary];
  const h = HAIR[profile.hair];
  const e = EYES[profile.eye];
  const s = SKIN[profile.skin];
  const names = { [result.primary]: P.name, [result.secondary]: S2.name };
  const frontier = borderlineNote(result, names);
  const occ = occasionByKey(occasion);
  const outfit = outfitFor(result.primary, occ);
  const garmentIndex = Math.min(Math.max(outfitIndex, 0), Math.max(outfit.length - 1, 0));
  const garment = outfit[garmentIndex] ? outfit[garmentIndex][1] : null;
  const avoid = AVOID[result.primary] || [];

  const choice = (label, o) => (
    <span key={label} className="inline-flex items-center gap-2 rounded-full bg-white border border-[#e3d3da] pl-1.5 pr-3 py-1 text-sm">
      <i className="h-5 w-5 rounded-full border border-black/10" style={{ background: o.hex }} />
      <span className="text-[#8b737e] text-xs">{label}</span> {o.name}
    </span>
  );
  const kindLabel = (p, i) => {
    if (p.kind === "best") return "Notre meilleure correspondance";
    if (p.kind === "season") return `Saison ${P.name}`;
    if (p.kind === "also") return `Pensée aussi pour ${P.name}`;
    return `Saison voisine : ${(views[p.collection.seasonKey] || S2).name}`;
  };

  return (
    <div data-testid="quiz-result">
      {/* Barre compacte : visible au défilement */}
      {barVisible && (
        <div className="fixed inset-x-0 top-20 z-30 border-b border-[#eadfe4] bg-white/95 backdrop-blur" data-testid="quiz-compact-bar">
          <div className="max-w-6xl mx-auto px-5 h-12 flex items-center gap-3 min-w-0">
            <span className="text-[#8f6075] shrink-0"><SeasonIcon season={result.primary} size={20} /></span>
            <span className="text-sm text-[#6b5a63] hidden sm:inline">Votre palette :</span>
            <strong className="font-serif text-lg">{P.name}</strong>
            <span className="flex gap-1 ml-1"><Dots colors={P.dots} className="h-3.5 w-3.5 border border-black/10" /></span>
            <button type="button" onClick={onRestart} className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#d9c5cc] hover:bg-[#f5edf1] px-4 h-8 text-xs">
              <RefreshCw size={14} /> Recommencer
            </button>
          </div>
        </div>
      )}

      {/* Carte « révélation » */}
      <section id="rev-card" ref={revRef} data-testid="rev-card" className="rounded-[2.5rem] border border-white shadow-[0_30px_80px_rgba(91,54,77,.12)] overflow-hidden" style={{ background: P.grad }}>
        <div className="grid md:grid-cols-[300px_minmax(0,1fr)] gap-6 md:gap-10 items-center p-6 sm:p-8 md:p-10">
          <div className="mx-auto w-[220px] md:w-full max-w-[300px]">
            <div className="rounded-full bg-white shadow-xl p-1.5">
              <Mannequin hair={h.hex} eye={e.hex} skin={s.hex} garment={flatteringGarment(result.primary)} label={`Mannequin avec vos couleurs : cheveux ${h.name}, yeux ${e.name}, peau ${s.name}`} />
            </div>
          </div>
          <div className="min-w-0 text-center md:text-left">
            <div className="text-xs tracking-[.3em] uppercase text-[#7a5a6a]">Votre palette</div>
            <h1 ref={headingRef} tabIndex={-1} data-testid="quiz-season-name" className="font-serif text-5xl sm:text-6xl md:text-7xl leading-none mt-2 flex items-center gap-4 justify-center md:justify-start text-[#412f3b] outline-none">
              <span className="text-[#5c4452]"><SeasonIcon season={result.primary} size={44} /></span>
              {P.name}
            </h1>
            <p className="font-serif italic text-xl text-[#594856] mt-3">{P.tagline}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 justify-center md:justify-start">
              {traitLabels(result.primary).map((t) => (
                <span key={t} className="rounded-full bg-white/80 border border-white px-3.5 py-1 text-sm">{t}</span>
              ))}
              <span className="text-sm text-[#6b5a63] ml-1" data-testid="quiz-neighbour">Saison voisine : {S2.name}</span>
            </div>
            {frontier && (
              <p data-testid="quiz-frontier" className="mt-3 text-sm text-[#6b4a5b] max-w-xl leading-6 mx-auto md:mx-0">{frontier}</p>
            )}
            <p className="text-[#4f4249] mt-4 max-w-xl leading-7 mx-auto md:mx-0">{SEASON_WHY[result.primary]}</p>
            <div className="mt-5 flex gap-1.5 justify-center md:justify-start"><Dots colors={P.dots} /></div>
            <div className="mt-5 rounded-2xl bg-white/70 backdrop-blur px-4 py-3 text-left" data-testid="quiz-choices">
              <div className="text-[10px] uppercase tracking-widest text-[#8b6578] mb-2">Vos choix</div>
              <div className="flex flex-wrap items-center gap-2">
                {choice("Cheveux", h)}
                {choice("Yeux", e)}
                {choice("Peau", s)}
                <span className="text-[#8f6075]" aria-hidden="true"><ArrowRight size={16} /></span>
                <span className="font-serif text-lg text-[#412f3b]">{P.name}</span>
              </div>
              <button type="button" onClick={onEdit} data-testid="quiz-edit" className="mt-2 text-xs text-[#8f6075] underline underline-offset-2">
                Modifier mes choix
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Bagues conseillées */}
      <div className="mt-10 space-y-5">
        <h2 className="font-serif text-3xl">Les bagues qui vous mettent en valeur</h2>
        {catalog.loading && <p className="text-sm text-[#8b737e]" data-testid="quiz-loading">Chargement des bagues…</p>}
        {!catalog.loading && picks.length === 0 && (
          <p className="text-sm text-[#6b5a63] rounded-2xl border-2 border-dashed border-[#e3d3da] px-5 py-6" data-testid="quiz-no-picks">
            Notre catalogue est en cours de mise à jour : revenez bientôt découvrir les bagues {P.name}.
          </p>
        )}
        {picks.map((p, i) => {
          const prod = productsBySlug.get(p.collection.slug);
          return (
            <article key={p.collection.slug} data-testid="quiz-pick" data-slug={p.collection.slug} data-kind={p.kind} className="rounded-[1.5rem] border border-[#eee2e5] bg-white overflow-hidden grid sm:grid-cols-[170px_minmax(0,1fr)]">
              <RingThumb product={prod} />
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${p.kind === "neighbour" ? "bg-[#f3f1f5] text-[#6b6272]" : "bg-[#f1e3ea] text-[#6d4a5b]"}`}>
                    <i className="h-2 w-2 rounded-full" style={{ background: (views[p.collection.seasonKey] || P).dots[0] || "#8f6075" }} />
                    {kindLabel(p, i)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-3">
                  <div className="font-serif text-2xl">{p.collection.name}</div>
                  {prod && prod.price !== null && (
                    <div className="font-medium whitespace-nowrap">
                      {prod.promoPrice !== null && <span className="line-through text-[#8b737e] mr-1.5 font-normal">{formatPrice(prod.price)}</span>}
                      <span className={prod.promoPrice !== null ? "text-[#b2544a]" : ""}>{formatPrice(prod.promoPrice !== null ? prod.promoPrice : prod.price)}</span>
                    </div>
                  )}
                </div>
                {prod && prod.energy && <p className="text-sm text-[#70656a] mt-1">{prod.energy}</p>}
                <p className="text-sm text-[#54434c] leading-6 mt-2" data-testid="quiz-pick-why">
                  <strong className="font-medium">Pourquoi elle vous va.</strong> {p.why}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {prod && onView ? (
                    <button type="button" onClick={() => onView(prod, p)} data-testid="quiz-view" className="rounded-full border border-[#b88d9f] px-4 py-1.5 text-sm text-[#54434c] hover:bg-[#f5edf1]">
                      Voir la bague
                    </button>
                  ) : (
                    <a href={`/#bague=${encodeURIComponent(p.collection.slug)}`} data-testid="quiz-view-link" className="rounded-full border border-[#b88d9f] px-4 py-1.5 text-sm text-[#54434c] hover:bg-[#f5edf1]">
                      Voir la bague
                    </a>
                  )}
                  {prod && (
                    <button type="button" onClick={() => onAdd(prod)} data-testid="quiz-add" className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 py-1.5 text-sm">
                      Ajouter au panier
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!catalog.loading && thin && (
          <div className="rounded-2xl border-2 border-dashed border-[#e3d3da] px-5 py-4 text-sm text-[#756a70] leading-6" data-testid="quiz-thin">
            <strong className="font-medium text-[#54434c]">Peu de bagues {P.name} pour l&apos;instant.</strong> Nous avons complété avec la saison voisine.
          </div>
        )}
        <div className="rounded-2xl bg-[#faf6f8] border border-[#eee2e5] px-5 py-3.5 text-sm text-[#6b5a63] leading-6 flex gap-3" data-testid="quiz-handmade">
          <span className="mt-0.5 text-[#8f6075] shrink-0"><Info size={16} /></span>
          <span>
            <strong className="font-medium text-[#54434c]">Façonnée à la main, à l&apos;image près.</strong> Chaque bague est façonnée à la main : de légères variations de teinte d&apos;une pièce à l&apos;autre sont normales, et la couleur affichée à l&apos;écran peut différer de celle du cristal.
          </span>
        </div>
      </div>

      {/* Couleurs de vêtements */}
      <div className="mt-12" data-testid="quiz-tryon">
        <h2 className="font-serif text-3xl">Les couleurs de vêtements qui vont avec</h2>
        <p className="text-sm text-[#756a70] mt-1 mb-5">Choisissez une occasion, puis touchez une couleur pour habiller le mannequin.</p>
        <div className="grid sm:grid-cols-[200px_minmax(0,1fr)] gap-6 items-start">
          <div className="mx-auto w-[180px] sm:w-full">
            <div className="rounded-full bg-white border border-[#eee2e5] shadow-lg p-1.5">
              <Mannequin hair={h.hex} eye={e.hex} skin={s.hex} garment={garment} label={garment ? `Mannequin habillé en ${outfit[garmentIndex][0]}` : undefined} />
            </div>
            {outfit[garmentIndex] && (
              <div className="mt-3 text-center text-sm">
                <span className="text-[#8b737e]">Avec :</span> <strong className="font-medium" data-testid="quiz-garment-name">{outfit[garmentIndex][0]}</strong>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Occasion">
              {OCCASIONS.map((o) => (
                <button key={o.key} type="button" onClick={() => onOccasion(o.key)} aria-pressed={occ.key === o.key} data-testid="quiz-occasion" data-key={o.key} className={`rounded-full border px-4 h-9 text-sm whitespace-nowrap ${occ.key === o.key ? "bg-[#8f6075] text-white border-[#8f6075]" : "bg-white text-[#54434c] border-[#d9c5cc] hover:bg-[#f5edf1]"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-[1.5rem] bg-white border border-[#eee2e5] p-5">
              <p className="text-sm text-[#54434c] leading-6" data-testid="quiz-occasion-text">{occ.text}</p>
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                {outfit.map((g, i) => (
                  <button key={g[1]} type="button" onClick={() => onOutfit(i)} aria-pressed={garmentIndex === i} data-testid="quiz-outfit" data-index={i} className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${garmentIndex === i ? "border-[#8f6075] bg-[#faf3f6] ring-1 ring-[#8f6075]" : "border-[#eee2e5] bg-white hover:bg-[#faf6f8]"}`}>
                    <span className="h-12 w-12 shrink-0 rounded-xl border border-black/10" style={{ background: g[1] }} />
                    <span>
                      <span className="block text-sm font-medium">{g[0]}</span>
                      <span className="block text-[11px] text-[#8b737e]">{i === 0 ? "Couleur principale" : "Alternative"}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-[#f0e6ea] flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs uppercase tracking-widest text-[#9a7384]">Plutôt à éviter près du visage</span>
                {avoid.map((a, i) => (
                  <React.Fragment key={a[0]}>
                    {i > 0 && <span className="mx-1 text-[#d9c5cc]" aria-hidden="true">·</span>}
                    <span className="inline-flex items-center gap-2 text-xs text-[#756a70]">
                      <i className="h-4 w-4 rounded-full border border-black/10" style={{ background: a[1] }} />
                      {a[0]}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <button type="button" onClick={onRestart} data-testid="quiz-restart" className="rounded-full border border-[#d9c5cc] bg-white hover:bg-[#f5edf1] px-6 h-11 text-sm inline-flex items-center gap-2">
          <RefreshCw size={16} /> Recommencer
        </button>
        <a href={`/#saison=${encodeURIComponent(result.primary)}`} data-testid="quiz-see-season" className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-6 h-11 text-sm inline-flex items-center">
          Voir toute la saison {P.name}
        </a>
      </div>
      <p className="text-[11px] text-[#8b737e] leading-5 max-w-2xl mt-5">
        Conseil d&apos;inspiration, fondé sur la colorimétrie des quatre saisons. Ce n&apos;est pas une analyse professionnelle : la méthode est une simplification, et votre ressenti compte autant. Rien n&apos;est enregistré.
      </p>
    </div>
  );
}
