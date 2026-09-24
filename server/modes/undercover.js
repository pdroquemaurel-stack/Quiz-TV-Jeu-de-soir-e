// Mode Undercover (docs/modes/undercover.md).

// Forme comparable d'un mot : minuscules, sans accents, espaces réduits.
// Sert à juger la proposition de Mister White et à vérifier data/undercover.json.
export function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
