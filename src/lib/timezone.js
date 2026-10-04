// Bornes UTC de « aujourd'hui » dans le fuseau du médecin (les créneaux sont stockés en UTC).
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

export function todayBounds(timeZone, now = new Date()) {
  const o = offsetMs(now, timeZone);
  const local = new Date(now.getTime() + o);
  const localMidnightAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const start = new Date(localMidnightAsUtc - o);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) }; // ignore les changements d'heure (DST)
}
