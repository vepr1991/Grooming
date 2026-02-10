import { $, setText } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { showToast } from '../../ui/toast';
import { showConfirm } from '../../ui/modal';
import { ICONS } from '../../ui/icons';
import { Appointment } from '../../types';
import { Telegram } from '../../core/tg';

// --- State ---
let appointmentsCache: Appointment[] = [];
let selectedDate = new Date();
let viewDate = new Date();
let activeTab: 'pending' | 'confirmed' | 'completed' | 'cancelled' = 'pending';
let isPremium = false;

const TABS = [
    { id: 'pending', label: 'Ожидает' },
    { id: 'confirmed', label: 'Подтвержденные' },
    { id: 'completed', label: 'Завершенные' },
    { id: 'cancelled', label: 'Отмененные' }
];

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// --- Helpers ---
function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string = '',
    text: string = ''
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

export async function loadAppointments() {
    const list = $('appointments-list');

    // Скелетон загрузки
    if(list) {
        list.innerHTML = '';
        list.appendChild(createEl('div', 'text-center text-text-secondary py-8', 'Загрузка...'));
    }

    try {
        // Загружаем профиль (для проверки Pro) и записи
        const [me, apps] = await Promise.all([
            apiFetch<any>('/me'),
            apiFetch<Appointment[]>('/me/appointments')
        ]);

        isPremium = me.profile.is_premium;
        appointmentsCache = apps;

        renderTabs();
        renderCalendar(); // [RESTORED] Календарь
        renderList();     // [RESTORED] Список
    } catch {
        if(list) {
            list.innerHTML = '';
            list.appendChild(createEl('div', 'text-center text-error', 'Ошибка сети'));
        }
    }
}

function renderTabs() {
    const container = $('appointment-tabs');
    if (!container) return;
    container.innerHTML = '';

    // Фильтрация табов для Basic (как в старом коде)
    const visibleTabs = isPremium
        ? TABS
        : TABS.filter(t => ['pending', 'confirmed'].includes(t.id));

    if (!visibleTabs.find(t => t.id === activeTab)) {
        activeTab = 'pending';
    }

    visibleTabs.forEach(tab => {
        const isActive = activeTab === tab.id;
        const btn = createEl('button',
            `whitespace-nowrap pb-3 text-xs font-bold uppercase tracking-wider transition-all relative flex-shrink-0 ${isActive ? 'text-primary' : 'text-text-secondary hover:text-white'}`,
            tab.label
        );

        if (isActive) {
            const line = createEl('span', 'absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full animate-in fade-in zoom-in duration-300');
            btn.appendChild(line);
        }

        btn.onclick = () => {
            activeTab = tab.id as any;
            renderTabs();
            renderList();
        };
        container.appendChild(btn);
    });
}

function changeMonth(offset: number) {
    viewDate.setMonth(viewDate.getMonth() + offset);
    renderCalendar();
    renderList();
}

