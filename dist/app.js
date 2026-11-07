import { plan } from './plan.js?v=4';

const $ = id => document.getElementById(id);
const storageKey = 'masir-arshad-1406.v1';
const dayMs = 86_400_000;
const timezone = 'Asia/Tehran';
const number = new Intl.NumberFormat('fa-IR');
const dateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
});
const isoFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const slots = ['۱۰:۰۰ تا ۱۱:۱۰', '۱۱:۲۰ تا ۱۲:۱۰', '۱۲:۲۰ تا ۱۳:۰۰'];
const slotMinutes = [70, 50, 40];
const activityNames = { read: 'مطالعه', test: 'تست', review: 'مرور' };
const subjects = ['مدار منطقی', 'مبانی کامپیوتر و برنامه‌سازی', 'معماری کامپیوتر', 'داده‌ساختارها و الگوریتم‌ها', 'نظریهٔ زبان‌ها و ماشین‌ها', 'سیستم‌های عامل', 'هوش مصنوعی', 'آزمون و مرور ترکیبی'];
const historicalSubjects = ['مبانی برنامه‌سازی', 'جبر خطی', 'داده‌ساختارها', 'الگوریتم‌ها', 'ریاضیات گسسته', 'آمار و احتمال'];
const routes = ['today', 'plan', 'log'];
const days = new Map(plan.flatMap((week, weekIndex) => week.days.map((day, dayIndex) => [day.date, {
  ...day, week: weekIndex, rest: dayIndex === 6 && weekIndex < 25, exam: weekIndex === 25 && dayIndex >= 5,
}])));

function dayKey() {
  const parts = Object.fromEntries(isoFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const midnight = date => Date.parse(`${date}T00:00:00Z`);
const shiftDate = (date, offset) => new Date(midnight(date) + offset * dayMs).toISOString().slice(0, 10);
const dateLabel = date => dateFormat.format(new Date(midnight(date)));
const taskId = (date, slot) => `${date}-${slot}`;

function parseState(serialized) {
  const data = JSON.parse(serialized || '{}') || {};
  const checked = Array.isArray(data.checked) ? data.checked.filter(key => typeof key === 'string') : [];
  const entries = Array.isArray(data.entries) ? data.entries.filter(entry => entry &&
    typeof entry.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Number.isFinite(midnight(entry.date)) &&
    (subjects.includes(entry.subject) || historicalSubjects.includes(entry.subject)) && Number.isInteger(entry.minutes) && entry.minutes >= 1 && entry.minutes <= 1440) : [];
  return { checked: new Set(checked), entries };
}

let state = { checked: new Set(), entries: [] };
let today = dayKey();
let weekIndex = days.get(today)?.week ?? (today < plan[0].days[0].date ? 0 : plan.length - 1);
let route = 'today';
let weekFilter = 'all';
let toastTimeout;

function readState() {
  try {
    state = parseState(localStorage.getItem(storageKey));
    $('storage-warning').hidden = true;
  } catch {
    $('storage-warning').hidden = false;
  }
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ checked: [...state.checked], entries: state.entries }));
    $('storage-warning').hidden = true;
    return true;
  } catch {
    $('storage-warning').hidden = false;
    return false;
  }
}

function tasksFor(day) {
  if (!day || day.rest || day.exam) return [];
  return day.tasks.flatMap((text, index) => {
    if (!text) return [];
    const suffix = day.revisedSpecialty?.includes(index) ? '-v4' : day.revised?.includes(index) ? '-v2' : '';
    const id = taskId(day.date, index) + suffix;
    return [{ text, index, id }];
  });
}

function emptyText(day) {
  if (!day) return 'برای این تاریخ جلسه‌ای در برنامهٔ ۲۶ هفته‌ای وجود ندارد.';
  return day.tasks.filter(Boolean).join('؛ ');
}

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${number.format(hours)} ساعت` : '', rest || !hours ? `${number.format(rest)} دقیقه` : ''].filter(Boolean).join(' و ');
}

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content) element.textContent = content;
  return element;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `./icons.svg#${name}`);
  svg.append(use);
  return svg;
}

function checkedCount(tasks) {
  return tasks.filter(task => state.checked.has(task.id)).length;
}

function progressText(tasks) {
  return `${number.format(checkedCount(tasks))} از ${number.format(tasks.length)} انجام شد`;
}

function taskList(container, day) {
  const tasks = tasksFor(day);
  container.replaceChildren();
  if (!tasks.length) {
    container.append(make('p', 'empty', emptyText(day)));
    return;
  }
  for (const task of tasks) {
    container.append(taskRow(task, slots[task.index]));
  }
}

