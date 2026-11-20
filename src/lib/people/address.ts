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

/**
 * People below the CEO's direct reports address her as "ma'am". If a reply
 * still uses her first name as a form of address ("Ananya, ..." / "..., Ananya."),
 * it becomes "ma'am". Mentions inside a sentence are left alone.
 */
export function formalAddress(answer: string, ceoFirstName: string | null) {
  if (!ceoFirstName) return answer;
  const name = ceoFirstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return answer
    .replace(new RegExp(`^((?:Hi|Hello|Good (?:morning|afternoon|evening)),?\\s+)?${name}([,!])`), (_match, greeting: string | undefined, punctuation: string) =>
      greeting ? `${greeting.trim().replace(/,$/, "")}, ma'am${punctuation}` : `Ma'am${punctuation}`)
    .replace(new RegExp(`,\\s*${name}([.!?])`, "g"), (_match, punctuation: string) => `, ma'am${punctuation}`);
}
