// ZENORIA_CARE_INFO_V1
import React from "react";
import { parseCareInfoContent } from "@/lib/careInfoSettings";
// ============================================================
// Affiche un texte d'entretien (balisage **gras** / __souligné__, paragraphes separes par une
// ligne vide) en JSX simple. Logique de decoupage dans lib/careInfoSettings.js (testee a part) ;
// ce composant ne fait que transformer les segments en <strong>/<u>, sans aucun HTML stocke.
// ============================================================
export default function CareInfoText({ content, className = "", ...rest }) {
  const paragraphs = parseCareInfoContent(content);
  return (
    <div className={className} {...rest}>
      {paragraphs.map((lines, pIdx) => (
        <p key={pIdx} className="mb-4 last:mb-0">
          {lines.map((segments, lIdx) => (
            <React.Fragment key={lIdx}>
              {lIdx > 0 && <br />}
              {segments.map((seg, sIdx) => {
                let node = seg.text;
                if (seg.underline) node = <u key="u">{node}</u>;
                if (seg.bold) node = <strong key="b" className="font-medium">{node}</strong>;
                return <React.Fragment key={sIdx}>{node}</React.Fragment>;
              })}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