function taskRow(task, context, type) {
    const label = make('label', 'task-row');
    const input = make('input', 'task-box');
    input.type = 'checkbox';
    input.checked = state.checked.has(task.id);
    input.dataset.task = task.id;
    const copy = make('span', 'min-w-0');
    copy.append(make('span', 'slot', context), make('span', 'task-label', task.text));
    label.append(input, copy);
    if (type) label.append(make('span', `activity-tag activity-${type}`, activityNames[type]));
    return label;
}

function renderToday() {
  const todayPlan = days.get(today);
  const tomorrow = shiftDate(today, 1);
  const tomorrowPlan = days.get(tomorrow);
  const tomorrowTasks = tasksFor(tomorrowPlan);
  $('header-date').textContent = dateLabel(today);
  $('hero-date').textContent = dateLabel(today);
  $('hero-week').textContent = todayPlan ? `هفتهٔ ${number.format(todayPlan.week + 1)} از ${number.format(plan.length)}` : 'برنامهٔ ۲۶ هفته‌ای';
  $('hero-topic').textContent = todayPlan && !todayPlan.rest && !todayPlan.exam
    ? `محور هفته ${plan[todayPlan.week].subject} است. نوبت‌های مطالعه از ساعت ۱۰ تا ۱۳.`
    : emptyText(todayPlan);
  $('tomorrow-date').textContent = dateLabel(tomorrow);
  $('reminder-dot').hidden = !tomorrowTasks.some(task => !state.checked.has(task.id)) && !tasksFor(todayPlan).some(task => !state.checked.has(task.id));
  taskList($('today-checklist'), todayPlan);
  $('tomorrow-list').replaceChildren();
  if (!tomorrowTasks.length) {
    $('tomorrow-list').append(make('li', 'empty', emptyText(tomorrowPlan)));
  } else {
    for (const task of tomorrowTasks) {
      const item = make('li', 'reminder-row');
      const dot = make('span', 'mt-2.5 size-2 shrink-0 rounded-full bg-brand/65');
      dot.setAttribute('aria-hidden', 'true');
      const copy = make('div', 'min-w-0');
      copy.append(make('span', 'slot block', slots[task.index]), make('span', '', task.text));
      if (state.checked.has(task.id)) copy.append(make('span', 'ms-1 text-xs font-bold text-brand', 'انجام شد'));
      item.append(dot, copy);
      $('tomorrow-list').append(item);
    }
  }
  updateTodayStats();
}

function updateTodayStats() {
  const todayTasks = tasksFor(days.get(today));
  const saturday = shiftDate(today, -((new Date(midnight(today)).getUTCDay() + 1) % 7));
  const currentWeek = state.entries.filter(entry => entry.date >= saturday && entry.date <= today);
  const total = entries => entries.reduce((sum, entry) => sum + entry.minutes, 0);
  $('today-minutes').textContent = duration(total(currentWeek.filter(entry => entry.date === today)));
  $('week-minutes').textContent = duration(total(currentWeek));
  $('today-completion').textContent = todayTasks.length ? `${number.format(checkedCount(todayTasks))} از ${number.format(todayTasks.length)}` : 'بدون جلسه';
  $('today-badge').textContent = todayTasks.length ? progressText(todayTasks) : 'بدون جلسه';
  $('reminder-dot').hidden = ![...todayTasks, ...tasksFor(days.get(shiftDate(today, 1)))].some(task => !state.checked.has(task.id));
}

function renderWeek() {
  const week = plan[weekIndex];
  $('week-select').value = String(weekIndex);
  $('selected-week-title').textContent = `هفتهٔ ${number.format(weekIndex + 1)}`;
  $('selected-week-subject').textContent = `${week.range} · ${week.subject}`;
  $('week-position').textContent = `${number.format(weekIndex + 1)} از ${number.format(plan.length)}`;
  $('prev-week').disabled = weekIndex === 0;
  $('next-week').disabled = weekIndex === plan.length - 1;
  const courses = new Map();
  const notes = [];
  let count = 0;
  let minutes = 0;
  for (const { date } of week.days) {
    const day = days.get(date);
    const tasks = tasksFor(day);
    if (!tasks.length) notes.push(make('p', '', `${dateLabel(date)} · ${emptyText(day)}`));
    for (const task of tasks) {
      const { subject, type } = classifyTask(task, week.subject);
      const length = slotMinutes[task.index];
      count += 1;
      minutes += length;
      if (weekFilter !== 'all' && weekFilter !== type) continue;
      if (!courses.has(subject)) courses.set(subject, []);
      courses.get(subject).push({ task, date, type, length });
    }
  }
  const list = $('week-days');
  list.replaceChildren();
  if (!courses.size) list.append(make('p', 'empty', 'برای این فیلتر فعالیتی در هفته وجود ندارد.'));
  for (const [subject, activities] of courses) {
    const course = make('details', 'plan-course');
    course.open = true;
    const title = make('summary');
    title.append(make('strong', '', subject), make('span', '', `${number.format(activities.length)} فعالیت · ${duration(activities.reduce((sum, item) => sum + item.length, 0))}`));
    const body = make('div', 'plan-course-body');
    for (const { task, date, type, length } of activities) {
      body.append(taskRow(task, `${dateLabel(date)} · ${slots[task.index]} · ${duration(length)}`, type));
    }
    course.append(title, body);
    list.append(course);
  }
  $('week-notes').replaceChildren(...notes);
  $('planned-time').textContent = duration(minutes);
  $('planned-count').textContent = number.format(count);
  for (const button of $('week-filters').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.filter === weekFilter));
  updateWeekProgress();
}

