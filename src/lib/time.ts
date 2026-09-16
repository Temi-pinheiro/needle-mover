/**
 * Timezone helpers.
 *
 * The scheduler runs in UTC and asks "what time is it where TP is?" on every
 * tick, so travelling between Lagos and Bali needs no settings change. All of
 * this is built on Intl rather than a date library: the zone rules come from
 * the platform's own tz database, which is the thing that has to be right.
 */

/** Wall-clock offset of `tz` at a given instant, in milliseconds. */
function offsetAt(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asIfUtc - instant.getTime();
}

/** Today's date where TP is, as yyyy-mm-dd. */
export function localDate(instant: Date, tz: string): string {
  // en-CA formats as yyyy-mm-dd, which is the shape the `days` table uses.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Local wall-clock time as HH:mm. */
export function localTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** Minutes since local midnight. Used to compare against brief/cutoff times. */
export function localMinutes(instant: Date, tz: string): number {
  const [h, m] = localTime(instant, tz).split(":").map(Number);
  return h * 60 + m;
}

/**
 * The instant at which a given local date and HH:mm time occurs in `tz`.
 *
 * Solved by guessing UTC and correcting by the offset, twice — the second pass
 * fixes the case where the guess landed on the far side of a DST transition.
 */
export function localInstant(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0);

  let instant = new Date(naive - offsetAt(new Date(naive), tz));
  instant = new Date(naive - offsetAt(instant, tz));
  return instant;
}

/** Saturday or Sunday where TP is. */
export function isWeekend(date: string, tz: string): boolean {
  const noon = localInstant(date, "12:00", tz);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(noon);
  return day === "Sat" || day === "Sun";
}

/** Has local wall-clock time passed HH:mm on the local date of `instant`? */
export function hasPassed(instant: Date, time: string, tz: string): boolean {
  const [h, m] = time.split(":").map(Number);
  return localMinutes(instant, tz) >= h * 60 + m;
}

/** `date` shifted by `days`, staying in local terms. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Validates a tz string before we store it from Google's API. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
