import { weeks } from './source-weeks.js';
import { exportBackup, mergeBackup } from './backup.js';
import { fromPersian, isFixed, planSessions, shift, toPersian } from './session-calendar.js';

const $ = id => document.getElementById(id);
const storageKey = 'masir-arshad-1406.v1';
const timezone = 'Asia/Tehran';
const number = new Intl.NumberFormat('fa-IR');
const dateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const isoFormat = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const routes = ['today', 'plan', 'adaptive', 'log'];
const activities = new Map(weeks.flatMap(week => week.courses.flatMap(course => course.activities.map(activity => [activity.id, activity]))));
const subjects = [...new Set([...activities.values()].map(activity => activity.subject))];
const midnight = date => Date.parse(date + 'T00:00:00Z');
const examStart = fromPersian(1406, 2, 16);
const examEnd = fromPersian(1406, 2, 17);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(midnight(date)) && shift(date, 0) === date;
function dateLabel(date) {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(midnight(date))).map(({type, value}) => [type, value]));
  return [parts.weekday, parts.day, parts.month, parts.year].join(' ');
}
const sumMinutes = rows => rows.reduce((sum, row) => sum + row.minutes, 0);

function dayKey() {
  const parts = Object.fromEntries(isoFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join('-');
}

function weekFor(date) {
  const index = weeks.findIndex(week => date >= week.start && date < week.end);
  return index < 0 ? (date < weeks[0].start ? 0 : weeks.length - 1) : index;
}

function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function action(label, field, id) {
  const button = make('button', 'button-secondary', label);
  button.type = 'button';
  button.dataset[field] = id;
  return button;
}

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? number.format(hours) + ' ساعت' : '', rest || !hours ? number.format(rest) + ' دقیقه' : ''].filter(Boolean).join(' و ');
}

function readHours(input) {
  const raw = input.trim().replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15)).replace(/[٫,]/g, '.');
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
}

function readState() {
  try {
    const previous = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    state = {
      ...previous,
      entries: Array.isArray(previous.entries) ? previous.entries.filter(entry => entry && validDate(entry.date) && typeof entry.subject === 'string' && Number.isInteger(entry.minutes) && entry.minutes > 0) : [],
      source18Done: Array.isArray(previous.source18Done) ? previous.source18Done.filter(id => activities.has(id)) : [],
      source18Sessions: Array.isArray(previous.source18Sessions) ? previous.source18Sessions.filter(session => session && activities.has(session.activity) && validDate(session.date) && Number.isInteger(session.minutes) && session.minutes > 0) : [],
      source18Omitted: Object.fromEntries(Object.entries(previous.source18Omitted || {}).filter(([, item]) => item && activities.has(item.activity) && Number.isInteger(item.minutes) && item.minutes >= 0)),
    };
    $('storage-warning').hidden = true;
  } catch {
    $('storage-warning').hidden = false;
  }
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    $('storage-warning').hidden = true;
    return true;
  } catch {
    $('storage-warning').hidden = false;
    return false;
  }
}

function refreshStoredState() {
  if ($('storage-warning').hidden) readState();
  refreshSchedule();
}

let state = { entries: [], source18Done: [], source18Sessions: [], source18Omitted: {} };
let today = dayKey();
let weekIndex = weekFor(today);
let filter = 'all';
let route = 'today';
let toastTimer;
let sessionEdit;
const dialog = $('chapter-dialog');
let queuedSessions = [];

function refreshSchedule() {
  const { sessions, queue } = planSessions(weeks, state.source18Sessions, state.source18Done, state.source18Omitted, today);
  queuedSessions = queue;
  if (JSON.stringify(sessions) === JSON.stringify(state.source18Sessions)) return;
  state.source18Sessions = sessions;
  saveState();
}

function announce(message) {
  clearTimeout(toastTimer);
  $('message').textContent = message;
  $('message').hidden = false;
  toastTimer = setTimeout(() => { $('message').hidden = true; }, 4200);
}

function row(activity, detail, checked, field, id) {
  const card = make('div', 'chapter-task');
  const label = make('label', 'task-row');
  const input = make('input', 'task-box');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset[field] = id;
  const copy = make('span', 'min-w-0');
  copy.append(make('span', 'slot', detail), make('span', 'task-label', activity.text));
  label.append(input, copy, make('span', 'activity-tag activity-' + activity.type, activity.typeLabel));
  card.append(label);
  return card;
}

