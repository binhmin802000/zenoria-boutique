import React from "react";

// Affiche un texte brut en respectant ses sauts de ligne (chaque saut devient un <br />).
// Aucun HTML n'est interprété : React affiche le texte tel quel, donc rien de ce qui est saisi dans l'administration
// ne peut modifier la structure de la page.
export default function TextLines({ text }) {
  const parts = String(text === null || text === undefined ? "" : text).split("\n");
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {p}
        </React.Fragment>
      ))}
    </>
  );
}
