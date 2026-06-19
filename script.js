// --- Constants & Config ---

const SEASONS = {
    spring: { months: [2, 3, 4], color: 'text-pink-400', line: 'bg-pink-400', icon: 'wind' },
    summer: { months: [5, 6, 7], color: 'text-indigo-400', line: 'bg-indigo-400', icon: 'sun' },
    autumn: { months: [8, 9, 10], color: 'text-amber-600', line: 'bg-amber-600', icon: 'moon' },
    winter: { months: [11, 0, 1], color: 'text-slate-400', line: 'bg-slate-400', icon: 'snowflake' },
};

// IANA timezone per calendar country — used to decide what "today" is in the
// country being viewed, not on the user's own clock.
const TIMEZONES = { japan: 'Asia/Tokyo', nepal: 'Asia/Kathmandu' };

// --- Internationalization ---
// UI language ('en' | 'jp') is independent of the calendar country.
// Holiday names themselves come from the data files and are not translated.

const TRANSLATIONS = {
    en: {
        htmlLang: 'en',
        locale: 'en-US',
        title: 'Annual Calendar',
        today: 'Today',
        work: 'Work',
        rest: 'Rest',
        prevYear: 'Previous Year',
        nextYear: 'Next Year',
        prevMonth: 'Previous Month',
        nextMonth: 'Next Month',
        switchView: 'Switch View',
        legendTitle: 'Legend',
        legendSubtitle: 'Key for the calendar symbols.',
        legendWork: 'Work Day',
        legendSat: 'Saturday',
        legendHoliday: 'Holiday / Sunday',
        legendToday: 'Current Date',
        seasonalPalette: 'Seasonal Palette',
        modalHoliday: 'Holiday',
        modalWorkDay: 'Work Day',
        modalHolidayDesc: 'Office is closed on this day.',
        modalWorkDesc: 'Regular working hours apply.',
        close: 'Close',
        loading: 'Loading',
        countries: { japan: 'Japan', nepal: 'Nepal' },
        months: ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'],
        weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    },
    jp: {
        htmlLang: 'ja',
        locale: 'ja-JP',
        title: '年間カレンダー',
        today: '今日',
        work: '勤務',
        rest: '休み',
        prevYear: '前年',
        nextYear: '翌年',
        prevMonth: '前月',
        nextMonth: '翌月',
        switchView: '表示切替',
        legendTitle: '凡例',
        legendSubtitle: 'カレンダー記号の説明',
        legendWork: '勤務日',
        legendSat: '土曜日',
        legendHoliday: '祝日・日曜日',
        legendToday: '本日',
        seasonalPalette: '季節のパレット',
        modalHoliday: '祝日',
        modalWorkDay: '勤務日',
        modalHolidayDesc: 'この日はお休みです。',
        modalWorkDesc: '通常勤務日です。',
        close: '閉じる',
        loading: '読み込み中',
        countries: { japan: '日本', nepal: 'ネパール' },
        months: ['1月', '2月', '3月', '4月', '5月', '6月',
                 '7月', '8月', '9月', '10月', '11月', '12月'],
        weekdays: ['月', '火', '水', '木', '金', '土', '日'],
    },
};

const t = () => TRANSLATIONS[state.lang];
const otherT = () => TRANSLATIONS[state.lang === 'en' ? 'jp' : 'en'];

// --- URL Routing ---
// Language and country are two independent, non-colliding URL tokens so they
// can appear in any order and either can be omitted:
//   /            -> JP language, Japan calendar (defaults, no params)
//   /en/         -> English language, Japan calendar
//   /ne          -> JP language, Nepal calendar
//   /en/ne/      -> English language, Nepal calendar
// Explicit default tokens (/jp/, /ja/) are accepted on the way in; the URL is
// canonicalised to the minimal form whenever the user changes a selection.

const LANG_TOKENS = { en: 'en', jp: 'jp' };
const COUNTRY_TOKENS = { ja: 'japan', ne: 'nepal' };

