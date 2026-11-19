const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (value: number) => String(value).padStart(2, "0");

function toDay(year: number, month: number, day: number) {
  if (!year || !month || !day || month > 12 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function firstDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const dayMonth = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s,-]+(20\d{2})\b/i);
  const monthDay = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
  const found = [
    iso && { index: iso.index!, day: toDay(+iso[1], +iso[2], +iso[3]) },
    dayMonth && { index: dayMonth.index!, day: toDay(+dayMonth[3], MONTHS[dayMonth[2].toLowerCase().slice(0, 3)], +dayMonth[1]) },
    monthDay && { index: monthDay.index!, day: toDay(+monthDay[3], MONTHS[monthDay[1].toLowerCase().slice(0, 3)], +monthDay[2]) },
  ].filter((item): item is { index: number; day: string } => Boolean(item && item.day));
  return found.sort((left, right) => left.index - right.index)[0]?.day ?? null;
}

/**
 * The date a document carries itself (not when it entered the system):
 * an email's Date header, a "sent/exported/dated/as of …" phrase, or the
 * first full date near the top. Null when the document has no date.
 */
export function documentDate(text: string, kind?: string): string | null {
  const header = text.match(/^Date:\s*(.+)$/m)?.[1];
  if (header) {
    const parsed = new Date(header);
    if (!Number.isNaN(parsed.valueOf())) return new Date(parsed.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  }
  const head = text.slice(0, 600);
  const phrase = head.match(/\b(?:exported|sent|dated|as of|issued|signed|effective)\b[^\n]{0,40}/i)?.[0];
  if (phrase && firstDate(phrase)) return firstDate(phrase);
  // In a table the first date is a row's date, not the document's.
  if (kind === "spreadsheet" || /^[^\n]*,[^\n]*,[^\n]*$/m.test(head.slice(0, 300))) return null;
  return firstDate(head.slice(0, 300));
}
