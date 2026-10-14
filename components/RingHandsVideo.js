// Animation « Le geste » : la main d'un homme, qui tient une bague, la présente devant le bout de l'ANNULAIRE d'une main de
// femme (le 3e doigt, après l'index et le majeur). La bague tourne de face à profil, le doigt entre dans l'anneau, puis
// toute la main (doigts, paume, poignet) la fait glisser d'un bloc jusqu'à sa place. Les mains s'enlacent ensuite, un
// grand cœur apparaît au-dessus et une étincelle s'allume sur la bague.
//
// - LA BANDE DE L'ANNEAU est dessinée dans la vidéo (tournante, cachée derrière le doigt et par la main de l'homme) ;
//   la photo de la bague (la pierre) est posée par-dessus, en code, avec son ombre douce, le cœur, le halo et les étincelles.
// - TRANSPARENCE : la vidéo « alpha » (WebM VP9 avec canal alpha) ne contient que le trait des mains : la couleur du
//   site est le fond, quelle qu'elle soit (uni, dégradé, photo). Safari et iPhone ne lisent pas l'alpha du WebM : ils
//   reçoivent la vidéo MP4 à fond blanc, fusionnée en « multiply », qui donne le même rendu sur un fond clair.
//   Le lecteur ne pose jamais de transform, d'opacity ou de filtre sur un conteneur (cela casserait la fusion et ferait
//   apparaître un fond blanc) : les fondus se font couche par couche.
// - Réglages (tous optionnels) :
//     speed        0.8 (lent) | 1 (normal) | 1.25 (rapide)
//     mode         "once"  : jouée une fois, puis reste affichée (défaut)
//                  "loop"  : repart du début après `loopPause` secondes, en fondu ; en pause hors de l'écran
//                  "vanish": s'efface après `holdSeconds` secondes, puis la zone se replie
//     life         true : après la lecture, le cœur flotte, les étoiles scintillent, un reflet traverse la bague
//     alpha        null (automatique) | true | false : impose la vidéo transparente ou le MP4 fusionné
//     onVanishStart / onVanished : rappels au début et à la fin du repli (mode "vanish")
// - La lecture démarre quand l'animation est visible et se met en pause quand elle sort de l'écran.
// - Visiteurs qui ont réduit les animations (ou vidéo impossible à lire) : image finale fixe, en PNG transparent.
//
// Fichiers à placer dans le dossier public/animations/ :
//   zenoria-geste-alpha.webm, zenoria-geste.mp4, zenoria-geste-fin.png, ring-bleu.png
import { useEffect, useRef } from "react";