function parseRoute() {
    const segments = location.pathname.split('/').filter(Boolean);
    let lang = 'jp';       // default language
    let country = 'japan'; // default country (ja)
    let langSet = false;
    let countrySet = false;

    // Consume recognised route tokens from the end of the path; whatever
    // remains is the app's base directory (e.g. /jobins-calendar/).
    while (segments.length) {
        const seg = segments[segments.length - 1].toLowerCase();
        if (!langSet && LANG_TOKENS[seg]) {
            lang = LANG_TOKENS[seg]; langSet = true; segments.pop(); continue;
        }
        if (!countrySet && COUNTRY_TOKENS[seg]) {
            country = COUNTRY_TOKENS[seg]; countrySet = true; segments.pop(); continue;
        }
        break;
    }

    const base = '/' + (segments.length ? segments.join('/') + '/' : '');
    return { lang, country, base };
}

function buildPath() {
    const parts = [];
    if (state.lang !== 'jp') parts.push('en');       // omit default language
    if (state.country !== 'japan') parts.push('ne'); // omit default country
    return state.base + (parts.length ? parts.join('/') + '/' : '');
}

function syncUrl() {
    history.pushState({ lang: state.lang, country: state.country }, '', buildPath());
}

// --- State ---

let state = {
    year: new Date().getFullYear(),
    view: 'year', // 'year' or 'month'
    currentMonthDetail: new Date().getMonth(),
    lang: 'jp', // 'en' or 'jp' (UI language)
    country: 'japan', // 'japan' or 'nepal'
    base: '/', // app base directory, derived from the URL
    eventsMap: {} // Loaded from the Google Sheet CSV, keyed by date for O(1) lookups
};

// --- Initialization ---

// Per-country published Google Sheet CSV URLs live in event-sources.json so they
// can be edited without touching the code. Loaded once, then cached.
let eventSources = null;

async function getEventSources() {
    if (eventSources) return eventSources;
    try {
        const response = await fetch(`${state.base}event-sources.json`);
        eventSources = response.ok ? await response.json() : {};
        if (!response.ok) console.error(`Failed to load event-sources.json: HTTP ${response.status}`);
    } catch (error) {
        console.error('Error fetching event-sources.json:', error);
        eventSources = {};
    }
    return eventSources;
}

// Normalises a sheet date to YYYY-MM-DD. Accepts YYYY-MM-DD (Nepal sheet) and
// M/D/YYYY (Japan sheet), zero-padding month/day so lookups always match.
function normalizeDate(raw) {
    const s = String(raw).trim();
    const pad = (n) => n.padStart(2, '0');
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
    return s;
}

// Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas/newlines
// and "" escapes, plus CRLF line endings. Returns an array of string-arrays.
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
                else inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field); field = '';
        } else if (c === '\n') {
            row.push(field); rows.push(row); row = []; field = '';
        } else if (c !== '\r') {
            field += c;
        }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// Maps a CSV string (with a date/title/type header) to event objects, addressing
// columns by header name so column order doesn't matter.
function csvToEvents(text) {
    const rows = parseCsv(text).filter(r => r.some(c => c.trim() !== ''));
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim().toLowerCase());
    const di = header.indexOf('date');
    const ti = header.indexOf('title');
    const tyi = header.indexOf('type');
    if (di === -1) {
        console.error('Events CSV is missing a "date" column header.');
        return [];
    }
    return rows.slice(1)
        .map(r => ({
            date: normalizeDate(r[di] || ''),
            title: (r[ti] || '').trim(),
            type: (r[tyi] || '').trim().toLowerCase(),
        }))
        .filter(e => e.date);
}

async function loadEventsForCountry(country) {
    const sources = await getEventSources();
    const url = sources[country];
    if (!url) {
        console.error(`No event source URL configured for "${country}".`);
        state.eventsMap = {};
        return;
    }
    try {
        const response = await fetch(url);
        if (response.ok) {
            const events = csvToEvents(await response.text());
            // Index events by date string so getDayStatus() is an O(1) lookup
            // instead of an O(N) Array.find() per day (~372 calls per render).
            state.eventsMap = Object.fromEntries(events.map(e => [e.date, e]));
        } else {
            console.error(`Failed to load events for ${country}: HTTP ${response.status}`);
            state.eventsMap = {};
        }
    } catch (error) {
        console.error(`Error fetching events for ${country}:`, error);
        state.eventsMap = {};
    }
}

