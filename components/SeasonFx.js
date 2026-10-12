import React, { useEffect, useRef } from "react";
import { SeasonFxEngine } from "@/lib/seasonFx";

// ============================================================
// ANIMATION SAISONNIÈRE — un canvas posé au-dessus d'une section, qui ne gêne aucun clic
//
// À placer dans un conteneur « relative overflow-hidden » : le canvas en remplit la surface.
//  - season : « printemps » | « ete » | « automne » | « hiver », ou null pour ne rien animer ;
//  - le dessin et toutes les protections (mouvement réduit, pause hors écran) sont dans lib/seasonFx.js.
// ============================================================

export default function SeasonFx({ season }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    engineRef.current = new SeasonFxEngine(canvasRef.current);
    return () => {
      if (engineRef.current) engineRef.current.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.setSeason(season || null);
  }, [season]);

  return <canvas ref={canvasRef} data-testid="season-fx" aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" />;
}