/* ===== Noyau partagé : chronologie, cœur, étincelles, bague, vie continue et lecteur (aucune dépendance) ===== */
var RHV = (function () {
  var W = 1280, H = 704;
  var TL = {"DUR": 13.9, "FINGER": "annulaire", "REVEAL": [0.1, 1.7], "SWAY": [1.4, 2.2], "WIPE": [7.1, 8.9], "WC": [640, 430], "SOFT": 240, "LAG": 170, "RMAX": 1100, "EXT": 1191.038, "XFADE": [5.5, 6.0], "PATH": {"t0": 2.3, "t1": 6.0, "R0": 24, "R1": 24, "EXT_LEN": 80, "SEAT_X": 650, "THETA": 0.0, "PIVOT": [130, 250], "S0": [598, 229], "P0": [459.39, 577.12]}, "BAND": {"FACE": [25.2, 40.0, -23.0], "OFF_A": [-18.5, 26.7], "PROFIL": [7.5, 30.0], "OFF_B": 24.0, "ROT": [2.1, 3.1]}, "HEART": {"stroke": [9.3, 11.0], "inner": [9.7, 11.4], "fill": [10.5, 11.9], "glow": [10.7, 12.1], "glowFade": [12.1, 13.3], "pulse": [11.9, 12.7]}, "HSTARS": [[11.3, 12.1, -192, -42, 30], [11.5, 12.3, 196, -20, 24], [11.7, 12.5, 172, -112, 18], [11.9, 12.7, -168, -112, 14]], "GLINT": [12.1, 12.7, 13.5], "HALO": [12.1, 12.9], "MSTARS": [[12.3, 13.0, 66, -10, 17], [12.5, 13.2, -48, -50, 13]], "PATH_S": [[459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.39, 577.12, 0.0, 24], [459.37, 577.13, 0.0, 24], [459.29, 577.15, 0.0, 24], [459.09, 577.2, 0.0, 24], [458.72, 577.29, 0.0, 24], [458.16, 577.43, 0.0, 24], [457.39, 577.63, 0.0, 24], [456.4, 577.88, 0.0, 24], [455.2, 578.18, 0.0, 24], [453.81, 578.52, 0.0, 24], [452.25, 578.88, 0.0, 24], [450.56, 579.25, 0.0, 24], [448.76, 579.63, 0.0, 24], [446.9, 580.0, 0.0, 24], [445.01, 580.34, 0.0, 24], [443.15, 580.63, 0.0, 24], [441.34, 580.87, 0.0, 24], [439.65, 581.04, 0.0, 24], [438.1, 581.13, 0.0, 24], [436.73, 581.13, 0.0, 24], [435.59, 581.01, 0.0, 24], [434.7, 580.78, 0.0, 24], [434.09, 580.43, 0.0, 24], [433.77, 579.94, 0.0, 24], [433.76, 579.32, 0.0, 24], [434.06, 578.56, 0.0, 24], [434.67, 577.67, 0.0, 24], [435.56, 576.64, 0.0, 24], [436.71, 575.48, 0.0, 24], [438.08, 574.21, 0.0, 24], [439.62, 572.83, 0.0, 24], [441.26, 571.37, 0.0, 24], [442.99, 569.82, 0.0, 24], [444.81, 568.18, 0.0, 24], [446.73, 566.46, 0.0, 24], [448.74, 564.65, 0.0, 24], [450.83, 562.76, 0.0, 24], [453.01, 560.79, 0.0, 24], [455.27, 558.74, 0.0, 24], [457.61, 556.6, 0.0, 24], [460.03, 554.39, 0.0, 24], [462.53, 552.11, 0.0, 24], [465.09, 549.74, 0.0, 24], [467.72, 547.31, 0.0, 24], [470.42, 544.8, 0.0, 24], [473.17, 542.22, 0.0, 24], [475.98, 539.58, 0.0, 24], [478.84, 536.87, 0.0, 24], [481.74, 534.1, 0.0, 24], [484.68, 531.26, 0.0, 24], [487.67, 528.37, 0.0, 24], [490.68, 525.43, 0.0, 24], [493.71, 522.43, 0.0, 24], [496.77, 519.38, 0.0, 24], [499.85, 516.29, 0.0, 24], [502.93, 513.15, 0.0, 24], [506.04, 509.95, 0.0, 24], [509.18, 506.7, 0.0, 24], [512.34, 503.41, 0.0, 24], [515.52, 500.07, 0.0, 24], [518.73, 496.71, 0.0, 24], [521.95, 493.32, 0.0, 24], [525.2, 489.91, 0.0, 24], [528.46, 486.5, 0.0, 24], [531.75, 483.08, 0.0, 24], [535.05, 479.67, 0.0, 24], [538.36, 476.27, 0.0, 24], [541.69, 472.9, 0.0, 24], [545.04, 469.55, 0.0, 24], [548.4, 466.24, 0.0, 24], [551.76, 462.97, 0.0, 24], [555.14, 459.76, 0.0, 24], [558.51, 456.6, 0.0, 24], [561.89, 453.51, 0.0, 24], [565.27, 450.49, 0.0, 24], [568.63, 447.55, 0.0, 24], [571.98, 444.69, 0.0, 24], [575.32, 441.93, 0.0, 24], [578.62, 439.25, 0.0, 24], [581.9, 436.68, 0.0, 24], [585.14, 434.2, 0.0, 24], [588.33, 431.83, 0.0, 24], [591.48, 429.56, 0.0, 24], [594.57, 427.39, 0.0, 24], [597.6, 425.34, 0.0, 24], [600.56, 423.38, 0.0, 24], [603.45, 421.54, 0.0, 24], [606.26, 419.8, 0.0, 24], [608.98, 418.16, 0.0, 24], [611.61, 416.63, 0.0, 24], [614.14, 415.2, 0.0, 24], [616.57, 413.87, 0.0, 24], [618.9, 412.63, 0.0, 24], [621.11, 411.48, 0.0, 24], [623.21, 410.42, 0.0, 24], [625.19, 409.45, 0.0, 24], [627.05, 408.56, 0.0, 24], [628.79, 407.75, 0.0, 24], [630.41, 407.02, 0.0, 24], [631.91, 406.35, 0.0, 24], [633.28, 405.75, 0.0, 24], [634.53, 405.22, 0.0, 24], [635.66, 404.75, 0.0, 24], [636.67, 404.33, 0.0, 24], [637.57, 403.96, 0.0, 24], [638.36, 403.65, 0.0, 24], [639.04, 403.38, 0.0, 24], [639.62, 403.15, 0.0, 24], [640.1, 402.96, 0.0, 24], [640.5, 402.81, 0.0, 24], [640.81, 402.68, 0.0, 24], [641.05, 402.59, 0.0, 24], [641.23, 402.52, 0.0, 24], [641.35, 402.48, 0.0, 24], [641.42, 402.45, 0.0, 24], [641.46, 402.44, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24], [641.48, 402.43, 0.0, 24]], "TOUCH": [3.57, 4.27], "FING": {"UPPER": [[505, 527], [520, 505], [540, 482], [560, 460], [580, 436], [590, 420], [600, 416], [620, 409], [640, 400], [660, 395], [680, 391], [710, 388], [780, 386]], "LOWER": [[482, 560], [490, 566], [505, 569], [522, 568], [540, 553], [550, 536], [560, 519], [580, 500], [600, 484], [620, 466], [640, 460], [660, 452], [680, 445], [700, 440], [740, 434], [780, 430]], "CL": [[498, 548], [520, 533], [540, 513], [560, 490], [580, 468], [600, 450], [620, 438], [640, 429], [660, 423], [680, 418], [710, 412]]}};
  var DUR = TL.DUR, TAU = 2 * Math.PI;
  var RING = { C: [645, 432], RC: TL.PATH.R1 };           // taille de la photo de la bague : la même partout
  var HEART = { x: 600, y: 150, u: 128 };

  function clamp(x) { return Math.min(1, Math.max(0, x)); }
  function sstep(x, a, b) { var t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function dist(x, y, c) { var dx = x - c[0], dy = y - c[1]; return Math.sqrt(dx * dx + dy * dy); }
  function wipe(t, x, y, lag) { return smooth((sstep(t, TL.WIPE[0], TL.WIPE[1]) * TL.EXT - lag - dist(x, y, TL.WC)) / TL.SOFT); }
  function reveal(t, x, y) { return smooth((sstep(t, TL.REVEAL[0], TL.REVEAL[1]) * (TL.RMAX + 260) - dist(x, y, TL.PATH.P0)) / 260); }
  function f(v) { return (Math.round(v * 1000) / 1000).toString(); }
  function tr(x, y, rot, sc) { return 'translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(rot) + ') scale(' + f(sc) + ')'; }

  var PS = TL.PATH_S, PFPS = 30, SEAT = PS[PS.length - 1];
  function ringAt(t) {
    var k = clamp(t / (PS.length - 2) * PFPS) * (PS.length - 2), i = Math.floor(k), u = k - i, a = PS[i], b = PS[Math.min(i + 1, PS.length - 1)];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
  }

  function attrsFor(t, ti) {
    var a = {}, c = sstep(t, TL.XFADE[0], TL.XFADE[1]);
    var sway = 1.6 * Math.sin(TAU * t / 3.2) * (1 - sstep(t, TL.SWAY[0], TL.SWAY[1]));
    var p = ringAt(t);
    a.ringA = { transform: tr(p[0], p[1] + sway, p[2], p[3]), opacity: reveal(t, TL.PATH.P0[0], TL.PATH.P0[1]) * (1 - wipe(t, SEAT[0], SEAT[1], 0)) };
    a.ringC = { transform: tr(RING.C[0], RING.C[1], 0, RING.RC), opacity: wipe(t, RING.C[0], RING.C[1], TL.LAG) };
    a.sheen = { transform: 'translate(-1.5 0) rotate(18)', opacity: 0 };
    var tk = TL.TOUCH, kt = sstep(t, tk[0], tk[0] + 0.25) * (1 - sstep(t, tk[0] + 0.25, tk[1]));
    var pn = ringAt(tk[0] + 0.25);
    a.tch = { transform: tr(pn[0] - 34, pn[1] - 38, -25 * (1 - kt), 13 * kt), opacity: kt * (1 - c) };
    var Hh = TL.HEART;
    var hs = sstep(t, Hh.stroke[0], Hh.stroke[1]), hi = sstep(t, Hh.inner[0], Hh.inner[1]);
    var hf = sstep(t, Hh.fill[0], Hh.fill[1]), hg = sstep(t, Hh.glow[0], Hh.glow[1]);
    var pulse = 1 + 0.035 * Math.sin(Math.PI * sstep(t, Hh.pulse[0], Hh.pulse[1]));
    a.heart = { transform: tr(HEART.x, HEART.y, 0, HEART.u * pulse) };
    a.heartL = { dash: 1 - hs, opacity: hs > 0 ? 1 : 0 };
    a.heartR = { dash: 1 - hs, opacity: hs > 0 ? 1 : 0 };
    a.heartIn = { dash: 1 - hi, opacity: hi > 0 ? 0.55 : 0 };
    a.heartFill = { opacity: 0.36 * hf };
    a.heartGlow = { opacity: 0.30 * hg * (1 - 0.35 * sstep(t, Hh.glowFade[0], Hh.glowFade[1])) };
    var i, k, st;
    for (i = 0; i < TL.HSTARS.length; i++) {
      st = TL.HSTARS[i]; k = sstep(t, st[0], st[1]);
      a['hs' + i] = { transform: tr(HEART.x + st[2], HEART.y + st[3], -35 * (1 - k), st[4] * k * (1 + 0.2 * Math.sin(Math.PI * k))), opacity: k };
    }
    var G = TL.GLINT, gin = sstep(t, G[0], G[1]);
    a.halo = { transform: tr(RING.C[0], RING.C[1], 0, 1 + 0.35 * sstep(t, TL.HALO[0], TL.HALO[1] + 0.8)), opacity: 0.55 * sstep(t, TL.HALO[0], TL.HALO[1]) * (1 - 0.4 * sstep(t, G[1], G[2])) };
    a.glint = { transform: tr(RING.C[0] + 40, RING.C[1] - 42, -20 * (1 - gin), 42 * (0.25 + 0.75 * gin)), opacity: gin * (1 - 0.5 * sstep(t, G[1], G[2])) };
    for (i = 0; i < TL.MSTARS.length; i++) {
      st = TL.MSTARS[i]; k = sstep(t, st[0], st[1]);
      a['ms' + i] = { transform: tr(RING.C[0] + st[2], RING.C[1] + st[3], -35 * (1 - k), st[4] * k * (1 + 0.2 * Math.sin(Math.PI * k))), opacity: k };
    }
    if (ti > 0) lifeMod(a, ti);
    return a;
  }

  var CYC = 5.5;
  function lifeMod(a, ti) {
    var F = sstep(ti, 0, 1.5), m = (ti + 3.9) % CYC, g = Math.pow(Math.sin(Math.PI * clamp(m / 1.6)), 2), i, st, tw, dy;
    dy = 4 * Math.sin(TAU * ti / 4.2) * F;
    a.heart.transform = tr(HEART.x, HEART.y + dy, 1.2 * Math.sin(TAU * ti / 5.3 + 1) * F, HEART.u * (1 + 0.018 * Math.sin(TAU * ti / 2.6) * F));
    for (i = 0; i < TL.HSTARS.length; i++) {
      st = TL.HSTARS[i]; tw = 0.5 + 0.5 * Math.sin(TAU * ti / (2.4 + 0.5 * i) + i * 1.9);
      a['hs' + i] = { transform: tr(HEART.x + st[2], HEART.y + st[3] + dy * 0.6, 8 * Math.sin(TAU * ti / (3 + i)) * F, st[4] * (1 + 0.2 * tw * F)), opacity: 1 - 0.4 * (1 - tw) * F };
    }
    a.halo.opacity = a.halo.opacity * (1 + 0.2 * Math.sin(TAU * ti / 3.1) * F + 0.25 * g * F);
    a.glint = { transform: tr(RING.C[0] + 40, RING.C[1] - 42, 8 * g * F, 42 * (1 + 0.3 * g * F)), opacity: 0.5 + 0.5 * g * F };
    for (i = 0; i < TL.MSTARS.length; i++) {
      st = TL.MSTARS[i]; tw = 0.5 + 0.5 * Math.sin(TAU * ti / (2.1 + 0.6 * i) + 1 + i * 2.3);
      a['ms' + i] = { transform: tr(RING.C[0] + st[2], RING.C[1] + st[3], 6 * Math.sin(TAU * ti / (3.4 + i)) * F, st[4] * (1 + 0.25 * tw * F)), opacity: 1 - 0.45 * (1 - tw) * F };
    }
    var u = clamp((m - 0.15) / 1.1);
    a.sheen = { transform: 'translate(' + f(-1.5 + 3.0 * u) + ' 0) rotate(18)', opacity: Math.sin(Math.PI * u) * 0.8 * F };
  }

  var STAR = 'M0 -1Q0 0 1 0Q0 0 0 1Q0 0 -1 0Q0 0 0 -1Z';
  var HL = 'M0 0.95C-0.25 0.72 -1.05 0.20 -1.0 -0.28C-0.97 -0.72 -0.42 -0.92 -0.14 -0.62C-0.07 -0.54 -0.02 -0.48 0 -0.42';
  var HR = 'M0 0.95C0.25 0.72 1.05 0.20 1.0 -0.28C0.97 -0.72 0.42 -0.92 0.14 -0.62C0.07 -0.54 0.02 -0.48 0 -0.42';
  var HF = HL + 'C0.02 -0.48 0.07 -0.54 0.14 -0.62C0.42 -0.92 0.97 -0.72 1.0 -0.28C1.05 0.20 0.25 0.72 0 0.95Z';
  function at(a, k) {
    var o = a[k] || {}, s = '';
    if (o.transform) s += ' transform="' + o.transform + '"';
    var st = 'opacity:' + (o.opacity === undefined ? 1 : f(o.opacity));
    if (o.dash !== undefined) st += ';stroke-dashoffset:' + f(o.dash);
    return s + ' style="' + st + '"';
  }
  function overlayMarkup(color, t, ringSrc, ti) {
    var c = color, a = attrsFor(t == null ? 0 : t, ti || 0), i;
    var star = function (k) { return '<path data-k="' + k + '" d="' + STAR + '" fill="' + c + '"' + at(a, k) + '/>'; };
    var s = '<defs><radialGradient id="rhvg"><stop offset="0" stop-color="' + c + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="rhvs"><stop offset="0.55" stop-color="#2a2020" stop-opacity="0.26"/><stop offset="1" stop-color="#2a2020" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="rhvh" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.6" stop-color="' + c + '" stop-opacity="1"/><stop offset="1" stop-color="' + c + '" stop-opacity="1"/></radialGradient>' +
            '<linearGradient id="rhvw" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
            '<clipPath id="rhvr"><circle r="0.82"/></clipPath></defs>';
    s += '<g data-k="heart"' + at(a, 'heart') + '>';
    s += '<circle data-k="heartGlow" r="1.45" cy="0.1" fill="url(#rhvg)"' + at(a, 'heartGlow') + '/>';
    s += '<path data-k="heartFill" d="' + HF + '" fill="url(#rhvh)"' + at(a, 'heartFill') + '/>';
    s += '<g fill="none" stroke="' + c + '" stroke-linecap="round" stroke-linejoin="round">';
    s += '<path data-k="heartL" d="' + HL + '" pathLength="1" stroke-width="0.026" stroke-dasharray="1"' + at(a, 'heartL') + '/>';
    s += '<path data-k="heartR" d="' + HR + '" pathLength="1" stroke-width="0.026" stroke-dasharray="1"' + at(a, 'heartR') + '/>';
    s += '<g transform="scale(0.86 0.86) translate(0 0.02)"><path data-k="heartIn" d="' + HF + '" pathLength="1" stroke-width="0.014" stroke-dasharray="1"' + at(a, 'heartIn') + '/></g>';
    s += '</g></g>';
    for (i = 0; i < TL.HSTARS.length; i++) s += star('hs' + i);
    var head = ringSrc
      ? '<ellipse cx="0.07" cy="0.11" rx="1.0" ry="0.96" fill="url(#rhvs)"/><image href="' + ringSrc + '" x="-1" y="-1" width="2" height="2" preserveAspectRatio="xMidYMid meet"/>'
      : '<circle r="0.9" fill="' + c + '" stroke="#3b3535" stroke-width="0.04"/><circle r="0.5" fill="#fff" fill-opacity="0.35" stroke="#3b3535" stroke-width="0.03"/>';
    s += '<g data-k="ringA"' + at(a, 'ringA') + '>' + head + '</g>';
    s += star('tch');
    s += '<circle data-k="halo" r="62" fill="url(#rhvg)"' + at(a, 'halo') + '/>';
    s += '<g data-k="ringC"' + at(a, 'ringC') + '>' + head + '<g clip-path="url(#rhvr)"><rect data-k="sheen" x="-0.22" y="-1.3" width="0.44" height="2.6" fill="url(#rhvw)"' + at(a, 'sheen') + '/></g></g>';
    s += star('glint');
    for (i = 0; i < TL.MSTARS.length; i++) s += star('ms' + i);
    return s;
  }
  function apply(refs, t, ti) {
    var a = attrsFor(t, ti || 0), k, e, o;
    for (k in a) { e = refs[k]; if (!e) continue; o = a[k];
      if (o.transform) e.setAttribute('transform', o.transform);
      if (o.opacity !== undefined) e.style.opacity = o.opacity;
      if (o.dash !== undefined) e.style.strokeDashoffset = o.dash; }
  }

  var DEFAULTS = {
    color: '#2e75c6', ringSrc: null, speed: 1, mode: 'once', life: true, holdSeconds: 4, loopPause: 3,
    src: '/animations/zenoria-geste.mp4', srcAlpha: '/animations/zenoria-geste-alpha.webm', stillSrc: '/animations/zenoria-geste-fin.png',
    alpha: null, reduce: null, onVanished: null, onVanishStart: null
  };
  function isAppleWebKit() {
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|FxiOS\/|Edg\/|OPR\/|Android/.test(ua);
  }
  function alphaSupported(doc) {
    if (isAppleWebKit()) return false;
    var v = doc.createElement('video');
    if (!v.canPlayType) return false;
    var r = v.canPlayType('video/webm; codecs="vp9"');
    return r === 'probably' || r === 'maybe';
  }
  function createPlayer(host, opt) {
    var o = {}, key;
    for (key in DEFAULTS) o[key] = (opt && opt[key] !== undefined) ? opt[key] : DEFAULTS[key];
    var doc = host.ownerDocument || document;
    var css = function (e, c) { for (var k in c) e.style[k] = c[k]; return e; };
    var mk = function (tag, c) { var e = doc.createElement(tag); if (c) css(e, c); return e; };
    var outer = mk('div', { display: 'grid', gridTemplateRows: '1fr', transition: 'grid-template-rows .8s ease' });
    var inner = mk('div', { minHeight: '0' });
    var box = mk('div', { position: 'relative', width: '100%', aspectRatio: '1280 / 704' });
    var fillCss = { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block', transition: 'opacity .7s ease' };
    var video = null, img = null, flavor = 'opaque';
    var svg = doc.createElementNS ? doc.createElementNS('http://www.w3.org/2000/svg', 'svg') : mk('svg');
    svg.setAttribute('viewBox', '0 0 1280 704'); svg.setAttribute('aria-hidden', 'true');
    css(svg, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', transition: 'opacity .7s ease' });
    box.appendChild(svg); inner.appendChild(box); outer.appendChild(inner); host.appendChild(outer);

    var refs = {}, lastT = 0, lastTi = 0, phase = 'wait', paused = true, started = false, raf = 0, idleT0 = 0, hiddenAt = 0, timers = [], io = null, dead = false;
    var nowMs = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
    var later = function (fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; };
    var frame = function (fn) { return (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(fn) : setTimeout(fn, 16); };
    var unframe = function (id) { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id); else clearTimeout(id); };

    function rebuild() {
      svg.innerHTML = overlayMarkup(o.color, lastT, o.ringSrc, lastTi);
      refs = {}; var nodes = svg.querySelectorAll('[data-k]'), i;
      for (i = 0; i < nodes.length; i++) refs[nodes[i].getAttribute('data-k')] = nodes[i];
    }
    function paint(t, ti) { lastT = t; lastTi = ti; apply(refs, t, ti); }
    function setFade(v, sec) {
      var els = [video, img, svg], i;
      for (i = 0; i < els.length; i++) if (els[i]) { els[i].style.transition = 'opacity ' + sec + 's ease'; els[i].style.opacity = String(v); }
    }
    function toStill() {
      if (dead || phase === 'still') return;
      phase = 'still'; unframe(raf);
      if (video && video.parentNode) video.parentNode.removeChild(video);
      video = null;
      if (!img) { img = mk('img', fillCss); img.alt = ''; img.src = o.stillSrc; box.insertBefore(img, svg); }
      setFade(1, 0); paint(DUR, 0);
    }
    function makeVideo(kind) {
      flavor = kind;
      if (video && video.parentNode) video.parentNode.removeChild(video);
      video = mk('video', fillCss);
      if (kind === 'opaque') video.style.mixBlendMode = 'multiply';
      video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true'); video.preload = 'auto';
      video.addEventListener('error', function () { if (kind === 'alpha') fallbackOpaque(); else toStill(); });
      video.src = kind === 'alpha' ? o.srcAlpha : o.src;
      box.insertBefore(video, svg);
    }
    function fallbackOpaque() {
      if (dead || flavor === 'opaque' || phase === 'still') return;
      var wasPlaying = (phase === 'play');
      makeVideo('opaque');
      if (phase === 'play' || phase === 'wait') { paint(0, 0); if (!paused && started) { phase = 'play'; play(); } }
      else if (wasPlaying) play();
    }
    function tick() {
      raf = 0; if (dead || paused) return;
      if (phase === 'play') {
        paint(video.currentTime, 0);
        if (video.ended || video.currentTime >= DUR - 0.03) { phase = 'idle'; idleT0 = nowMs(); }
      }
      if (phase === 'idle') {
        var ti = (nowMs() - idleT0) / 1000; paint(DUR, o.life ? ti : 0);
        if (o.mode === 'loop' && ti >= o.loopPause) { fadeThen(0.7, restart); return; }
        if (o.mode === 'vanish' && ti >= o.holdSeconds) { fadeThen(1.2, vanish); return; }
      }
      if (phase === 'play' || phase === 'idle') raf = frame(tick);
    }
    function fadeThen(sec, fn) { phase = 'out'; setFade(0, sec); later(fn, sec * 1000 + 60); }
    function play() {
      if (!video) return;
      video.playbackRate = o.speed;
      var p = video.play();
      if (p && p.catch) p.catch(function (e) {
        if (flavor === 'alpha' && e && e.name === 'NotSupportedError') fallbackOpaque(); else toStill();
      });
    }
    function restart() {
      if (dead || phase === 'still') return;
      setFade(1, 0.7);
      if (video) video.currentTime = 0;
      paint(0, 0); phase = 'play';
      if (!paused) { play(); raf = frame(tick); }
    }
    function vanish() {
      if (dead) return;
      phase = 'gone'; host.style.aspectRatio = 'auto';
      if (o.onVanishStart) o.onVanishStart();
      outer.style.gridTemplateRows = '0fr'; inner.style.overflow = 'hidden';
      later(function () { if (o.onVanished) o.onVanished(); }, 850);
    }
    function begin() { started = true; phase = 'play'; paint(0, 0); play(); raf = frame(tick); }
    function setVisible(v) {
      if (dead || phase === 'still' || phase === 'gone') return;
      if (v && paused) {
        paused = false;
        if (!started) begin();
        else if (phase === 'play') { play(); raf = frame(tick); }
        else if (phase === 'idle') { idleT0 += nowMs() - hiddenAt; raf = frame(tick); }
      } else if (!v && !paused) {
        paused = true; unframe(raf); hiddenAt = nowMs();
        if (phase === 'play' && video) video.pause();
      }
    }
    var reduce = o.reduce;
    if (reduce === null) reduce = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    rebuild();
    if (reduce) { toStill(); }
    else {
      var useAlpha = o.alpha === null ? alphaSupported(doc) : !!o.alpha;
      makeVideo(useAlpha ? 'alpha' : 'opaque');
      if (typeof IntersectionObserver === 'undefined') { setVisible(true); }
      else {
        io = new IntersectionObserver(function (es) { var vis = false, i; for (i = 0; i < es.length; i++) if (es[i].isIntersecting) vis = true; setVisible(vis); }, { threshold: 0.4 });
        io.observe(host);
      }
    }
    return {
      setOptions: function (patch) {
        var redo = false, k;
        for (k in patch) { if (patch[k] === undefined) continue; if ((k === 'color' || k === 'ringSrc') && patch[k] !== o[k]) redo = true; o[k] = patch[k]; }
        if (redo) rebuild();
        if (video && patch.speed) video.playbackRate = o.speed;
      },
      replay: function () {
        var i; for (i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = [];
        outer.style.gridTemplateRows = '1fr'; inner.style.overflow = ''; host.style.aspectRatio = '1280 / 704'; setFade(1, 0.7);
        if (phase === 'still') return;
        started = true; paused = false; unframe(raf); restart();
      },
      phase: function () { return phase; },
      flavor: function () { return flavor; },
      destroy: function () { dead = true; unframe(raf); var i; for (i = 0; i < timers.length; i++) clearTimeout(timers[i]); if (io) io.disconnect(); if (outer.parentNode) outer.parentNode.removeChild(outer); }
    };
  }

  return { W: W, H: H, DUR: DUR, TL: TL, attrsFor: attrsFor, overlayMarkup: overlayMarkup, apply: apply, createPlayer: createPlayer, ringAt: ringAt, RING: RING, HEART: HEART };
})();

export default function RingHandsVideo({
  crystalColor = "#2e75c6", // couleur du cœur, du halo et des étincelles
  ringSrc = "/animations/ring-bleu.png", // photo détourée de la bague (PNG transparent, carré). null : simple pierre colorée
  speed = 1,
  mode = "once",
  life = true,
  holdSeconds = 4,
  loopPause = 3,
  alpha = null,
  onVanishStart,
  onVanished,
  src = "/animations/zenoria-geste.mp4",
  srcAlpha = "/animations/zenoria-geste-alpha.webm",
  stillSrc = "/animations/zenoria-geste-fin.png",
  className = "",
  label = "Une main d'homme enfile une bague sur l'annulaire d'une main de femme, puis leurs mains s'enlacent sous un cœur",
}) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { onVanishStart, onVanished };

  // Création du lecteur (une seule fois par jeu de fichiers vidéo)
  useEffect(() => {
    const player = RHV.createPlayer(hostRef.current, {
      color: crystalColor, ringSrc, speed, mode, life, holdSeconds, loopPause, alpha, src, srcAlpha, stillSrc,
      onVanishStart: () => { if (callbacks.current.onVanishStart) callbacks.current.onVanishStart(); },
      onVanished: () => { if (callbacks.current.onVanished) callbacks.current.onVanished(); },
    });
    playerRef.current = player;
    return () => { player.destroy(); playerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, srcAlpha, stillSrc, alpha]);

  // Les réglages se mettent à jour à chaud, sans relancer la lecture
  useEffect(() => {
    if (playerRef.current) playerRef.current.setOptions({ color: crystalColor, ringSrc, speed, mode, life, holdSeconds, loopPause });
  }, [crystalColor, ringSrc, speed, mode, life, holdSeconds, loopPause]);

  return <div ref={hostRef} className={className} role="img" aria-label={label} style={{ width: "100%", aspectRatio: "1280 / 704" }} />;
}