function sessionRow(session) {
  const activity = activities.get(session.activity);
  const clock = minutes => number.format(10 + Math.floor(minutes / 60)) + ':' + String(minutes % 60).padStart(2, '0').replace(/\d/g, digit => number.format(Number(digit)));
  const daySessions = session.auto ? state.source18Sessions.filter(item => item.date === session.date) : [];
  const autoSessions = daySessions.filter(item => item.auto);
  const start = sumMinutes(daySessions.filter(item => !item.auto)) +
    sumMinutes(autoSessions.slice(0, autoSessions.findIndex(item => item.id === session.id)));
  const end = start + session.minutes;
  const times = session.auto ? [[0,70,0],[70,120,10],[120,160,20]].flatMap(([from,to,rest]) => {
    const a = Math.max(from, start), b = Math.min(to, end);
    return a < b ? [clock(a + rest) + ' تا ' + clock(b + rest)] : [];
  }).join(' / ') : '';
  const detail = [dateLabel(session.date), activity.subject, duration(session.minutes), session.auto ? 'خودکار' : 'دستی', times].filter(Boolean).join(' · ');
  const card = row(activity, detail,
    Boolean(session.done), 'checkSession', session.id);
  const buttons = make('div', 'flex flex-wrap gap-2');
  buttons.append(action('ویرایش نوبت', 'editSession', session.id), action('حذف نوبت', 'removeSession', session.id));
  card.append(buttons);
  return card;
}

function renderSessions(container, sessions, message) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  container.replaceChildren(...(sorted.length ? sorted.map(sessionRow) : [make('p', 'empty', message)]));
}

function renderToday() {
  const daysToExam = (midnight(examStart) - midnight(today)) / 86400000;
  const examStatus = daysToExam > 0 ? number.format(daysToExam) + ' روز تا آغاز آزمون' :
    today <= examEnd ? 'بازهٔ برگزاری آزمون' : 'بازهٔ آزمون به پایان رسید';
  const countdown = $('exam-countdown-status');
  if (countdown.textContent !== examStatus) countdown.textContent = examStatus;
  const tomorrow = shift(today, 1);
  const todaySessions = state.source18Sessions.filter(session => session.date === today);
  const tomorrowSessions = state.source18Sessions.filter(session => session.date === tomorrow);
  const index = weekFor(today);
  const inPlan = today >= weeks[index].start && today < weeks[index].end;
  $('hero-week').textContent = inPlan ? weeks[index].title + ' از ۱۸' : 'برنامهٔ ۱۸ هفته‌ای';
  $('hero-topic').textContent = 'نوبت‌های خودکار و دستی اینجا نمایش داده می‌شوند. از تقویم ثابت می‌توانی نوبت اضافه کنی.';
  $('header-date').textContent = dateLabel(today);
  $('hero-date').textContent = dateLabel(today);
  $('tomorrow-date').textContent = dateLabel(tomorrow);
  renderSessions($('today-checklist'), todaySessions, 'برای امروز نوبتی ثبت نشده است.');
  renderSessions($('tomorrow-list'), tomorrowSessions, 'برای فردا نوبتی ثبت نشده است.');
  const done = todaySessions.filter(session => session.done).length;
  $('today-completion').textContent = number.format(done) + ' از ' + number.format(todaySessions.length);
  $('today-badge').textContent = todaySessions.length ? number.format(done) + ' انجام شد' : 'بدون نوبت';
  $('reminder-dot').hidden = ![...todaySessions, ...tomorrowSessions].some(session => !session.done);
  const saturday = weekStart(today);
  $('today-minutes').textContent = duration(sumMinutes(state.entries.filter(entry => entry.date === today)));
  $('week-minutes').textContent = duration(sumMinutes(state.entries.filter(entry => entry.date >= saturday && entry.date <= today)));
}

