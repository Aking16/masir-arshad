const DAY = 86400000;
const persian = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});

export function shift(date, days) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}

export function toPersian(date) {
  const parts = Object.fromEntries(persian.formatToParts(new Date(date + 'T00:00:00Z')).map(({type, value}) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function fromPersian(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 3000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const key = value => value.year * 10000 + value.month * 100 + value.day;
  const target = key({year, month, day});
  let first = Date.UTC(year + 621, 0, 1) / DAY;
  let last = Date.UTC(year + 622, 3, 1) / DAY;
  while (first <= last) {
    const middle = Math.floor((first + last) / 2);
    const date = new Date(middle * DAY).toISOString().slice(0, 10);
    const actual = key(toPersian(date));
    if (target === actual) return date;
    if (target < actual) last = middle - 1;
    else first = middle + 1;
  }
  return null;
}

export const capacity = date => new Date(date + 'T00:00:00Z').getUTCDay() === 5 ? 60 : 160;
export const isFixed = (session, today) => !session.auto || session.done || session.date < today;

export function planSessions(weeks, sessions, completed, omitted, today) {
  const fixed = sessions.filter(session => isFixed(session, today));
  const result = [...fixed];
  const usedDays = new Map();
  const usedActivities = new Map();
  const suppressed = new Map();
  const ids = new Set(fixed.map(session => session.id));
  const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);
  for (const session of fixed) {
    add(usedDays, session.date, session.minutes);
    add(usedActivities, session.activity, session.minutes);
  }
  for (const item of Object.values(omitted)) add(suppressed, item.activity, item.minutes);
  const queue = [];
  const done = new Set(completed);
  for (const week of weeks) {
    for (const { activities } of week.courses) for (const activity of activities) {
      if (done.has(activity.id)) continue;
      const unassigned = Math.max(0, activity.minutes - (usedActivities.get(activity.id) || 0));
      let remaining = Math.max(0, unassigned - (suppressed.get(activity.id) || 0));
      let allocated = 0;
      for (let date = week.start < today ? today : week.start; date < week.end && remaining; date = shift(date, 1)) {
        const id = 'auto:' + activity.id + ':' + date;
        if (ids.has(id) || Object.hasOwn(omitted, id)) continue;
        const start = usedDays.get(date) || 0;
        const minutes = Math.min(remaining, capacity(date) - start);
        if (minutes <= 0) continue;
        result.push({ id, activity: activity.id, date, minutes, done: false, auto: true });
        add(usedDays, date, minutes);
        remaining -= minutes;
        allocated += minutes;
      }
      if (unassigned > allocated) queue.push({ activity, minutes: unassigned - allocated });
    }
  }
  return { sessions: result, queue };
}