const courseAliases = new Map([
  ['برنامه‌سازی', 'مبانی کامپیوتر و برنامه‌سازی'], ['مبانی برنامه‌سازی', 'مبانی کامپیوتر و برنامه‌سازی'],
  ['داده‌ساختار', 'داده‌ساختارها و الگوریتم‌ها'], ['داده‌ساختارها', 'داده‌ساختارها و الگوریتم‌ها'],
  ['الگوریتم', 'داده‌ساختارها و الگوریتم‌ها'], ['الگوریتم‌ها', 'داده‌ساختارها و الگوریتم‌ها'],
  ['معماری', 'معماری کامپیوتر'], ['نظریهٔ زبان‌ها', 'نظریهٔ زبان‌ها و ماشین‌ها'], ['سیستم عامل', 'سیستم‌های عامل'],
]);

function classifyTask(task, mainSubject) {
  const [prefix, ...parts] = task.text.split('،');
  const explicit = courseAliases.get(prefix) || (subjects.includes(prefix) ? prefix : null);
  const topic = (parts.length && (explicit || prefix === mainSubject) ? parts.join('،') : task.text).trim();
  const assessment = /^(آزمون|\d|[۰-۹]+ تا [۰-۹]+ تست ترکیبی)/.test(topic) && /آزمون|زمان‌دار|تست ترکیبی/.test(topic);
  const type = /مرور|تحلیل (?:آزمون|پاسخ)|حل دوباره|ترمیم|ثبت (?:اولویت|نتیجه)|انتخاب یک مبحث/.test(topic) && !assessment
    ? 'review' : assessment || task.index === 1 || /^(?:تست|حل تست)/.test(topic) ? 'test' : 'read';
  return { type, subject: explicit || (assessment ? 'آزمون و مرور ترکیبی' : task.index === 2 ? 'مرور و جمع‌بندی' : courseAliases.get(mainSubject) || mainSubject) };
}

function updateWeekProgress() {
  const tasks = plan[weekIndex].days.flatMap(({ date }) => tasksFor(days.get(date)));
  $('week-progress').textContent = progressText(tasks);
}

function renderLog() {
  $('log-total').textContent = `مجموع زمان ثبت‌شده: ${duration(state.entries.reduce((sum, entry) => sum + entry.minutes, 0))}`;
  $('log-rows').replaceChildren();
  if (!state.entries.length) {
    $('log-rows').append(make('p', 'empty', 'هنوز زمانی ثبت نشده. اولین نوبت مطالعه را اضافه کن.'));
    return;
  }
  const list = make('ul', 'divide-y divide-line');
  for (const entry of state.entries) {
    const row = make('li', 'flex min-h-16 flex-wrap items-center justify-between gap-2 py-2');
    const title = make('div', 'min-w-0');
    title.append(make('p', 'font-bold', entry.subject), make('p', 'text-xs text-muted', dateLabel(entry.date)));
    const actions = make('div', 'ms-auto flex items-center gap-2');
    const remove = make('button', 'icon-button');
    remove.type = 'button';
    remove.dataset.removeEntry = entry.id;
    remove.setAttribute('aria-label', `حذف ثبت ${duration(entry.minutes)} برای ${entry.subject}`);
    remove.append(icon('trash'));
    actions.append(make('p', 'text-sm font-bold tabular-nums', duration(entry.minutes)), remove);
    row.append(title, actions);
    list.append(row);
  }
  $('log-rows').append(list);
}

