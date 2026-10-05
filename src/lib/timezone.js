// Utilitaires de fuseaux horaires. Les créneaux sont stockés en UTC ;
// les dates (AAAA-MM-JJ) et les minutes depuis minuit sont exprimées dans le fuseau du médecin.

// Décalage (ms) entre l'heure locale du fuseau et UTC à l'instant `date`.
function offsetMs(date, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Date locale « AAAA-MM-JJ » de l'instant `now` dans le fuseau donné.
export function localDateString(timeZone, now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

// Ajoute (ou retranche) des jours à une date « AAAA-MM-JJ ».
export function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Convertit « date locale + minutes depuis minuit » en instant UTC.
// minutes peut valoir 1440 (= minuit du lendemain).
export function zonedTimeToUtc(dateString, minutes, timeZone) {
  const [y, m, d] = dateString.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, minutes, 0);
  // Deux passes : la 2e corrige le cas où le décalage change entre les deux instants (DST).
  const guess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  return new Date(wallAsUtc - offsetMs(new Date(guess), timeZone));
}

// Bornes UTC [start, end) d'un jour local « AAAA-MM-JJ ».
export function dayBoundsFor(dateString, timeZone) {
  return {
    start: zonedTimeToUtc(dateString, 0, timeZone),
    end: zonedTimeToUtc(dateString, 1440, timeZone),
  };
}

// Bornes UTC de « aujourd'hui » dans le fuseau du médecin.
export function todayBounds(timeZone, now = new Date()) {
  return dayBoundsFor(localDateString(timeZone, now), timeZone);
}