async function applyRoute() {
    const route = parseRoute();
    state.lang = route.lang;
    state.country = route.country;
    state.base = route.base;
    showLoader();
    await loadEventsForCountry(state.country);
    renderApp();
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Resolve language + country from the URL, then load + render.
    await applyRoute();

    // 2. Setup Event Listeners
    setupEventListeners();

    // 3. React to browser back/forward navigation.
    window.addEventListener('popstate', applyRoute);
});

// --- Logic Helpers ---

function getSeason(monthIndex) {
    if (SEASONS.spring.months.includes(monthIndex)) return SEASONS.spring;
    if (SEASONS.summer.months.includes(monthIndex)) return SEASONS.summer;
    if (SEASONS.autumn.months.includes(monthIndex)) return SEASONS.autumn;
    return SEASONS.winter;
}

// Returns the current { year, month (0-based), day } as it is *right now* in the
// selected country's timezone. Reinterpreting the wall-clock string in the local
// runtime lets us read the country's calendar date without any external library.
function getTodayInCountry() {
    const timeZone = TIMEZONES[state.country];
    const localized = new Date(new Date().toLocaleString('en-US', { timeZone }));
    return {
        year: localized.getFullYear(),
        month: localized.getMonth(),
        day: localized.getDate(),
    };
}

function getDayStatus(year, monthIndex, day) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const event = state.eventsMap[dateStr]; // O(1) lookup

    const dateObj = new Date(year, monthIndex, day);
    const dayOfWeek = dateObj.getDay(); // 0=Sun, 6=Sat

    // 1. Explicit Event (Holiday or Workday)
    if (event) {
        if (event.type === 'holiday') return { isHoliday: true, isNationalHoliday: true, title: event.title, date: dateStr };
        if (event.type === 'workday') return { isHoliday: false, title: event.title, isWorkDay: true, date: dateStr };
    }

    // 2. Generic Weekend
    if (dayOfWeek === 0) return { isHoliday: true, title: 'Weekend' }; // Sunday
    if (dayOfWeek === 6) return { isHoliday: true, isGenericSaturday: true, title: 'Weekend' }; // Saturday

    return { isHoliday: false, title: null };
}

// --- Rendering ---