function renderWeek() {
  const week = weeks[weekIndex];
  const all = week.courses.flatMap(course => course.activities);
  $('week-select').value = String(weekIndex);
  $('prev-week').disabled = weekIndex === 0;
  $('next-week').disabled = weekIndex === weeks.length - 1;
  $('selected-week-title').textContent = week.title;
  $('selected-week-subject').textContent = week.range;
  $('week-position').textContent = number.format(weekIndex + 1) + ' از ' + number.format(weeks.length);
  $('planned-time').textContent = week.totalLabel;
  $('planned-count').textContent = number.format(all.length);
  updateWeekProgress(all);
  $('week-notes').textContent = week.note;
  for (const button of $('week-filters').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  const list = $('week-days');
  list.replaceChildren();
  for (const course of week.courses) {
    const selected = course.activities.filter(task => filter === 'all' || filter === task.type);
    if (!selected.length) continue;
    const group = make('details', 'plan-course');
    group.open = true;
    group.append(make('summary', 'font-bold', course.subject));
    const body = make('div', 'plan-course-body');
    for (const task of selected) {
      const card = row(task, task.hoursLabel, state.source18Done.includes(task.id), 'checkActivity', task.id);
      card.append(action('افزودن نوبت', 'addSession', task.id));
      body.append(card);
    }
    group.append(body);
    list.append(group);
  }
  if (!list.children.length) list.append(make('p', 'empty', all.length ? 'فعالیتی با فیلتر انتخاب‌شده وجود ندارد.' : 'در فایل این هفته فعالیتی ثبت نشده است.'));
}

function updateWeekProgress(all = weeks[weekIndex].courses.flatMap(course => course.activities)) {
  $('week-progress').textContent = number.format(all.filter(task => state.source18Done.includes(task.id)).length) + ' از ' + number.format(all.length) + ' انجام شد';
}

function renderLog() {
  $('log-total').textContent = 'مجموع زمان ثبت‌شده: ' + duration(sumMinutes(state.entries));
  const list = $('log-rows');
  list.replaceChildren();
  if (!state.entries.length) list.append(make('p', 'empty', 'هنوز زمانی ثبت نشده است.'));
  for (const entry of state.entries) {
    const item = make('div', 'flex flex-wrap items-center justify-between gap-2 border-b border-line py-2');
    item.append(make('span', '', entry.subject + ' · ' + dateLabel(entry.date) + ' · ' + duration(entry.minutes)), action('حذف ثبت', 'removeEntry', entry.id));
    list.append(item);
  }
  renderChart();
}

const weekStart = date => shift(date, -((new Date(midnight(date)).getUTCDay() + 1) % 7));
function monthStart(date, delta = 0) {
  const {year, month} = toPersian(date);
  const index = month - 1 + delta;
  return fromPersian(year + Math.floor(index / 12), (index + 12) % 12 + 1, 1);
}
let chartAnchor = null;
const chartMode = () => $('chart-range').value;
const periodStart = (date, mode) => mode === 'week' ? weekStart(date) : monthStart(date);

function renderChart() {
  const actualSince = start => duration(sumMinutes(state.entries.filter(entry => entry.date >= start && entry.date <= today)));
  $('log-week-total').textContent = actualSince(weekStart(today));
  $('log-month-total').textContent = actualSince(monthStart(today));
  const mode = chartMode();
  const calendar = mode === 'week' || mode === 'month';
  const start = calendar ? periodStart(chartAnchor || today, mode) : shift(today, 1 - Number(mode));
  const end = mode === 'week' ? shift(start, 6) : mode === 'month' ? shift(monthStart(start, 1), -1) : today;
  $('chart-period-controls').hidden = !calendar;
  $('chart-period-label').textContent = dateLabel(start) + ' تا ' + dateLabel(end);
  $('chart-next').disabled = calendar && start >= periodStart(today, mode);
  const count = (midnight(end) - midnight(start)) / 86400000 + 1;
  const days = Array.from({length: count}, (_, index) => {
    const date = shift(start, index);
    return { date, planned: sumMinutes(state.source18Sessions.filter(session => session.date === date)),
      actual: sumMinutes(state.entries.filter(entry => entry.date === date)) };
  });
  const max = Math.max(60, ...days.flatMap(day => [day.planned, day.actual]));
  $('chart-scale').textContent = 'مقیاس نمودار تا ' + duration(max);
  const chart = $('study-chart');
  const table = $('chart-table');
  chart.replaceChildren();
  table.replaceChildren();
  for (const { date, planned, actual } of days) {
    const column = make('div', 'chart-day');
    const bars = make('div', 'chart-bars');
    for (const [kind, value] of [['planned', planned], ['actual', actual]]) {
      const bar = make('i', 'chart-' + kind);
      bar.style.height = (value / max * 100) + '%';
      bar.title = duration(value);
      bars.append(bar);
    }
    const {month, day} = toPersian(date);
    column.append(bars, make('span', '', number.format(month) + '/' + number.format(day)));
    chart.append(column);
    const row = make('tr');
    const label = make('th', '', dateLabel(date));
    label.scope = 'row';
    row.append(label, make('td', '', duration(planned)), make('td', '', duration(actual)));
    table.append(row);
  }
}
$('chart-range').addEventListener('change', () => {
  chartAnchor = null;
  renderChart();
});
for (const [id, step] of [['chart-prev', -1], ['chart-next', 1]]) $(id).addEventListener('click', () => {
  const mode = chartMode();
  const start = periodStart(chartAnchor || today, mode);
  const next = mode === 'week' ? shift(start, step * 7) : monthStart(start, step);
  if (next > periodStart(today, mode)) return;
  chartAnchor = next === periodStart(today, mode) ? null : next;
  renderChart();
});
$('chart-pick').addEventListener('click', () => {
  const month = chartMode() === 'month';
  $('chart-picker-title').textContent = month ? 'انتخاب ماه' : 'انتخاب روزی از هفته';
  $('chart-day-field').hidden = month;
  $('chart-date-error').textContent = '';
  openPersianDate(chartAnchor || today, 'chart-date');
  $('chart-dialog').showModal();
});
$('chart-cancel').addEventListener('click', () => $('chart-dialog').close());
$('chart-picker').addEventListener('submit', event => {
  event.preventDefault();
  const mode = chartMode();
  const date = mode === 'month' ? fromPersian(Number($('chart-date-year').value), Number($('chart-date-month').value), 1) : selectedDate('chart-date');
  const current = periodStart(today, mode);
  if (!date || periodStart(date, mode) > current) {
    $('chart-date-error').textContent = 'دورهٔ جاری یا یکی از دوره‌های گذشته را انتخاب کن.';
    return;
  }
  chartAnchor = periodStart(date, mode) === current ? null : date;
  $('chart-dialog').close();
  renderChart();
});

function renderQueue() {
  $('queue-title').textContent = 'صف نوبت‌های تعیین‌نشده · ' + duration(sumMinutes(queuedSessions));
  $('queue-list').replaceChildren(...(queuedSessions.length ? queuedSessions.map(({activity, minutes}) => {
    const item = make('div', 'empty flex flex-wrap items-center justify-between gap-2');
    item.append(make('span', '', activity.subject + ' · ' + activity.text + ' · ' + duration(minutes)), action('افزودن نوبت', 'addSession', activity.id));
    return item;
  }) : [make('p', 'empty', 'همهٔ فعالیت‌های باقی‌مانده نوبت دارند.')]));
}

function render() {
  refreshSchedule();
  renderToday();
  if (route === 'plan') renderWeek();
  if (route === 'adaptive') {
    renderSessions($('personal-list'), state.source18Sessions, 'نوبتی ثبت نشده است. از تقویم ثابت یک فعالیت انتخاب کن.');
    renderQueue();
  }
  if (route === 'log') renderLog();
}

function showRoute() {
  const hash = location.hash.slice(1);
  if (hash === 'main') return;
  route = routes.includes(hash) ? hash : 'today';
  for (const name of routes) $(name + '-view').hidden = name !== route;
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  render();
}

function refreshDate() {
  const next = dayKey();
  if (next === today) return;
  if (weekIndex === weekFor(today)) weekIndex = weekFor(next);
  today = next;
  render();
}

const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
for (const prefix of ['date', 'log-date', 'chart-date']) {
  months.forEach((name, index) => $(prefix + '-month').add(new Option(name, String(index + 1))));
}

function updateDays(prefix, day = Number($(prefix + '-day').value) || 1) {
  const year = Number($(prefix + '-year').value), month = Number($(prefix + '-month').value);
  const count = month < 7 ? 31 : month < 12 ? 30 : fromPersian(year, month, 30) ? 30 : 29;
  $(prefix + '-day').replaceChildren(...Array.from({length: count}, (_, index) => new Option(number.format(index + 1), String(index + 1))));
  $(prefix + '-day').value = String(Math.min(day, count));
}

function openPersianDate(date, prefix = 'date') {
  const {year, month, day} = toPersian(date);
  const current = toPersian(today).year;
  const min = Math.min(current - 5, year);
  const max = Math.max(current + 10, year);
  $(prefix + '-year').replaceChildren(...Array.from({length: max - min + 1}, (_, index) => new Option(number.format(min + index).replace('٬', ''), String(min + index))));
  $(prefix + '-year').value = String(year);
  $(prefix + '-month').value = String(month);
  updateDays(prefix, day);
}

const selectedDate = prefix => fromPersian(...['year', 'month', 'day'].map(part => Number($(prefix + '-' + part).value)));
for (const part of ['year', 'month', 'day']) $('chart-date-' + part).addEventListener('change', () => {
  if (part !== 'day') updateDays('chart-date');
  $('chart-date-error').textContent = '';
});

function editSession(activityId, session) {
  sessionEdit = { activityId, id: session?.id };
  const activity = activities.get(activityId);
  $('chapter-dialog-title').textContent = session ? 'ویرایش نوبت شخصی' : 'افزودن نوبت شخصی';
  $('chapter-dialog-task').textContent = activity.subject + ' · ' + activity.text;
  openPersianDate(session?.date || today);
  $('session-hours').value = session ? String(Number((session.minutes / 60).toFixed(4))) : '';
  validateSession();
  dialog.showModal();
}

function validateSession() {
  const activity = activities.get(sessionEdit.activityId);
  const all = state.source18Sessions.filter(session => session.activity === activity.id);
  const scheduled = sumMinutes(all);
  const editing = all.find(session => session.id === sessionEdit.id);
  const available = activity.minutes - sumMinutes(all.filter(session => session.id !== sessionEdit.id && isFixed(session, today)));
  const hours = readHours($('session-hours').value);
  const minutes = Math.round(hours * 60);
  const date = selectedDate('date');
  $('chapter-preview').textContent = 'مدت اصلی: ' + activity.hoursLabel + ' · تعیین‌شده: ' + duration(scheduled) +
    ' · باقی‌مانده: ' + duration(Math.max(0, activity.minutes - scheduled)) + ' · ظرفیت نوبت دستی: ' + duration(Math.max(0, available));
  let error = '';
  if (sessionEdit.id && !editing) error = 'این نوبت دیگر وجود ندارد.';
  else if (!validDate(date)) error = 'تاریخ معتبر انتخاب کن.';
  else if (!Number.isSafeInteger(minutes) || minutes < 1) error = 'مدت مثبت را به ساعت وارد کن.';
  else if (minutes > available) error = 'مجموع نوبت‌ها نباید از مدت فعالیت اصلی بیشتر شود. ظرفیت این نوبت: ' + duration(Math.max(0, available));
  $('session-error').textContent = error;
  $('chapter-save').disabled = Boolean(error);
  return error ? null : { id: editing?.id || crypto.randomUUID(), activity: activity.id, date, minutes, done: Boolean(editing?.done) };
}

$('chapter-form').addEventListener('input', validateSession);
for (const id of ['date-year','date-month','date-day']) $(id).addEventListener('change', () => {
  if (id !== 'date-day') updateDays('date');
  validateSession();
});
$('chapter-form').addEventListener('submit', event => {
  event.preventDefault();
  refreshStoredState();
  const session = validateSession();
  if (!session) return;
  const index = state.source18Sessions.findIndex(item => item.id === session.id);
  if (index === -1) state.source18Sessions.push(session);
  else {
    const previous = state.source18Sessions[index];
    if (previous.auto) state.source18Omitted[previous.id] = { activity: previous.activity, minutes: 0 };
    state.source18Sessions[index] = session;
  }
  saveState();
  dialog.close();
  render();
});
$('chapter-close').addEventListener('click', () => dialog.close());

function selectWeek(index) {
  weekIndex = Math.max(0, Math.min(index, weeks.length - 1));
  renderWeek();
}

weeks.forEach((week, index) => $('week-select').add(new Option(week.title, String(index))));
subjects.forEach(subject => $('log-subject').add(new Option(subject, subject)));
$('week-select').addEventListener('change', event => selectWeek(Number(event.target.value)));
$('prev-week').addEventListener('click', () => selectWeek(weekIndex - 1));
$('next-week').addEventListener('click', () => selectWeek(weekIndex + 1));
$('week-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  renderWeek();
});
$('print-week').addEventListener('click', () => window.print());
let printGroups = [];
window.addEventListener('beforeprint', () => {
  if (route !== 'plan') return;
  document.body.classList.add('print-plan');
  printGroups = [...$('week-days').querySelectorAll('details:not([open])')];
  printGroups.forEach(group => { group.open = true; });
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-plan');
  printGroups.forEach(group => { group.open = false; });
  printGroups = [];
});
$('reminder-button').addEventListener('click', () => {
  if (route !== 'today') { history.pushState(null, '', '#today'); showRoute(); }
  $('reminders').focus();
});