// [RESTORED] Полностью восстановленный календарь на безопасном DOM
function renderCalendar() {
    const container = $('calendar-container');
    if (!container) return;
    container.innerHTML = ''; // Чистим контейнер

    const busyDates = new Set(appointmentsCache
        .filter(a => ['pending', 'confirmed'].includes(a.status))
        .map(a => a.starts_at.split('T')[0]));

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDay = new Date(year, month, 1).getDay() - 1;
    if (firstDay === -1) firstDay = 6;

    const todayStr = new Date().toDateString();
    const selectedStr = selectedDate.toDateString();

    // 1. Шапка календаря (Месяц + Кнопки)
    const wrapper = createEl('div', 'px-4 pt-4 pb-2');
    const header = createEl('div', 'flex justify-between items-center mb-3 px-2');
    const title = createEl('h2', 'text-lg font-bold text-white capitalize', `${MONTH_NAMES[month]} ${year}`);

    const navDiv = createEl('div', 'flex gap-1');
    const prevBtn = createEl('button', 'p-1.5 hover:bg-surface-dark/50 rounded-lg text-text-secondary active:bg-surface-dark transition-colors');
    prevBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">chevron_left</span>';
    prevBtn.onclick = () => changeMonth(-1);

    const nextBtn = createEl('button', 'p-1.5 hover:bg-surface-dark/50 rounded-lg text-text-secondary active:bg-surface-dark transition-colors');
    nextBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">chevron_right</span>';
    nextBtn.onclick = () => changeMonth(1);

    navDiv.appendChild(prevBtn);
    navDiv.appendChild(nextBtn);
    header.appendChild(title);
    header.appendChild(navDiv);

    // 2. Дни недели
    const weekGrid = createEl('div', 'grid grid-cols-7 gap-1 text-center mb-2');
    WEEK_DAYS.forEach(d => {
        weekGrid.appendChild(createEl('span', 'text-[10px] font-bold text-text-secondary/60 uppercase tracking-wider', d));
    });

    // 3. Сетка дней
    const daysGrid = createEl('div', 'grid grid-cols-7 gap-1');

    // Пустые клетки до начала месяца
    for (let i = 0; i < firstDay; i++) {
        daysGrid.appendChild(createEl('div', 'h-9'));
    }

    // Дни месяца
    for (let i = 1; i <= daysInMonth; i++) {
        const currentDate = new Date(year, month, i);
        const currentStr = currentDate.toDateString();
        const y = currentDate.getFullYear();
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentDate.getDate()).padStart(2, '0');
        const isoDate = `${y}-${m}-${d}`;

        const isSelected = currentStr === selectedStr;
        const isToday = currentStr === todayStr;
        const hasRecords = busyDates.has(isoDate);

        let btnClass = "h-9 flex flex-col items-center justify-center rounded-lg text-sm font-medium transition-all relative ";
        if (isSelected) btnClass += "bg-primary text-fixed-white shadow-md shadow-primary/20 scale-105";
        else if (isToday) btnClass += "text-primary border border-primary/30";
        else btnClass += "text-text-secondary hover:bg-surface-dark";

        const dayBtn = createEl('button', btnClass);

        // Номер дня
        const numSpan = createEl('span', '', String(i));
        dayBtn.appendChild(numSpan);

        // Точка, если есть записи
        if (hasRecords) {
            const dotColor = isSelected ? 'bg-white' : 'bg-primary';
            dayBtn.appendChild(createEl('span', `w-1 h-1 rounded-full absolute bottom-1.5 ${dotColor}`));
        }

        dayBtn.onclick = () => {
            selectedDate = new Date(year, month, i);
            renderCalendar();
            renderList();
        };

        daysGrid.appendChild(dayBtn);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(weekGrid);
    wrapper.appendChild(daysGrid);
    container.appendChild(wrapper);
}

