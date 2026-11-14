const format = 'masir-arshad';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0;
const minutes = value => Number.isSafeInteger(value) && value > 0;
const optionalBoolean = value => value === undefined || typeof value === 'boolean';

export function exportBackup(state) {
  const { entries, source18Sessions, source18Done, source18Omitted } = state;
  return { format, version: 1, data: { entries, source18Sessions, source18Done, source18Omitted } };
}

export function mergeBackup(state, backup, activities, validDate) {
  if (!object(backup) || backup.format !== format) throw new Error('این فایل خروجی مسیر ارشد نیست.');
  if (backup.version !== 1) throw new Error('نسخهٔ قالب فایل پشتیبانی نمی‌شود.');
  const data = backup.data;
  if (!object(data) || !Array.isArray(data.entries) || !Array.isArray(data.source18Sessions) ||
      !Array.isArray(data.source18Done) || !object(data.source18Omitted)) throw new Error('ساختار فایل ناقص یا نامعتبر است.');
  const result = { added: 0, duplicates: 0, conflicts: 0 };
  function merge(current, incoming, normalize, label) {
    const index = new Map(current.map(row => [row.id, row]));
    for (const row of incoming) {
      const item = object(row) && normalize(row);
      if (!item) throw new Error(label + ' نامعتبر است.');
      const existing = index.get(item.id);
      if (!existing) { index.set(item.id, item); result.added++; }
      else if (JSON.stringify(normalize(existing)) === JSON.stringify(item)) result.duplicates++;
      else result.conflicts++;
    }
    return [...index.values()];
  }
  const entries = merge(state.entries, data.entries, row =>
    id(row.id) && validDate(row.date) && minutes(row.minutes) && row.minutes <= 1440 && id(row.subject) &&
    { id: row.id, date: row.date, minutes: row.minutes, subject: row.subject }, 'ثبت مطالعه');
  const source18Sessions = merge(state.source18Sessions, data.source18Sessions, row =>
    id(row.id) && activities.has(row.activity) && validDate(row.date) && minutes(row.minutes) &&
    row.minutes <= activities.get(row.activity).minutes && optionalBoolean(row.done) && optionalBoolean(row.auto) &&
    { id: row.id, activity: row.activity, date: row.date, minutes: row.minutes, done: Boolean(row.done), auto: Boolean(row.auto) }, 'نوبت مطالعه');
  const done = new Set(state.source18Done);
  for (const activity of data.source18Done) {
    if (!activities.has(activity)) throw new Error('شناسهٔ فعالیت انجام‌شده نامعتبر است.');
    result[done.has(activity) ? 'duplicates' : 'added']++;
    done.add(activity);
  }
  const source18Omitted = { ...state.source18Omitted };
  for (const [key, item] of Object.entries(data.source18Omitted)) {
    if (!object(item) || !activities.has(item.activity) || !Number.isSafeInteger(item.minutes) ||
        item.minutes < 0 || item.minutes > activities.get(item.activity).minutes ||
        !key.startsWith('auto:' + item.activity + ':') || !validDate(key.slice(-10)) ||
        key !== 'auto:' + item.activity + ':' + key.slice(-10)) throw new Error('اطلاعات نوبت حذف‌شده نامعتبر است.');
    const existing = source18Omitted[key];
    result[!existing ? 'added' : existing.minutes === item.minutes ? 'duplicates' : 'conflicts']++;
    source18Omitted[key] = { activity: item.activity, minutes: Math.max(existing?.minutes || 0, item.minutes) };
  }
  return { ...result, state: { ...state, entries, source18Done: [...done], source18Omitted,
    source18Sessions: source18Sessions.filter(row => !row.auto || !Object.hasOwn(source18Omitted, row.id)) } };
}
