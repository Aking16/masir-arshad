import { bank } from './chapters.js';

export const START = '2026-11-08';
export const LAST = '2027-05-05';
const DAY = 86400000;
const stamp = date => Date.parse(date + 'T00:00:00Z');
export const offset = (a, b) => Math.round((stamp(a) - stamp(b)) / DAY);
export const shift = (date, days) => new Date(stamp(date) + days * DAY).toISOString().slice(0, 10);
export const friday = date => new Date(stamp(date)).getUTCDay() === 5;
const capacity = date => friday(date) ? 60 : 160;
const maxDate = dates => dates.reduce((a, b) => a > b ? a : b, START);
export const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(stamp(date)) && shift(date, 0) === date;
const number = new Intl.NumberFormat('fa-IR');
export const chapters = bank.flatMap(([subject, rows], s) => rows.map(([title, exam, authored, kind], c) =>
  ({ id: `${s + 1}-${c + 1}`, subject, title, exam, authored, kind, s, c })));
const release = [0, 27, 53, 82, 98, 117, 0];
const jobs = [];
const add = (chapter, stage, minutes, label, requires, fields = {}) => {
  const job = { id: `chapter:${chapter.id}:${stage}`, chapter, stage, minutes, label, requires,
    type: stage.startsWith('video') ? 'read' : stage.startsWith('test') ? 'test' : 'review', ...fields };
  jobs.push(job);
  return job.id;
};

for (const [s] of bank.entries()) {
  const roundOne = [];
  let previousVideo;
  for (const chapter of chapters.filter(c => c.s === s && c.kind !== 'excluded')) {
    const total = chapter.exam + chapter.authored;
    let dependencies = chapter.kind === 'mixed' ? [...roundOne] : [];
    if (chapter.kind !== 'mixed') {
      const n = chapter.kind === 'watched' ? 0 : total >= 250 ? 3 : total >= 100 ? 2 : 1;
      let video = previousVideo;
      for (let i = 0; i < n; i++) {
        const label = chapter.id === '1-3' && i === 0 ? 'ادامهٔ ویدیو بعد از کارنو' :
          i === n - 1 ? 'ویدیو و ثبت پایان فصل' : `دیدن ویدیو، بخش ${number.format(i + 1)}`;
        video = add(chapter, `video-${i + 1}`, 70, label, video ? [video] : [], {
          delay: video ? 1 : 0, release: shift(START, release[s] + (s === 6 ? chapter.c * 6 : 0)),
        });
      }
      if (n) previousVideo = video;
      const summary = add(chapter, 'summary', 25, 'مرور خلاصهٔ فصل', n ? [video] : [], { delay: n ? 1 : 0, watched: !n });
      dependencies = [summary];
    }
    for (const parity of [1, 2]) {
      let first = true;
      for (const [source, count] of [['کنکوری', chapter.exam], ['تألیفی', chapter.authored]]) {
        for (let from = parity; from <= count; from += 30) {
          const last = count - (count - parity) % 2;
          const to = Math.min(from + 28, last);
          const length = (to - from) / 2 + 1;
          const label = `تست‌های ${parity === 1 ? 'فرد' : 'زوج'} ${source}، شمارهٔ ${number.format(from)} تا ${number.format(to)} و علامت‌گذاری`;
          const delay = first ? parity === 2 ? 6 : chapter.kind === 'mixed' ? 1 : 3 : 0;
          const minDelay = delay === 6 ? 5 : delay === 3 ? 2 : delay;
          const id = add(chapter, `test-${parity}-${source}-${from}`, length * 3, label, dependencies,
            { delay, minDelay, from, to, source, parity });
          dependencies = [id];
          first = false;
        }
      }
    }
    if (chapter.kind !== 'mixed') roundOne.push(...dependencies);
    if (total) add(chapter, 'marked', 30, 'مرور تست‌های علامت‌دار', dependencies, { delay: 1 });
  }
}

export const tasks = jobs;
export const taskById = new Map(jobs.map(job => [job.id, job]));

function earliest(job, dates, watched, manual = false) {
  if (job.requires.some(id => !dates.has(id))) return null;
  const predecessors = job.requires.map(id => dates.get(id));
  if (job.watched && validDate(watched[job.chapter.id])) predecessors.push(watched[job.chapter.id]);
  const lag = job.watched && predecessors.length ? 1 : (manual ? job.minDelay ?? job.delay : job.delay) ?? 0;
  const previous = predecessors.sort().at(-1) || START;
  return maxDate([shift(previous, lag), job.release || START]);
}