function renderList() {
    const list = $('appointments-list');
    if (!list) return;
    list.innerHTML = '';

    let filtered: Appointment[] = [];

    // [RESTORED] Логика фильтрации (Календарь для активных, Месяц для архива)
    if (activeTab === 'completed' || activeTab === 'cancelled') {
        const y = viewDate.getFullYear();
        const m = String(viewDate.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${y}-${m}`;
        filtered = appointmentsCache.filter(a => a.starts_at.startsWith(monthPrefix) && a.status === activeTab);
        filtered.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
    } else {
        const y = selectedDate.getFullYear();
        const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const d = String(selectedDate.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        filtered = appointmentsCache.filter(a => a.starts_at.startsWith(dateStr) && a.status === activeTab);
        filtered.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    }

    // Обновляем счетчики в хедере (если есть такие элементы)
    setText('tab-label', TABS.find(t => t.id === activeTab)?.label || '');
    setText('tab-count', filtered.length.toString());

    if (filtered.length === 0) {
        const empty = createEl('div', 'flex flex-col items-center justify-center py-20 text-center opacity-30 grayscale');
        empty.innerHTML = '<span class="material-symbols-outlined text-6xl text-text-secondary mb-4">event_note</span>';
        empty.appendChild(createEl('p', 'text-xs font-bold tracking-[0.3em] uppercase text-text-secondary', 'Нет записей'));
        list.appendChild(empty);
        return;
    }

    filtered.forEach(a => list.appendChild(createCard(a)));
}

// [RESTORED] Карточка со всеми кнопками и старым дизайном
function createCard(a: Appointment): HTMLElement {
    const configs: any = {
        pending: { label: 'ОЖИДАЕТ', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-l-orange-500' },
        confirmed: { label: 'ПОДТВЕРЖДЕНО', color: 'text-primary', bg: 'bg-primary/10', border: 'border-l-primary' },
        completed: { label: 'ЗАВЕРШЕНО', color: 'text-success', bg: 'bg-success/10', border: 'border-l-success' },
        cancelled: { label: 'ОТМЕНЕНО', color: 'text-error', bg: 'bg-error/10', border: 'border-l-error' }
    };
    const c = configs[a.status];
    const dateObj = new Date(a.starts_at);

    // Форматирование времени
    let timeDisplay = '';
    if (activeTab === 'completed' || activeTab === 'cancelled') {
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const time = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        timeDisplay = `${day}.${month} ${time}`;
    } else {
        timeDisplay = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    const card = createEl('div', `relative bg-surface-dark rounded-2xl p-4 border border-border-dark flex flex-col gap-4 transition-all duration-300 border-l-4 ${c.border} animate-in fade-in slide-in-from-bottom-2`);

    // 1. Хедер карточки (Статус + Время)
    const header = createEl('div', 'flex justify-between items-center');
    const timeBox = createEl('div', 'flex items-center gap-1.5');

    // Пульсирующая точка
    const dotClass = a.status === 'pending' ? 'bg-orange-500 animate-pulse' : c.bg.replace('/10','');
    timeBox.appendChild(createEl('span', `w-1.5 h-1.5 rounded-full ${dotClass}`));
    timeBox.appendChild(createEl('span', 'text-white font-bold text-xs', timeDisplay));

    const statusBadge = createEl('span', `text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.color}`, c.label);

    header.appendChild(timeBox);
    header.appendChild(statusBadge);
    card.appendChild(header);

    // 2. Основной контент (Иконка + Инфо)
    const body = createEl('div', 'flex gap-4 items-start');

    // Иконка питомца
    const iconBox = createEl('div', 'w-20 h-20 rounded-2xl bg-background-dark flex-shrink-0 border border-border-dark shadow-inner flex items-center justify-center text-text-secondary/60 text-2xl');
    const srv = a.services as any;
    iconBox.innerHTML = (srv?.category === 'cat') ? ICONS.Cat : ICONS.Pet; // SVG безопасно

    // Текстовая инфа
    const infoBox = createEl('div', 'flex-grow min-w-0 space-y-1');

    // Имя питомца
    const petBlock = createEl('div', 'flex flex-col');
    petBlock.appendChild(createEl('span', 'text-[10px] text-text-secondary font-bold uppercase tracking-wider', 'Кличка'));
    petBlock.appendChild(createEl('h3', 'text-lg font-bold truncate text-white leading-tight', a.pet_name));
    infoBox.appendChild(petBlock);

    // Услуга и порода
    const detailsGrid = createEl('div', 'grid grid-cols-2 gap-2 mt-1');

    const srvBlock = createEl('div', 'flex flex-col');
    srvBlock.appendChild(createEl('span', 'text-[10px] text-text-secondary font-bold uppercase tracking-wider', 'Услуга'));
    srvBlock.appendChild(createEl('p', 'text-white text-[11px] font-medium truncate', a.services?.name || '---'));

    const breedBlock = createEl('div', 'flex flex-col');
    breedBlock.appendChild(createEl('span', 'text-[10px] text-text-secondary font-bold uppercase tracking-wider', 'Порода'));
    breedBlock.appendChild(createEl('p', 'text-white text-[11px] font-medium truncate', a.pet_breed || '---'));

    detailsGrid.appendChild(srvBlock);
    detailsGrid.appendChild(breedBlock);
    infoBox.appendChild(detailsGrid);

    // Клиент + Телефон
    const clientRow = createEl('div', 'pt-2 flex items-center gap-2');
    clientRow.appendChild(createEl('span', 'text-[11px] text-text-secondary truncate font-medium', a.client_name));

    // [RESTORED] Кнопка копирования
    const copyBtn = createEl('button', 'btn-copy-phone text-primary text-[11px] font-bold hover:text-primary/80 flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer');
    copyBtn.innerHTML = ICONS.Phone + ` ${a.client_phone}`; // SVG + текст
    copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(a.client_phone).then(() => showToast('Скопировано'));
    };
    clientRow.appendChild(copyBtn);
    infoBox.appendChild(clientRow);

    body.appendChild(iconBox);
    body.appendChild(infoBox);
    card.appendChild(body);

    // 3. Комментарий (если есть)
    if (a.comment) {
        const commentBox = createEl('div', 'bg-background-dark/50 rounded-xl p-3 border border-border-dark/50 mt-1 w-full overflow-hidden');
        commentBox.appendChild(createEl('span', 'text-[10px] text-primary font-bold uppercase tracking-wider block mb-1', 'Комментарий'));
        commentBox.appendChild(createEl('p', 'text-xs text-text-secondary leading-relaxed break-words whitespace-pre-wrap', a.comment));
        card.appendChild(commentBox);
    }

    // 4. Кнопки действий
    const actionsArea = createEl('div', 'flex flex-col gap-2 mt-2');

    // Кнопки статусов (Подтвердить/Отменить и т.д.)
    if (a.status === 'pending' || a.status === 'confirmed') {
        const btnBox = createEl('div', 'flex gap-2');

        if (a.status === 'pending') {
            btnBox.appendChild(createActionBtn('Отменить', 'bg-background-dark text-text-secondary hover:text-error border border-border-dark', () => updateStatus(a.id, 'cancel')));
            btnBox.appendChild(createActionBtn('Подтвердить', 'bg-primary text-fixed-white hover:brightness-110 shadow-primary/20 flex-[2]', () => updateStatus(a.id, 'confirm')));
        } else {
            btnBox.appendChild(createActionBtn('Отменить', 'bg-background-dark text-text-secondary hover:text-error border border-border-dark', () => updateStatus(a.id, 'cancel')));
            btnBox.appendChild(createActionBtn('Завершить', 'bg-success text-fixed-white hover:brightness-110 shadow-success/20 flex-[2]', () => updateStatus(a.id, 'complete')));
        }
        actionsArea.appendChild(btnBox);
    }

    // [RESTORED] Кнопка мессенджера (Telegram / WhatsApp)
    const msgBtn = createEl('button', 'w-full py-2.5 rounded-xl bg-background-dark text-text-secondary font-bold text-xs border border-border-dark flex items-center justify-center gap-2 hover:bg-surface-dark hover:text-white transition-all active:scale-[0.98]');
    const isTg = !!a.client_username;

    // Вставляем иконку безопасно
    const iconSpan = createEl('span', isTg ? 'text-[#29b6f6]' : 'text-success');
    iconSpan.innerHTML = isTg ? ICONS.Telegram : ICONS.WhatsApp;

    msgBtn.appendChild(iconSpan);
    msgBtn.appendChild(document.createTextNode(isTg ? ' Telegram' : ' WhatsApp'));

    msgBtn.onclick = () => {
        if (isTg) Telegram.WebApp.openTelegramLink(`https://t.me/${a.client_username}`);
        else Telegram.WebApp.openLink(`https://wa.me/${a.client_phone.replace(/\D/g, '')}`);
    };
    actionsArea.appendChild(msgBtn);

    card.appendChild(actionsArea);
    return card;
}

function createActionBtn(text: string, cls: string, onClick: () => Promise<void>) {
    const b = createEl('button', `flex-1 py-2.5 rounded-xl font-bold text-xs active:scale-[0.98] transition-all shadow-lg ${cls}`, text);
    b.onclick = async (e) => {
        const t = e.target as HTMLButtonElement;
        t.disabled = true;
        t.textContent = '...';
        await onClick();
    };
    return b;
}

async function updateStatus(id: number, action: 'confirm' | 'cancel' | 'complete') {
    if (action !== 'confirm' && !(await showConfirm(action === 'cancel' ? 'Отменить запись?' : 'Завершить услугу?'))) {
        renderList(); // Сброс состояния кнопок
        return;
    }
    try {
        await apiFetch(`/me/appointments/${id}/${action}`, { method: 'POST' });
        showToast(action === 'cancel' ? 'Отменено' : 'Успешно');
        loadAppointments();
    } catch {
        showToast('Ошибка', 'error');
        renderList();
    }
}

export function initAppointmentHandlers() {
    // Хендлеры можно добавить сюда, если нужно, но основная логика внутри render...
}