function showView(next, focus = false) {
  route = next;
  for (const name of routes) $(name + '-view').hidden = name !== route;
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (route === 'today') renderToday();
  if (route === 'plan') renderWeek();
  if (route === 'log') renderLog();
  if (focus) {
    $('main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function routeFromHash(focus = false) {
  const name = location.hash.slice(1);
  if (name === 'main') return;
  showView(routes.includes(name) ? name : 'today', focus);
}

function refreshDate() {
  const next = dayKey();
  if (next === today) return;
  const oldWeek = days.get(today)?.week;
  today = next;
  if (oldWeek === weekIndex && days.has(today)) weekIndex = days.get(today).week;
  renderToday();
  if (route === 'plan') renderWeek();
  if ($('log-dialog').open) $('log-date').textContent = dateLabel(today);
}

function announce(message) {
  clearTimeout(toastTimeout);
  $('message').textContent = message;
  $('message').hidden = false;
  toastTimeout = setTimeout(() => { $('message').hidden = true; }, 4200);
}

function clearDurationError() {
  $('duration-error').hidden = true;
  $('log-duration').removeAttribute('aria-invalid');
}

function openLog() {
  refreshDate();
  $('log-form').reset();
  clearDurationError();
  const plannedSubject = plan[days.get(today)?.week]?.subject;
  const subject = courseAliases.get(plannedSubject) || plannedSubject;
  if (subjects.includes(subject)) $('log-subject').value = subject;
  $('log-date').textContent = dateLabel(today);
  $('log-dialog').showModal();
  $('log-duration').focus();
}

for (let index = 0; index < plan.length; index += 1) {
  $('week-select').add(new Option(`هفتهٔ ${number.format(index + 1)}`, String(index)));
}
for (const subject of subjects) $('log-subject').add(new Option(subject, subject));

$('week-select').addEventListener('change', event => { weekIndex = Number(event.target.value); renderWeek(); });
$('week-filters').addEventListener('click', event => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  weekFilter = button.dataset.filter;
  renderWeek();
});
$('print-week').addEventListener('click', () => window.print());
let collapsedForPrint = [];
window.addEventListener('beforeprint', () => {
  if (route !== 'plan') return;
  document.body.classList.add('print-plan');
  collapsedForPrint = [...$('week-days').querySelectorAll('details:not([open])')];
  collapsedForPrint.forEach(course => { course.open = true; });
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-plan');
  collapsedForPrint.forEach(course => { course.open = false; });
  collapsedForPrint = [];
});
$('prev-week').addEventListener('click', () => { weekIndex -= 1; renderWeek(); if (!$('prev-week').disabled) return; $('week-select').focus(); });
$('next-week').addEventListener('click', () => { weekIndex += 1; renderWeek(); if (!$('next-week').disabled) return; $('week-select').focus(); });
$('close-log').addEventListener('click', () => $('log-dialog').close());
$('log-duration').addEventListener('input', clearDurationError);
$('reminder-button').addEventListener('click', () => {
  refreshDate();
  if (route !== 'today') { history.pushState(null, '', '#today'); showView('today'); }
  $('reminders').focus();
});

document.addEventListener('change', event => {
  const input = event.target;
  if (!input.matches('input[data-task]')) return;
  if ($('storage-warning').hidden) readState();
  if (input.checked) state.checked.add(input.dataset.task);
  else state.checked.delete(input.dataset.task);
  saveState();
  updateTodayStats();
  if (route === 'plan') updateWeekProgress();
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-open-log]')) openLog();
  const preset = event.target.closest('[data-minutes]');
  if (preset) {
    $('log-duration').value = number.format(Number(preset.dataset.minutes));
    clearDurationError();
  }
  const remove = event.target.closest('[data-remove-entry]');
  if (!remove || !window.confirm('این نوبت مطالعه حذف شود؟')) return;
  if ($('storage-warning').hidden) readState();
  state.entries = state.entries.filter(entry => entry.id !== remove.dataset.removeEntry);
  const saved = saveState();
  renderLog();
  document.querySelector('#log-view [data-open-log]').focus();
  announce(saved ? 'نوبت مطالعه حذف شد.' : 'حذف فقط در همین صفحه اعمال شد.');
});

$('log-form').addEventListener('submit', event => {
  event.preventDefault();
  refreshDate();
  const raw = $('log-duration').value.trim().replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
  const minutes = Number(raw);
  if (!/^\d{1,4}$/.test(raw) || minutes < 1 || minutes > 1440) {
    $('duration-error').hidden = false;
    $('log-duration').setAttribute('aria-invalid', 'true');
    $('log-duration').focus();
    return;
  }
  if ($('storage-warning').hidden) readState();
  state.entries.unshift({ id: crypto.randomUUID(), date: today, subject: $('log-subject').value, minutes });
  const saved = saveState();
  $('log-dialog').close();
  updateTodayStats();
  if (route === 'log') renderLog();
  announce(saved ? 'زمان مطالعه ثبت شد.' : 'زمان فعلاً فقط در همین صفحه ثبت شد.');
});

window.addEventListener('hashchange', () => routeFromHash(true));
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  readState();
  showView(route);
});
window.addEventListener('focus', refreshDate);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });
setInterval(refreshDate, 30_000);
readState();
renderToday();
routeFromHash();
