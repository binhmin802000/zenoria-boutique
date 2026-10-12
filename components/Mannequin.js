import React, { useId } from "react";
import { mannequinPalette } from "@/lib/colorEngine";

// ============================================================
// MANNEQUIN — illustration vectorielle originale (buste), dessinée pour Zenoria.
// Les couleurs (cheveux, yeux, peau, vêtement) viennent des props : le dessin change en direct, sans image à charger.
// Le calcul des nuances dérivées est dans lib/colorEngine.js (mannequinPalette), testé séparément.
// ============================================================

// La transition douce des couleurs est coupée pour les visiteurs qui ont demandé moins de mouvement
const CSS = ".zq-mq .zq-svg{display:block;width:100%;height:auto}.zq-mq .zq-t{transition:fill .45s ease,stroke .45s ease}@media (prefers-reduced-motion:reduce){.zq-mq .zq-t{transition:none}}";

export default function Mannequin({ hair, eye, skin, garment, label = "Mannequin : aperçu des couleurs choisies", decorative = false, className = "" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = mannequinPalette({ hair, eye, skin, garment });
  const a11y = decorative ? { "aria-hidden": "true" } : { role: "img", "aria-label": label };
  return (
    <div className={`zq-mq ${className}`} data-testid="mannequin">
      <style>{CSS}</style>
      <svg viewBox="0 58 400 408" xmlns="http://www.w3.org/2000/svg" {...a11y} className="zq-svg">
        <defs>
          <radialGradient id={`${uid}-bg`} cx="50%" cy="38%" r="70%">
            <stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#f1e6ea"/>
          </radialGradient>
          <radialGradient id={`${uid}-face`} cx="50%" cy="42%" r="62%">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".30"/><stop offset="1" stopColor="#000000" stopOpacity=".0"/>
          </radialGradient>
          <linearGradient id={`${uid}-hairshine`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".22"/><stop offset=".5" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".12"/>
          </linearGradient>
          <radialGradient id={`${uid}-iris`} cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#000" stopOpacity=".0"/><stop offset=".72" stopColor="#000" stopOpacity=".10"/><stop offset="1" stopColor="#000" stopOpacity=".38"/>
          </radialGradient>
          <clipPath id={`${uid}-clipL`}><path d="M142 207 Q161 192 180 207 Q161 221 142 207Z"/></clipPath>
          <clipPath id={`${uid}-clipR`}><path d="M220 207 Q239 192 258 207 Q239 221 220 207Z"/></clipPath>
          <clipPath id={`${uid}-circ`}><circle cx="200" cy="262" r="198"/></clipPath>
        </defs>

        <circle cx="200" cy="262" r="198" fill={`url(#${uid}-bg)`}/>
        <g clipPath={`url(#${uid}-circ)`}>
         <g transform="translate(200 310) scale(0.92) translate(-200 -310)">
          {/* cheveux, arrière */}
          <path data-part="hair" className="zq-t" fill={c.hair} d="M200 50 C118 50 96 118 98 196 C100 262 84 306 66 352 C58 376 74 392 100 384 L132 372 L268 372 L300 384 C326 392 342 376 334 352 C316 306 300 262 302 196 C304 118 282 50 200 50Z"/>
          <path d="M200 50 C118 50 96 118 98 196 C100 262 84 306 66 352 C58 376 74 392 100 384 L132 372 L268 372 L300 384 C326 392 342 376 334 352 C316 306 300 262 302 196 C304 118 282 50 200 50Z" fill={`url(#${uid}-hairshine)`}/>

          {/* buste / vêtement */}
          <path data-part="garment" className="zq-t" fill={c.garment} d="M52 520 C54 440 84 392 150 372 C170 392 230 392 250 372 C316 392 346 440 348 520Z"/>
          <path d="M150 372 C170 392 230 392 250 372 C232 408 168 408 150 372Z" data-part="skin-dark" className="zq-t" fill={c.skinDark} opacity=".9"/>
          <path d="M52 520 C54 440 84 392 150 372 C130 400 112 450 108 520Z" fill="#000" opacity=".08"/>
          <path d="M348 520 C346 440 316 392 250 372 C270 400 288 450 292 520Z" fill="#000" opacity=".08"/>

          {/* cou */}
          <path data-part="skin" className="zq-t" fill={c.skin} d="M170 296 C170 340 164 362 150 372 C170 392 230 392 250 372 C236 362 230 340 230 296Z"/>
          <path data-part="skin-dark" className="zq-t" fill={c.skinDark} d="M170 296 C186 328 214 328 230 296 L230 320 C214 346 186 346 170 320Z" opacity=".55"/>

          {/* oreilles */}
          <ellipse data-part="skin" className="zq-t" fill={c.skin} cx="123" cy="214" rx="11" ry="19"/>
          <ellipse data-part="skin" className="zq-t" fill={c.skin} cx="277" cy="214" rx="11" ry="19"/>

          {/* visage */}
          <path data-part="skin" className="zq-t" fill={c.skin} d="M200 112 C150 112 122 150 122 206 C122 252 144 296 174 314 C190 323 210 323 226 314 C256 296 278 252 278 206 C278 150 250 112 200 112Z"/>
          <path d="M200 112 C150 112 122 150 122 206 C122 252 144 296 174 314 C190 323 210 323 226 314 C256 296 278 252 278 206 C278 150 250 112 200 112Z" fill={`url(#${uid}-face)`}/>
          <ellipse data-part="blush" className="zq-t" fill={c.blush} opacity=".38" cx="150" cy="248" rx="20" ry="12"/>
          <ellipse data-part="blush" className="zq-t" fill={c.blush} opacity=".38" cx="250" cy="248" rx="20" ry="12"/>

          {/* sourcils */}
          <path data-part="brow" className="zq-t" fill={c.brow} d="M140 183 Q160 170 183 179 Q162 177 142 189Z"/>
          <path data-part="brow" className="zq-t" fill={c.brow} d="M260 183 Q240 170 217 179 Q238 177 258 189Z"/>

          {/* yeux */}
          <g transform="translate(161 207) scale(1.22) translate(-161 -207)">
            <path d="M142 207 Q161 192 180 207 Q161 221 142 207Z" fill="#fbfbfb"/>
            <g clipPath={`url(#${uid}-clipL)`}>
              <circle data-part="eye" className="zq-t" fill={c.eye} cx="162" cy="207" r="14"/>
              <circle cx="162" cy="207" r="14" fill={`url(#${uid}-iris)`}/>
              <circle cx="162" cy="207" r="6.2" fill="#14110f"/>
              <circle cx="167" cy="202" r="3.2" fill="#fff" opacity=".9"/>
              <path d="M142 207 Q161 186 180 207 Q161 196 142 207Z" fill="#000" opacity=".16"/>
            </g>
            <path data-part="lash" className="zq-t" stroke={c.lash} d="M141 208 Q161 189 181 208" fill="none" strokeWidth="3.4" strokeLinecap="round"/>
            <path d="M146 213 Q161 222 176 213" fill="none" stroke="#000" strokeOpacity=".10" strokeWidth="1.6" strokeLinecap="round"/>
          </g>
          <g transform="translate(239 207) scale(1.22) translate(-239 -207)">
            <path d="M220 207 Q239 192 258 207 Q239 221 220 207Z" fill="#fbfbfb"/>
            <g clipPath={`url(#${uid}-clipR)`}>
              <circle data-part="eye" className="zq-t" fill={c.eye} cx="238" cy="207" r="14"/>
              <circle cx="238" cy="207" r="14" fill={`url(#${uid}-iris)`}/>
              <circle cx="238" cy="207" r="6.2" fill="#14110f"/>
              <circle cx="243" cy="202" r="3.2" fill="#fff" opacity=".9"/>
              <path d="M220 207 Q239 186 258 207 Q239 196 220 207Z" fill="#000" opacity=".16"/>
            </g>
            <path data-part="lash" className="zq-t" stroke={c.lash} d="M219 208 Q239 189 259 208" fill="none" strokeWidth="3.4" strokeLinecap="round"/>
            <path d="M224 213 Q239 222 254 213" fill="none" stroke="#000" strokeOpacity=".10" strokeWidth="1.6" strokeLinecap="round"/>
          </g>

          {/* nez */}
          <path d="M200 214 C198 238 192 252 188 262 Q200 270 212 262 C208 252 202 238 200 214Z" fill="#000" opacity=".05"/>
          <path d="M190 264 Q200 270 210 264" fill="none" stroke="#000" strokeOpacity=".18" strokeWidth="2.2" strokeLinecap="round"/>

          {/* bouche */}
          <path data-part="lip" className="zq-t" fill={c.lip} d="M175 288 Q187 280 200 285 Q213 280 225 288 Q212 304 200 305 Q188 304 175 288Z"/>
          <path d="M175 288 Q200 294 225 288" fill="none" stroke="#000" strokeOpacity=".18" strokeWidth="1.6" strokeLinecap="round"/>

          {/* cheveux, avant (raie sur le côté) */}
          <path data-part="hair" className="zq-t" fill={c.hair} d="M200 54 C132 54 108 112 112 176 C122 150 142 128 170 118 C196 132 232 140 262 138 C276 156 284 178 288 204 C296 150 276 54 200 54Z"/>
          <path d="M200 54 C132 54 108 112 112 176 C122 150 142 128 170 118 C196 132 232 140 262 138 C276 156 284 178 288 204 C296 150 276 54 200 54Z" fill={`url(#${uid}-hairshine)`}/>
          <path d="M172 118 C176 96 188 76 204 58" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="3" strokeLinecap="round"/>
         </g>
        </g>
      </svg>
    </div>
  );
}