export function completionReady(job, done, watched, date) {
  const ready = earliest(job, new Map(Object.entries(done)), watched, true);
  return Boolean(ready && date >= ready && (job.stage !== 'marked' || friday(date)));
}

export function schedule({ done = {}, moves = {}, watched = {}, from = START } = {}) {
  const dates = new Map();
  const used = new Map();
  const pending = new Set(jobs);
  const invalid = new Map();
  const reserved = new Map();
  const summaryReservations = new Map();
  const finalVideos = new Set(jobs.filter(job => job.stage === 'summary' && job.requires.length).map(job => job.requires[0]));
  const spend = (ledger, date, minutes) => ledger.set(date, (ledger.get(date) || 0) + minutes);
  for (const job of jobs) {
    const actual = done[job.id];
    if (!validDate(actual)) continue;
    dates.set(job.id, actual);
    if (actual >= from) spend(used, actual, job.minutes);
    pending.delete(job);
  }
  for (const job of pending) {
    const date = moves[job.id];
    if (!date) continue;
    if (!validDate(date) || date < from || date > LAST || (friday(date) && job.type !== 'review') ||
      (job.stage === 'marked' && !friday(date))) {
      invalid.set(job.id, 'این روز در بازهٔ مجاز این فعالیت نیست.');
    } else {
      spend(reserved, date, job.minutes);
    }
  }
  for (const job of pending) {
    if (job.stage !== 'summary') continue;
    const due = earliest(job, dates, watched);
    if (due && (!job.watched || watched[job.chapter.id])) spend(summaryReservations, due, job.minutes);
  }
  const hasFixedSummary = job => job.stage === 'summary' && (!job.watched || watched[job.chapter.id]);
  for (let date = maxDate([from]); date <= LAST && pending.size; date = shift(date, 1)) {
    let videoPlanned = jobs.some(job => job.type === 'read' && dates.get(job.id) === date);
    const place = job => {
      dates.set(job.id, date);
      pending.delete(job);
      spend(used, date, job.minutes);
      if (job.type === 'read') videoPlanned = true;
      if (finalVideos.has(job.id)) spend(summaryReservations, shift(date, 1), 25);
    };
    const fits = (job, exact = false) => {
      const held = (summaryReservations.get(date) || 0) - (exact ? job.minutes : 0);
      if ((used.get(date) || 0) + (reserved.get(date) || 0) + Math.max(0, held) + job.minutes > capacity(date)) return false;
      if (!finalVideos.has(job.id)) return true;
      const tomorrow = shift(date, 1);
      return tomorrow <= LAST && (summaryReservations.get(tomorrow) || 0) + (reserved.get(tomorrow) || 0) + 25 <= capacity(tomorrow);
    };
    for (const job of pending) {
      const due = hasFixedSummary(job) && earliest(job, dates, watched);
      if (!due || due > date) continue;
      if (moves[job.id] === date && !invalid.has(job.id)) spend(reserved, date, -job.minutes);
      if (moves[job.id] && moves[job.id] !== date && !invalid.has(job.id)) {
        spend(reserved, moves[job.id], -job.minutes);
        invalid.set(job.id, 'مرور خلاصه باید فردای پایان ویدیو باشد.');
      }
      if (fits(job, due === date)) place(job);
      if (due === date) spend(summaryReservations, date, -job.minutes);
    }
    for (const job of pending) {
      if (moves[job.id] !== date || invalid.has(job.id)) continue;
      spend(reserved, date, -job.minutes);
      const due = earliest(job, dates, watched, true);
      if (!due || date < due) invalid.set(job.id, 'این تاریخ قبل از پایان پیش‌نیاز یا فاصلهٔ لازم است.');
      else if (hasFixedSummary(job)) invalid.set(job.id, 'مرور خلاصه باید فردای پایان ویدیو باشد.');
      else if (!fits(job)) invalid.set(job.id, 'ظرفیت این روز یا روز مرور بعدی کافی نیست.');
      else place(job);
    }
    if (!friday(date) && !videoPlanned) {
      const video = [...pending].find(job => job.type === 'read' &&
        (!moves[job.id] || invalid.has(job.id)) &&
        earliest(job, dates, watched) && earliest(job, dates, watched) <= date && fits(job));
      if (video) place(video);
    }
    for (const job of pending) {
      if (job.type === 'read') continue;
      if (moves[job.id] && !invalid.has(job.id)) continue;
      if (friday(date) ? job.type !== 'review' : job.stage === 'marked') continue;
      const due = earliest(job, dates, watched);
      if (!due || due > date || (hasFixedSummary(job) && due !== date)) continue;
      if (fits(job)) place(job);
    }
  }
  return { dates, invalid, backlog: [...pending] };
}

export const baseline = schedule();
