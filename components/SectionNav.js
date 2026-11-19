import React, { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { computeSectionTargets, scrollTopFor, SECTION_NAV_MIN_SCROLL, SECTION_NAV_IDLE_MS } from "@/lib/sectionNav";

// ZENORIA_SECTION_NAV_V1 : bouton flottant de l'accueil (section precedente / suivante).
// - Ordinateur : tres attenue au repos, visible au survol, au defilement et au clavier (Tab).
// - Mobile : invisible au repos, reapparait au toucher ou au defilement, disparait apres 2,5 s.
// - Masque en haut de page et quand une fenetre est ouverte (prop hidden).
// - Les sections absentes ou masquees (ex. saisons non chargees) sont ignorees ; positions relues a chaque clic.
function readSections(list) {
  if (typeof document === "undefined") return [];
  return list
    .map((s) => {
      const el = document.getElementById(s.id);
      if (!el || el.offsetParent === null) return null;
      return { ...s, top: el.getBoundingClientRect().top + window.scrollY };
    })
    .filter(Boolean);
}

function NavButton({ onClick, disabled, label, testId, children }) {
  return (
    <div className="group relative flex items-center justify-end">
      <span aria-hidden="true" className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap rounded-full bg-[#3b2b39]/85 px-3 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 sm:block">
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        className="grid h-11 w-11 place-items-center rounded-full border border-[#d9c5cc] bg-white/75 text-[#8f6075] shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8f6075] disabled:cursor-default disabled:opacity-35"
      >
        {children}
      </button>
    </div>
  );
}

export default function SectionNav({ sections, hidden = false }) {
  const [scrollY, setScrollY] = useState(0);
  const [targets, setTargets] = useState({ prev: null, next: null });
  const [active, setActive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const timer = useRef(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(hover: hover) and (pointer: fine)") : null;
    setCanHover(Boolean(mq && mq.matches));
    const refresh = () => {
      setScrollY(window.scrollY);
      setTargets(computeSectionTargets(readSections(sectionsRef.current), window.scrollY));
    };
    const wake = () => {
      setActive(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(false), SECTION_NAV_IDLE_MS);
    };
    const onScroll = () => { refresh(); wake(); };
    refresh();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", wake, { passive: true });
    window.addEventListener("resize", refresh);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("resize", refresh);
      clearTimeout(timer.current);
    };
  }, []);

  if (hidden || scrollY < SECTION_NAV_MIN_SCROLL) return null;

  const go = (direction) => {
    const fresh = computeSectionTargets(readSections(sections), window.scrollY);
    const target = direction === "up" ? fresh.prev : fresh.next;
    if (direction === "down" && !target) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: scrollTopFor(target), behavior: reduceMotion ? "auto" : "smooth" });
  };

  const visible = active || focused;
  const restClass = canHover ? "opacity-30 hover:opacity-100" : "opacity-0 pointer-events-none";
  const upLabel = targets.prev ? "Section précédente : " + targets.prev.label : "Haut de page";
  const downLabel = targets.next ? "Section suivante : " + targets.next.label : "Dernière section";

  return (
    <nav
      aria-label="Navigation entre les sections"
      data-testid="section-nav"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`fixed top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 transition-opacity duration-500 ${visible ? "opacity-100" : restClass}`}
      style={{ right: "max(12px, env(safe-area-inset-right))" }}
    >
      <NavButton onClick={() => go("up")} label={upLabel} testId="section-nav-up">
        <ChevronUp size={20} />
      </NavButton>
      <NavButton onClick={() => go("down")} disabled={!targets.next} label={downLabel} testId="section-nav-down">
        <ChevronDown size={20} />
      </NavButton>
    </nav>
  );
}
