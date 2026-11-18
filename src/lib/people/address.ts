/**
 * Safety net: if a reply addresses the CEO by a colleague's first name
 * ("Meera, ..." / "..., Meera."), swap in the CEO's first name.
 */
export function addressCeoCorrectly(answer: string, ceoFirstName: string | null, firstNames: string[]) {
  const wrong = firstNames.filter((name) => name && name !== ceoFirstName);
  if (wrong.length === 0) return answer;
  const names = wrong.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const replacement = ceoFirstName ?? "";
  return answer
    .replace(new RegExp(`^(?:(?:Hi|Hey|Hello|Morning|Good morning),?\\s+)?(${names})([,!])\\s*`), (match, _name, punctuation) =>
      replacement ? match.replace(_name, replacement) : match.replace(`${_name}${punctuation}`, "").trimStart())
    .replace(new RegExp(`,\\s*(${names})([.!?])`, "g"), (_match, _name, punctuation) =>
      replacement ? `, ${replacement}${punctuation}` : punctuation);
}

