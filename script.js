// --- Constants & Config ---

const MONTHS_EN = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTHS_JA = [
    '1月', '2月', '3月', '4月', '5月', '6月', 
    '7月', '8月', '9月', '10月', '11月', '12月'
];

const WEEKDAYS = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];

const SEASONS = {
    spring: { months: [2, 3, 4], color: 'text-pink-400', line: 'bg-pink-400', icon: 'wind' },
    summer: { months: [5, 6, 7], color: 'text-indigo-400', line: 'bg-indigo-400', icon: 'sun' },
    autumn: { months: [8, 9, 10], color: 'text-amber-600', line: 'bg-amber-600', icon: 'moon' },
    winter: { months: [11, 0, 1], color: 'text-slate-400', line: 'bg-slate-400', icon: 'snowflake' },
};

// --- State ---

let state = {
    year: new Date().getFullYear(),
    view: 'year', // 'year' or 'month'
    currentMonthDetail: new Date().getMonth(),
    events: [] // Loaded from JSON
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Set Today's Date in Header
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('today-date-display').textContent = now.toLocaleDateString('en-US', options);

    // 2. Fetch Events
    try {
        const response = await fetch('events.json');
        if (response.ok) {
            state.events = await response.json();
        } else {
            console.error('Failed to load events.json');
        }
    } catch (error) {
        console.error('Error fetching events:', error);
    }

    // 3. Initial Render
    renderApp();

    // 4. Setup Event Listeners
    setupEventListeners();
});

// --- Logic Helpers ---

function getSeason(monthIndex) {
    if (SEASONS.spring.months.includes(monthIndex)) return SEASONS.spring;
    if (SEASONS.summer.months.includes(monthIndex)) return SEASONS.summer;
    if (SEASONS.autumn.months.includes(monthIndex)) return SEASONS.autumn;
    return SEASONS.winter;
}

function getDayStatus(year, monthIndex, day) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const event = state.events.find(e => e.date === dateStr);
    
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

