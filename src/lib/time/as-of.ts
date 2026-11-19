/**
 * The date the CEO is viewing the company "as of". Set by the time picker as
 * a cookie (so every page and API call sees it without threading it through
 * links), or by `?asOf=YYYY-MM-DD` on a request (shareable, wins over the
 * cookie). A date means "as known at the end of that day in India".
 */
export const AS_OF_COOKIE = "veloxa_as_of";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function endOfDayIst(day: string) {
  return new Date(`${day}T23:59:59+05:30`);
}

/** Today's date in India, as YYYY-MM-DD. */
export function todayIst(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

function cookieValue(header: string | null, name: string) {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export type AsOf = {
  /** The instant used to filter what was known. */
  at: Date;
  /** The calendar day being viewed (IST). */
  day: string;
  /** True when viewing a past day rather than today. */
  historical: boolean;
};

export function asOfFromRequest(request?: Request | null, now = new Date()): AsOf {
  const today = todayIst(now);
  let day: string | null = null;
  if (request) {
    const fromQuery = new URL(request.url).searchParams.get("asOf");
    const fromCookie = cookieValue(request.headers.get("cookie"), AS_OF_COOKIE);
    day = [fromQuery, fromCookie ? decodeURIComponent(fromCookie) : null].find((value) => value && DAY.test(value)) ?? null;
  }
  // The future cannot be viewed; today means "now", not end of day.
  if (!day || day >= today) return { at: now, day: today, historical: false };
  return { at: endOfDayIst(day), day, historical: true };
}