// Animated "fade-stagger-squares" loader, shown in the calendar area while the
// event CSV is being fetched. renderApp() replaces it once data arrives.
function showLoader() {
    const container = document.getElementById('calendar-container');
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-[60vh] gap-6" role="status" aria-live="polite">
            <svg class="w-20 h-20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" aria-hidden="true">
                <rect fill="#FF7873" stroke="#FF7873" stroke-width="24" width="30" height="30" x="25" y="85">
                    <animate attributeName="opacity" calcMode="spline" dur="2.7s" values="1;0;1;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="-.4s"></animate>
                </rect>
                <rect fill="#FF7873" stroke="#FF7873" stroke-width="24" width="30" height="30" x="85" y="85">
                    <animate attributeName="opacity" calcMode="spline" dur="2.7s" values="1;0;1;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="-.2s"></animate>
                </rect>
                <rect fill="#FF7873" stroke="#FF7873" stroke-width="24" width="30" height="30" x="145" y="85">
                    <animate attributeName="opacity" calcMode="spline" dur="2.7s" values="1;0;1;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="0s"></animate>
                </rect>
            </svg>
            <span class="text-xs text-stone-400 uppercase tracking-widest">${t().loading}</span>
        </div>
    `;
}

function applyTranslations() {
    const tr = t();
    const countryName = tr.countries[state.country];

    document.documentElement.lang = tr.htmlLang;
    document.title = `JoBins Calendar - ${countryName}`;
    document.getElementById('main-title').textContent = tr.title;
    document.getElementById('today-label').textContent = tr.today;

    const now = new Date();
    document.getElementById('today-date-display').textContent = now.toLocaleDateString(tr.locale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Title + matching aria-label keep these icon-only buttons screen-reader friendly.
    const labelButton = (id, text) => {
        const el = document.getElementById(id);
        el.title = text;
        el.setAttribute('aria-label', text);
    };
    labelButton('prev-year-btn', tr.prevYear);
    labelButton('next-year-btn', tr.nextYear);
    labelButton('view-toggle-btn', tr.switchView);
    document.getElementById('modal-close-action').textContent = tr.close;
    document.getElementById('modal-close-btn').setAttribute('aria-label', tr.close);

    // Country dropdown labels + selected country
    document.querySelectorAll('.country-option').forEach(opt => {
        const label = opt.querySelector('[data-country-label]');
        if (label) label.textContent = tr.countries[opt.dataset.country];
    });
    document.getElementById('selected-country-name').textContent = countryName;
    document.getElementById('footer-country').textContent = `JoBins Calendar - ${countryName}`;

    // Language toggle active state
    document.querySelectorAll('.lang-option').forEach(btn => {
        const active = btn.dataset.lang === state.lang;
        btn.classList.toggle('bg-stone-800', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('text-stone-500', !active);
    });
}

function renderApp() {
    // Apply language to all static chrome.
    applyTranslations();

    // Update Header Year
    document.getElementById('current-year-display').textContent = state.year;
    document.getElementById('footer-year').textContent = state.year;

    // Update Country Flag
    const flags = { japan: '🇯🇵', nepal: '🇳🇵' };
    document.getElementById('selected-country-flag').textContent = flags[state.country];

    const container = document.getElementById('calendar-container');
    container.innerHTML = ''; // Clear current content

    if (state.view === 'year') {
        renderYearView(container);
    } else {
        renderMonthDetailView(container);
    }

    // Initialize Lucide Icons for newly added DOM elements
    lucide.createIcons();
}

function renderYearView(container) {
    const gridContainer = document.createElement('div');
    gridContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1600px] mx-auto";

    // 12 Months
    for (let i = 0; i < 12; i++) {
        const monthCard = createMonthCard(state.year, i);
        gridContainer.appendChild(monthCard);
    }

    // Legend Card
    const legendCard = createLegendCard();
    gridContainer.appendChild(legendCard);

    container.appendChild(gridContainer);
}

function renderMonthDetailView(container) {
    // Top-aligned (not justify-center) so the nav buttons and calendar keep a
    // fixed vertical position regardless of whether the month spans 5 or 6 weeks.
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col items-center min-h-[80vh] w-full max-w-3xl mx-auto";

    // Navigation Controls
    const nav = document.createElement('div');
    nav.className = "flex justify-between items-center mb-8 w-full";
    nav.innerHTML = `
        <button id="prev-month-btn" aria-label="${t().prevMonth}" title="${t().prevMonth}" class="p-2 hover:bg-stone-200 rounded-full transition"><i data-lucide="chevron-left"></i></button>
        <div class="text-center">
            <h2 class="text-3xl font-serif text-stone-800">${t().months[state.currentMonthDetail]} ${state.year}</h2>
            <span class="text-stone-500 font-sans tracking-widest text-sm">${otherT().months[state.currentMonthDetail]}</span>
        </div>
        <button id="next-month-btn" aria-label="${t().nextMonth}" title="${t().nextMonth}" class="p-2 hover:bg-stone-200 rounded-full transition"><i data-lucide="chevron-right"></i></button>
    `;
    wrapper.appendChild(nav);

    // Month Grid (Large) — sizes to content so every week row is shown and clickable.
    const monthCard = createMonthCard(state.year, state.currentMonthDetail, true);
    monthCard.classList.add('w-full');
    wrapper.appendChild(monthCard);

    container.appendChild(wrapper);

    // Attach listeners for Detail View Nav
    document.getElementById('prev-month-btn').onclick = () => {
        state.currentMonthDetail = (state.currentMonthDetail - 1 + 12) % 12;
        if (state.currentMonthDetail === 11) state.year--; // Optional: Auto scroll year? Kept simple for now (loop month only or standard)
        // Let's keep year separate for simplicity, just loop months
        renderApp();
    };
    document.getElementById('next-month-btn').onclick = () => {
        state.currentMonthDetail = (state.currentMonthDetail + 1) % 12;
        renderApp();
    };
}

function createMonthCard(year, monthIndex, isDetail = false) {
    const tr = t();
    const otherTr = otherT();
    const card = document.createElement('div');
    // Year view: fill the grid row (h-full) and animate on hover.
    // Detail view: size to content so all six week rows stay visible (and clickable).
    card.className = `bg-white p-6 md:p-8 rounded-sm shadow-sm border border-stone-100 flex flex-col relative overflow-hidden ${isDetail ? '' : 'h-full hover:shadow-md transition-shadow duration-500'}`;

    const season = getSeason(monthIndex);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayObj = new Date(year, monthIndex, 1);
    const jsDay = firstDayObj.getDay();
    const startOffset = jsDay === 0 ? 6 : jsDay - 1; // Mon=0

    // Decorative Line
    const line = document.createElement('div');
    line.className = `absolute top-0 left-0 w-full h-1 ${season.line}`;
    card.appendChild(line);

    // Header — primary label follows the UI language, secondary shows the other.
    const header = document.createElement('div');
    header.className = "flex justify-between items-end mb-6";
    header.innerHTML = `
        <div class="flex items-center gap-3">
            <div>
                <div class="flex items-center gap-2">
                    <h2 class="text-xl font-serif text-stone-800 leading-none">${tr.months[monthIndex]}</h2>
                    <i data-lucide="${season.icon}" class="w-4 h-4 ${season.color} opacity-80"></i>
                </div>
                <span class="text-xs text-stone-400 uppercase tracking-widest mt-1 block">${otherTr.months[monthIndex]}</span>
            </div>
        </div>
    `;
    card.appendChild(header);

    // Weekday Headers
    const weekHeader = document.createElement('div');
    weekHeader.className = "grid grid-cols-7 mb-2";
    tr.weekdays.forEach((day, i) => {
        let colorClass = 'text-stone-400';
        if (i === 5) colorClass = 'text-blue-500'; // Sat
        if (i === 6) colorClass = 'text-red-400';  // Sun
        weekHeader.innerHTML += `<div class="text-center text-[10px] uppercase tracking-widest pb-2 ${colorClass}">${day}</div>`;
    });
    card.appendChild(weekHeader);

    // Grid
    const grid = document.createElement('div');
    grid.className = "grid grid-cols-7 gap-y-1 flex-grow";

    // Empty Slots
    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.className = "aspect-square";
        grid.appendChild(empty);
    }

    let holidaysCount = 0;
    let workDaysCount = 0;
    // "Today" follows the selected country's timezone, not the user's local clock.
    const today = getTodayInCountry();
    const isCurrentMonth = today.year === year && today.month === monthIndex;
    const currentDay = today.day;

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const status = getDayStatus(year, monthIndex, d);
        if (status.isHoliday) holidaysCount++; else workDaysCount++;

        const currentDayOfWeekIndex = (startOffset + d - 1) % 7;
        const isSaturday = currentDayOfWeekIndex === 5;
        const isSunday = currentDayOfWeekIndex === 6;

        let textColorClass = 'text-stone-700';
        let bgClass = 'group-hover:bg-stone-100';
        let isClickable = false;

        // Styling Priority Logic
        if (status.isNationalHoliday) {
            textColorClass = 'text-red-700 font-medium';
            bgClass = 'bg-red-50';
            isClickable = true;
        } else if (status.isWorkDay) {
            textColorClass = 'text-stone-800 font-medium';
            bgClass = 'bg-stone-100';
            isClickable = true;
        } else if (isSaturday) {
            textColorClass = 'text-blue-600 font-medium';
            bgClass = 'bg-blue-50';
        } else if (isSunday) {
            textColorClass = 'text-red-700 font-medium';
            bgClass = 'bg-red-50';
        } else if (status.isHoliday && !status.isGenericSaturday) {
            textColorClass = 'text-red-700 font-medium';
            bgClass = 'bg-red-50';
        }

        let ringClass = '';
        if (isCurrentMonth && d === currentDay) {
            ringClass = 'ring-2 ring-indigo-400 ring-offset-2';
            if (!status.isHoliday && !isSaturday && !isSunday) textColorClass = 'text-indigo-700 font-bold';
        }

        const dayEl = document.createElement('div');
        dayEl.className = `aspect-square flex items-center justify-center relative group transition-all duration-300 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`;

        // Inner Circle
        dayEl.innerHTML = `
            <div class="absolute inset-0 m-auto rounded-full w-8 h-8 md:w-10 md:h-10 flex items-center justify-center transition-all duration-300 ${bgClass} ${textColorClass} ${ringClass}">
                ${d}
            </div>
        `;

        // Dots
        if (status.isNationalHoliday) {
            dayEl.innerHTML += `<div class="absolute bottom-1 w-1 h-1 bg-red-400 rounded-full opacity-60"></div>`;
        }
        if (status.isWorkDay) {
            dayEl.innerHTML += `<div class="absolute bottom-1 w-1 h-1 bg-stone-400 rounded-full opacity-60"></div>`;
        }

        // Interaction — keyboard accessible so focus can return here on close.
        if (isClickable) {
            dayEl.setAttribute('role', 'button');
            dayEl.setAttribute('tabindex', '0');
            dayEl.setAttribute('aria-label', `${status.date}: ${status.title}`);
            const open = () => openModal(status, dayEl);
            dayEl.onclick = open;
            dayEl.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                }
            };
        }

        grid.appendChild(dayEl);
    }

    // Detail view: pad to a full 6-week grid (42 slots) so the card body is the
    // same height for every month, keeping the layout from shifting.
    if (isDetail) {
        for (let i = startOffset + daysInMonth; i < 42; i++) {
            const empty = document.createElement('div');
            empty.className = "aspect-square";
            grid.appendChild(empty);
        }
    }

    card.appendChild(grid);

    // Footer Stats
    const footer = document.createElement('div');
    footer.className = "mt-4 pt-3 border-t border-stone-100 flex justify-between text-xs font-medium text-stone-400";
    footer.innerHTML = `
        <span class="tracking-wide">${tr.work}: <span class="text-stone-600">${workDaysCount}</span></span>
        <span class="tracking-wide">${tr.rest}: <span class="text-stone-600">${holidaysCount}</span></span>
    `;
    card.appendChild(footer);

    return card;
}

function createLegendCard() {
    const tr = t();
    const card = document.createElement('div');
    card.className = "bg-[#2c2c2c] p-8 rounded-sm text-[#fcfaf7] flex flex-col justify-between shadow-lg";
    card.innerHTML = `
        <div>
            <h3 class="font-serif text-2xl mb-2">${tr.legendTitle}</h3>
            <p class="text-stone-400 text-sm">${tr.legendSubtitle}</p>
        </div>
        <div class="space-y-4">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-stone-700 border border-stone-600 flex items-center justify-center text-xs">12</div>
                <span class="text-sm text-stone-300">${tr.legendWork}</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-blue-900/50 text-blue-200 border border-blue-800 flex items-center justify-center text-xs">12</div>
                <span class="text-sm text-stone-300">${tr.legendSat}</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-red-900/50 text-red-200 border border-red-900 flex items-center justify-center text-xs">12</div>
                <span class="text-sm text-stone-300">${tr.legendHoliday}</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-stone-800 ring-2 ring-indigo-500 text-indigo-400 flex items-center justify-center text-xs font-bold">12</div>
                <span class="text-sm text-stone-300">${tr.legendToday}</span>
            </div>
            <div class="mt-8 pt-6 border-t border-stone-700">
                <div class="text-xs text-stone-500 mb-2 uppercase tracking-widest">${tr.seasonalPalette}</div>
                <div class="grid grid-cols-4 gap-2">
                    <div class="h-2 rounded-full bg-pink-400 opacity-80"></div>
                    <div class="h-2 rounded-full bg-indigo-400 opacity-80"></div>
                    <div class="h-2 rounded-full bg-amber-600 opacity-80"></div>
                    <div class="h-2 rounded-full bg-slate-400 opacity-80"></div>
                </div>
            </div>
        </div>
    `;
    return card;
}

// --- Interaction Handlers ---

function setupEventListeners() {
    document.getElementById('prev-year-btn').onclick = () => {
        state.year--;
        renderApp();
    };
    document.getElementById('next-year-btn').onclick = () => {
        state.year++;
        renderApp();
    };
    document.getElementById('view-toggle-btn').onclick = () => {
        state.view = state.view === 'year' ? 'month' : 'year';
        renderApp();
    };

    // Clicking "today" jumps to the full month view of the current month/year
    // (in the selected country's timezone).
    const goToCurrentMonth = () => {
        const today = getTodayInCountry();
        state.year = today.year;
        state.currentMonthDetail = today.month;
        state.view = 'month';
        renderApp();
    };
    const todayDisplay = document.getElementById('today-date-display');
    todayDisplay.onclick = goToCurrentMonth;
    todayDisplay.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            goToCurrentMonth();
        }
    };

    // Language Toggle (EN / JP) — reflected in the URL.
    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.onclick = () => {
            const newLang = btn.dataset.lang;
            if (newLang !== state.lang) {
                state.lang = newLang;
                syncUrl();
                renderApp();
            }
        };
    });

    // Country Dropdown
    const dropdownBtn = document.getElementById('country-dropdown-btn');
    const dropdownMenu = document.getElementById('country-dropdown-menu');

    dropdownBtn.onclick = (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdownMenu.classList.add('hidden');
    });

    // Country Selection — reflected in the URL.
    document.querySelectorAll('.country-option').forEach(option => {
        option.onclick = async (e) => {
            e.stopPropagation();
            const newCountry = option.dataset.country;
            if (newCountry !== state.country) {
                state.country = newCountry;
                syncUrl();
                showLoader();
                await loadEventsForCountry(state.country);
                renderApp();
            }
            dropdownMenu.classList.add('hidden');
        };
    });

    // Modal Closing
    const modal = document.getElementById('event-modal');
    const close = () => {
        modal.classList.add('hidden');
        // Reset Zoom Animation for next open
        const content = modal.querySelector('div');
        content.classList.remove('zoom-in');
        void content.offsetWidth; // Trigger reflow

        // Return focus to the calendar day that opened the modal.
        if (modalReturnFocusEl) {
            modalReturnFocusEl.focus();
            modalReturnFocusEl = null;
        }
    };

    document.getElementById('modal-close-btn').onclick = close;
    document.getElementById('modal-close-action').onclick = close;
    modal.onclick = (e) => {
        if (e.target === modal) close();
    };
    // Allow Escape to dismiss while focus is trapped inside the modal.
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

// Holds the element to restore focus to when the modal closes.
let modalReturnFocusEl = null;

function openModal(eventData, triggerEl) {
    const tr = t();
    modalReturnFocusEl = triggerEl || null;
    const modal = document.getElementById('event-modal');
    const content = modal.querySelector('div');

    // Set Content
    const isHoliday = eventData.isNationalHoliday;
    const headerLine = document.getElementById('modal-header-line');
    const badge = document.getElementById('modal-type-badge');
    const title = document.getElementById('modal-title');
    const date = document.getElementById('modal-date');
    const desc = document.getElementById('modal-desc');

    headerLine.className = `h-2 w-full ${isHoliday ? 'bg-red-400' : 'bg-stone-600'}`;

    badge.className = `text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-sm ${isHoliday ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-600'}`;
    badge.textContent = isHoliday ? tr.modalHoliday : tr.modalWorkDay;

    title.textContent = eventData.title;
    date.textContent = eventData.date;
    desc.textContent = isHoliday ? tr.modalHolidayDesc : tr.modalWorkDesc;

    // Show, then move focus into the dialog for screen-reader / keyboard users.
    content.classList.add('zoom-in');
    modal.classList.remove('hidden');
    document.getElementById('modal-close-btn').focus();
}
