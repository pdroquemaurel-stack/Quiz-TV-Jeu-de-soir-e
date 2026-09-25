// Journal lu dans les logs Render : une ligne courte par événement important.
// Silencieux pendant npm test (node:test pose NODE_TEST_CONTEXT), pour ne pas noyer les résultats.
const silencieux = Boolean(process.env.NODE_TEST_CONTEXT);

export function journaliser(code, texte) {
  if (!silencieux) console.log(`[${code}] ${texte}`);
}

// L'erreur complète, avec sa pile, pour comprendre après coup. Jamais silencieuse,
// même pendant les tests : une erreur rattrapée ne doit pas passer inaperçue.
export function journaliserErreur(contexte, erreur) {
  console.error(`[ERREUR] ${contexte}`, erreur);
}