document.addEventListener('change', event => {
  const input = event.target;
  const { checkSession, checkActivity } = input.dataset;
  if (!checkSession && !checkActivity) return;
  refreshStoredState();
  if (checkSession) {
    const session = state.source18Sessions.find(item => item.id === checkSession);
    if (session) session.done = input.checked;
  } else {
    const done = new Set(state.source18Done);
    if (input.checked) done.add(checkActivity);
    else done.delete(checkActivity);
    state.source18Done = [...done];
  }
  saveState();
  if (checkActivity || route === 'today') render();
});

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { addSession, editSession: editId, removeSession, hours, removeEntry } = button.dataset;
  if (addSession) { refreshStoredState(); editSession(addSession); }
  if (editId) {
    refreshStoredState();
    const session = state.source18Sessions.find(item => item.id === editId);
    if (session) editSession(session.activity, session);
  }
  if (removeSession && window.confirm('این نوبت شخصی حذف شود؟')) {
    refreshStoredState();
    const removed = state.source18Sessions.find(session => session.id === removeSession);
    if (removed?.auto) state.source18Omitted[removed.id] = { activity: removed.activity, minutes: removed.minutes };
    state.source18Sessions = state.source18Sessions.filter(session => session.id !== removeSession);
    saveState();
    render();
  }
  if (removeEntry && window.confirm('این ثبت زمان حذف شود؟')) {
    refreshStoredState();
    state.entries = state.entries.filter(entry => entry.id !== removeEntry);
    saveState();
    render();
  }
  if (button.hasAttribute('data-open-log')) {
    refreshDate();
    $('log-form').reset();
    openPersianDate(today, 'log-date');
    $('log-date-error').textContent = '';
    $('duration-error').hidden = true;
    $('log-dialog').showModal();
    $('log-duration').focus();
  }
  if (hours) {
    $('log-duration').value = number.format(Number(hours));
    $('duration-error').hidden = true;
  }
});
$('close-log').addEventListener('click', () => $('log-dialog').close());
$('log-duration').addEventListener('input', () => { $('duration-error').hidden = true; });
for (const part of ['year', 'month', 'day']) $('log-date-' + part).addEventListener('change', () => {
  if (part !== 'day') updateDays('log-date');
  $('log-date-error').textContent = '';
});
$('log-form').addEventListener('submit', event => {
  event.preventDefault();
  refreshDate();
  const date = selectedDate('log-date');
  if (!validDate(date) || date > today) {
    $('log-date-error').textContent = 'تاریخ امروز یا یکی از روزهای گذشته را انتخاب کن.';
    $('log-date-day').focus();
    return;
  }
  const hours = readHours($('log-duration').value);
  const minutes = Math.round(hours * 60);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || hours > 24) {
    $('duration-error').hidden = false;
    $('log-duration').focus();
    return;
  }
  refreshStoredState();
  state.entries.unshift({ id: crypto.randomUUID(), date, subject: $('log-subject').value, minutes });
  const saved = saveState();
  $('log-dialog').close();
  render();
  announce(saved ? 'زمان مطالعه ثبت شد.' : 'زمان مطالعه فعلاً در همین صفحه ثبت شد.');
});
window.addEventListener('hashchange', showRoute);
$('backup-export').addEventListener('click', () => {
  refreshStoredState();
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportBackup(state), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'masir-arshad-' + dayKey() + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('backup-import').addEventListener('click', () => $('backup-file').click());
$('backup-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const status = $('backup-status');
  try {
    let backup;
    try { backup = JSON.parse(await file.text()); }
    catch { throw new Error('خواندن فایل JSON ممکن نبود.'); }
    if ($('storage-warning').hidden) readState();
    const merged = mergeBackup(state, backup, activities, validDate);
    const planned = planSessions(weeks, merged.state.source18Sessions, merged.state.source18Done, merged.state.source18Omitted, dayKey());
    merged.state.source18Sessions = planned.sessions;
    const previous = state;
    state = merged.state;
    if (!saveState()) {
      state = previous;
      throw new Error('ذخیرهٔ فایل در مرورگر ممکن نبود.');
    }
    render();
    status.textContent = number.format(merged.added) + ' افزوده شد، ' + number.format(merged.duplicates) +
      ' تکراری و ' + number.format(merged.conflicts) + ' متعارض.';
  } catch (error) {
    status.textContent = error.message;
  }
});
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) { readState(); render(); }
});
window.addEventListener('focus', refreshDate);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
setInterval(refreshDate, 30_000);
readState();
showRoute();
