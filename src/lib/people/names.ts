/** Levenshtein distance, small strings only. */
function distance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length];
}

/**
 * The directory first name a word most likely means, for variant or
 * misspelled names in transcripts and generated text ("Pria" → Priya,
 * "Snehal" → Sneha, "Ayesha" → Aisha). Conservative: same first letter,
 * at most one edit for short names and two for longer ones, and never a
 * word that is already an exact directory name.
 */
export function matchFirstName(word: string, firstNames: string[]): string | null {
  if (word.length < 3 || !/^[A-Z][a-z]+$/.test(word)) return null;
  if (firstNames.includes(word)) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of firstNames) {
    if (name[0] !== word[0]) continue;
    const score = distance(word.toLowerCase(), name.toLowerCase());
    const allowed = Math.min(word.length, name.length) <= 4 ? 1 : 2;
    if (score <= allowed && (!best || score < best.score)) best = { name, score };
  }
  return best?.name ?? null;
}

/** Correct variant spellings of directory first names in a piece of text. */
export function correctNames(text: string, firstNames: string[]): string {
  if (!text) return text;
  return text.replace(/\b[A-Z][a-z]{2,}\b/g, (word) => matchFirstName(word, firstNames) ?? word);
}
