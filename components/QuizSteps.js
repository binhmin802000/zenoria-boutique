import React, { useEffect, useRef } from "react";
import { Check, Info } from "lucide-react";
import Mannequin from "@/components/Mannequin";
import { HAIR, EYES, SKIN } from "@/lib/colorEngine";
import { QUIZ_STEPS } from "@/lib/quizState";

// ============================================================
// QUIZ — les trois étapes (cheveux, yeux, peau) avec le mannequin qui se colore à chaque choix.
// Composant d'affichage : l'état (choix, étape) est tenu par pages/quiz.js.
// ============================================================

// Nombre de colonnes de la grille de teintes selon la question (les classes restent écrites ici : Tailwind ne lit pas lib/)
const COLS = { hair: "grid-cols-4", eye: "grid-cols-3", skin: "grid-cols-4" };

const METAL_CHOICES = [
  { value: 1, label: "L'or me va mieux" },
  { value: -1, label: "L'argent me va mieux" },
  { value: 0, label: "Je ne sais pas" },
];

export default function QuizSteps({ profile, step, onPick, onMetal, onBack, onNext, showWhy, onToggleWhy }) {
  const st = QUIZ_STEPS[step];
  const selected = profile[st.key];
  const last = step === QUIZ_STEPS.length - 1;
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  // Au changement d'étape, le titre reçoit le focus (lecteurs d'écran, clavier) ; jamais au tout premier affichage
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (headingRef.current) headingRef.current.focus({ preventScroll: true });
  }, [step]);

  const chosen = [
    ["Cheveux", profile.hair !== null ? HAIR[profile.hair] : null],
    ["Yeux", profile.eye !== null ? EYES[profile.eye] : null],
    ["Peau", profile.skin !== null ? SKIN[profile.skin] : null],
  ];

  return (
    <div id="quiz-grid" data-testid="quiz-steps" className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-8 md:gap-12 items-start">
      {/* Mannequin : il se colore à chaque choix */}
      <div className="md:sticky md:top-28">
        <div className="rounded-[2rem] bg-white border border-[#eee2e5] shadow-[0_20px_60px_rgba(91,54,77,.10)] p-5">
          <div className="mx-auto max-w-[340px]">
            <Mannequin hair={chosen[0][1] && chosen[0][1].hex} eye={chosen[1][1] && chosen[1][1].hex} skin={chosen[2][1] && chosen[2][1].hex} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="quiz-recap">
            {chosen.map(([label, o]) => (
              <div key={label} className="rounded-xl bg-[#faf6f8] px-2 py-2">
                <div className="text-[10px] uppercase tracking-widest text-[#9a7384]">{label}</div>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-xs">
                  {o ? (
                    <>
                      <i className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: o.hex }} />
                      {o.name}
                    </>
                  ) : (
                    <span className="text-[#8b737e]">à choisir</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Étape en cours */}
      <div className="rounded-[2rem] bg-white border border-[#eee2e5] p-6 sm:p-8" data-testid="quiz-panel">
        <ol className="flex items-center mb-7" aria-label="Progression du quiz">
          {QUIZ_STEPS.map((s, i) => {
            const done = profile[s.key] !== null && i < step;
            const cur = i === step;
            return (
              <li key={s.key} aria-current={cur ? "step" : undefined} className={`flex items-center gap-2 ${i < 2 ? "flex-1" : ""}`}>
                <div className={`h-9 w-9 shrink-0 rounded-full grid place-items-center text-sm border ${cur ? "bg-[#8f6075] text-white border-[#8f6075]" : done ? "bg-[#f1e3ea] text-[#8f6075] border-[#e3cdd7]" : "bg-white text-[#7a6a72] border-[#e3d3da]"}`}>
                  {done ? <Check size={16} /> : i + 1}
                </div>
                <div className={`text-sm hidden sm:block ${cur ? "text-[#342b32] font-medium" : "text-[#8b737e]"}`}>{s.title}</div>
                {i < 2 && <div className="flex-1 h-px bg-[#e3d3da] mx-2" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        <div className="text-xs tracking-[.25em] uppercase text-[#9c7285]">Étape {step + 1} sur 3</div>
        <h2 ref={headingRef} tabIndex={-1} className="font-serif text-3xl mt-1 outline-none" data-testid="quiz-step-title">
          {st.title}
        </h2>
        <p className="text-[#6e6268] mt-2 leading-6 text-sm">{st.help}</p>

        <div className={`grid ${COLS[st.key]} gap-x-2 gap-y-4 mt-6`} role="group" aria-label={st.title}>
          {st.list.map((o, i) => {
            const on = selected === i;
            return (
              <button
                key={o.name}
                type="button"
                onClick={() => onPick(st.key, i)}
                aria-pressed={on}
                aria-label={o.name}
                data-testid="quiz-swatch"
                data-index={i}
                className="flex flex-col items-center gap-2 p-1 rounded-xl transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8f6075]"
              >
                <span className={`block h-14 w-14 sm:h-16 sm:w-16 rounded-full border border-black/10 shadow-inner ${on ? "ring-[3px] ring-offset-2 ring-[#8f6075]" : ""}`} style={{ background: o.hex }} />
                <span className={`text-xs leading-4 text-center ${on ? "text-[#342b32] font-medium" : "text-[#6b5a63]"}`}>{o.name}</span>
              </button>
            );
          })}
        </div>

        {st.key === "skin" && (
          <div className="mt-6 rounded-2xl bg-[#faf6f8] border border-[#eee2e5] p-4" data-testid="quiz-metal">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Pour affiner (facultatif)</div>
              <button type="button" onClick={onToggleWhy} aria-expanded={showWhy} data-testid="quiz-why-toggle" className="inline-flex items-center gap-1.5 text-xs text-[#8f6075] underline underline-offset-2">
                <Info size={14} /> Pourquoi cette question ?
              </button>
            </div>
            <div className="text-xs text-[#756a70] mt-1">Entre un bijou doré et un bijou argenté, lequel vous va le mieux ?</div>
            <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Métal qui vous va le mieux">
              {METAL_CHOICES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onMetal(m.value)}
                  aria-pressed={profile.metal === m.value}
                  data-testid="quiz-metal-choice"
                  data-value={m.value}
                  className={`rounded-full border px-4 h-9 text-sm ${profile.metal === m.value ? "bg-[#8f6075] text-white border-[#8f6075]" : "bg-white border-[#d9c5cc] text-[#54434c] hover:bg-[#f5edf1]"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {showWhy && (
              <div className="mt-4 rounded-xl bg-white border border-[#eee2e5] px-4 py-3 text-[13px] leading-6 text-[#54434c] space-y-2" data-testid="quiz-why-text">
                <p>Les stylistes observent quel métal flatte le plus le visage : l&apos;or éclaire souvent les teintes chaudes, l&apos;argent les teintes froides. C&apos;est un repère utile, car la couleur de la peau ou des cheveux peut être faussée par une coloration ou un bronzage.</p>
                <p>Nos bagues sont montées sur laiton de couleur cuivre, un métal chaud. Votre réponse nous permet de vous dire honnêtement si c&apos;est la pierre ou la monture qui fait l&apos;accord.</p>
                <p className="text-[#756a70]">Elle nuance votre résultat sans le décider à elle seule.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-8">
          <button
            type="button"
            onClick={onBack}
            disabled={step === 0}
            data-testid="quiz-back"
            className={`rounded-full px-5 h-11 text-sm ${step === 0 ? "text-[#c9bcc3] cursor-default" : "text-[#54434c] hover:bg-[#f5edf1] border border-[#d9c5cc]"}`}
          >
            Retour
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={selected === null}
            data-testid="quiz-next"
            className={`rounded-full px-7 h-11 text-sm text-white ${selected === null ? "bg-[#cdb4bf] cursor-not-allowed" : "bg-[#8f6075] hover:bg-[#71485b]"}`}
          >
            {last ? "Voir ma palette" : "Continuer"}
          </button>
        </div>
        <p className="text-[11px] text-[#8b737e] mt-5">Rien n&apos;est enregistré : vos choix restent sur votre appareil.</p>
      </div>
    </div>
  );
}