function renderApp() {
    // Update Header Year
    document.getElementById('current-year-display').textContent = state.year;
    document.getElementById('footer-year').textContent = state.year;

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
    gridContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-[1600px] mx-auto";

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
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col items-center justify-center min-h-[80vh] w-full max-w-4xl mx-auto";

    // Navigation Controls
    const nav = document.createElement('div');
    nav.className = "flex justify-between items-center mb-8 w-full";
    nav.innerHTML = `
        <button id="prev-month-btn" class="p-2 hover:bg-stone-200 rounded-full transition"><i data-lucide="chevron-left"></i></button>
        <div class="text-center">
            <h2 class="text-3xl font-serif text-stone-800">${MONTHS_EN[state.currentMonthDetail]} ${state.year}</h2>
            <span class="text-stone-500 font-sans tracking-widest text-sm">${MONTHS_JA[state.currentMonthDetail]}</span>
        </div>
        <button id="next-month-btn" class="p-2 hover:bg-stone-200 rounded-full transition"><i data-lucide="chevron-right"></i></button>
    `;
    wrapper.appendChild(nav);

    // Month Grid (Large)
    const monthCard = createMonthCard(state.year, state.currentMonthDetail, false);
    monthCard.classList.add('h-[600px]', 'w-full'); // Force height for detail view
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

function createMonthCard(year, monthIndex, isSmall = false) {
    const card = document.createElement('div');
    card.className = `bg-white p-6 md:p-8 rounded-sm shadow-sm border border-stone-100 flex flex-col h-full relative overflow-hidden ${!isSmall ? 'hover:shadow-md transition-shadow duration-500' : ''}`;

    const season = getSeason(monthIndex);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayObj = new Date(year, monthIndex, 1);
    const jsDay = firstDayObj.getDay(); 
    const startOffset = jsDay === 0 ? 6 : jsDay - 1; // Mon=0

    // Decorative Line
    const line = document.createElement('div');
    line.className = `absolute top-0 left-0 w-full h-1 ${season.line}`;
    card.appendChild(line);

    // Header
    const header = document.createElement('div');
    header.className = "flex justify-between items-end mb-6";
    header.innerHTML = `
        <div class="flex items-center gap-3">
            <div>
                <div class="flex items-center gap-2">
                    <h2 class="text-xl font-serif text-stone-800 leading-none">${MONTHS_JA[monthIndex]}</h2>
                    <i data-lucide="${season.icon}" class="w-4 h-4 ${season.color} opacity-80"></i>
                </div>
                <span class="text-xs text-stone-400 uppercase tracking-widest mt-1 block">${MONTHS_EN[monthIndex]}</span>
            </div>
        </div>
    `;
    card.appendChild(header);

    // Weekday Headers
    const weekHeader = document.createElement('div');
    weekHeader.className = "grid grid-cols-7 mb-2";
    WEEKDAYS.forEach((day, i) => {
        let colorClass = 'text-stone-400';
        if (i === 5) colorClass = 'text-blue-500'; // Sat
        if (i === 6) colorClass = 'text-red-400';  // Sun
        weekHeader.innerHTML += `<div class="text-center text-[10px] uppercase tracking-widest pb-2 ${colorClass}">${day.charAt(0)}</div>`;
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
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
    const currentDay = today.getDate();

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

        // Interaction
        if (isClickable) {
            dayEl.onclick = () => openModal(status);
        }

        grid.appendChild(dayEl);
    }
    card.appendChild(grid);

    // Footer Stats
    const footer = document.createElement('div');
    footer.className = "mt-4 pt-3 border-t border-stone-100 flex justify-between text-xs font-medium text-stone-400";
    footer.innerHTML = `
        <span class="tracking-wide">Work: <span class="text-stone-600">${workDaysCount}</span></span>
        <span class="tracking-wide">Rest: <span class="text-stone-600">${holidaysCount}</span></span>
    `;
    card.appendChild(footer);

    return card;
}

function createLegendCard() {
    const card = document.createElement('div');
    card.className = "bg-[#2c2c2c] p-8 rounded-sm text-[#fcfaf7] flex flex-col justify-between shadow-lg";
    card.innerHTML = `
        <div>
            <h3 class="font-serif text-2xl mb-2">Legend</h3>
            <p class="text-stone-400 text-sm">Key for the calendar symbols.</p>
        </div>
        <div class="space-y-4">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-stone-700 border border-stone-600 flex items-center justify-center text-xs">12</div>
                <span class="text-sm text-stone-300">Work Day</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-blue-900/50 text-blue-200 border border-blue-800 flex items-center justify-center text-xs">12</div>
                <span class="text-sm text-stone-300">Saturday</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-red-900/50 text-red-200 border border-red-900 flex items-center justify-center text-xs">12</div>
                <span class="text-sm text-stone-300">Holiday / Sunday</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-stone-800 ring-2 ring-indigo-500 text-indigo-400 flex items-center justify-center text-xs font-bold">12</div>
                <span class="text-sm text-stone-300">Current Date</span>
            </div>
            <div class="mt-8 pt-6 border-t border-stone-700">
                <div class="text-xs text-stone-500 mb-2 uppercase tracking-widest">Seasonal Palette</div>
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
    
    // Modal Closing
    const modal = document.getElementById('event-modal');
    const close = () => {
        modal.classList.add('hidden');
        // Reset Zoom Animation for next open
        const content = modal.querySelector('div');
        content.classList.remove('zoom-in');
        void content.offsetWidth; // Trigger reflow
    };
    
    document.getElementById('modal-close-btn').onclick = close;
    document.getElementById('modal-close-action').onclick = close;
    modal.onclick = (e) => {
        if (e.target === modal) close();
    };
}

function openModal(eventData) {
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
    badge.textContent = isHoliday ? 'Holiday' : 'Work Day';
    
    title.textContent = eventData.title;
    date.textContent = eventData.date;
    desc.textContent = isHoliday ? 'Office is closed on this day.' : 'Regular working hours apply.';

    // Show
    content.classList.add('zoom-in');
    modal.classList.remove('hidden');
}