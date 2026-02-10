import { $, setText, show, hide, getVal } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { Telegram } from '../../core/tg';
import { Service } from '../../types';
import { showToast } from '../../ui/toast'; // [FIX] Импорт

let selectedService: Service | null = null;
let selectedDate: string | null = null;
let selectedSlot: string | null = null;
let masterId: string = '';
let masterTimezone = 'Asia/Almaty';

// Calendar state
let viewDate = new Date();
let onBackCallback: (() => void) | null = null;

// Хелпер
function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function closeBooking() {
    Telegram.WebApp.BackButton.hide();
    Telegram.WebApp.MainButton.hide();
    hide('view-booking');
    show('view-home');
    if (onBackCallback) onBackCallback();
}

(window as any).goBack = closeBooking;

export function setupBooking(mId: string, tz: string) {
    masterId = mId;
    masterTimezone = tz || 'Asia/Almaty';

    const prevBtn = $('btn-prev-month');
    const nextBtn = $('btn-next-month');

    if (prevBtn) prevBtn.onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderCalendar(); };
    if (nextBtn) nextBtn.onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderCalendar(); };
}

export function openBooking(service: Service, onBack: () => void) {
    selectedService = service;
    selectedDate = null;
    selectedSlot = null;
    onBackCallback = onBack;

    setText('selected-service-name', `${service.name} • ${service.price} ₸`);
    hide('view-home');
    show('view-booking');

    hide('slots-container');
    hide('booking-form');

    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick(closeBooking);

    viewDate = new Date();
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    selectDate(`${y}-${m}-${d}`);
}

function selectDate(dateStr: string) {
    selectedDate = dateStr;
    selectedSlot = null;
    hide('booking-form');
    Telegram.WebApp.MainButton.hide();

    renderCalendar();
    loadSlots(dateStr);
}

function renderCalendar() {
    const monthEl = $('cal-month');
    const gridEl = $('cal-grid');
    if (!monthEl || !gridEl) return;

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    monthEl.textContent = new Date(year, month).toLocaleString('ru', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay() || 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    gridEl.innerHTML = '';

    for (let i = 1; i < firstDay; i++) {
        gridEl.appendChild(createEl('div'));
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const isPast = date < today;
        const isToday = date.getTime() === today.getTime();

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const dayStr = String(date.getDate()).padStart(2, '0');
        const isoDate = `${y}-${m}-${dayStr}`;

        const isSelected = selectedDate === isoDate;

        let className = 'day-cell';
        if (isToday) className += ' today';
        if (isSelected) className += ' selected';
        if (isPast) className += ' disabled';

        const cell = createEl('div', className, d.toString());

        if (!isPast) {
            cell.onclick = () => selectDate(isoDate);
        }
        gridEl.appendChild(cell);
    }
}

async function loadSlots(date: string) {
    show('slots-container');
    const grid = $('slots-grid');
    if(!grid) return;

    grid.innerHTML = '';

    if (!selectedService) {
        grid.appendChild(createEl('div', 'col-span-4 text-center text-error', 'Ошибка: Услуга не выбрана'));
        return;
    }

    grid.appendChild(createEl('div', 'col-span-4 text-center text-secondary text-sm py-4', 'Поиск окошек...'));

    try {
        const slots = await apiFetch<string[]>(`/masters/${masterId}/availability?date=${date}&service_id=${selectedService.id}`);

        grid.innerHTML = '';

        if (slots.length === 0) {
            grid.appendChild(createEl('div', 'col-span-4 text-center text-secondary/50 text-sm py-2', 'Нет мест'));
            return;
        }

        slots.forEach((isoTime) => {
            const time = new Date(isoTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: masterTimezone });

            const btn = createEl('button', 'slot-btn', time);

            btn.onclick = () => {
                document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedSlot = isoTime;
                showBookingForm();
            };
            grid.appendChild(btn);
        });
    } catch (e) {
        grid.innerHTML = '';
        grid.appendChild(createEl('div', 'col-span-4 text-center text-error text-sm', 'Ошибка загрузки'));
    }
}

function showBookingForm() {
    show('booking-form');
    setTimeout(() => $('booking-form')?.scrollIntoView({ behavior: 'smooth' }), 100);

    if (selectedService) {
        Telegram.WebApp.MainButton.setText(`ЗАПИСАТЬСЯ • ${selectedService.price} ₸`);
        Telegram.WebApp.MainButton.show();
        Telegram.WebApp.MainButton.onClick(submitBooking);
    }
}

async function submitBooking() {
    const name = getVal('inp-client-name').trim();
    const phone = getVal('inp-phone').trim();
    const agreement = ($('inp-agreement') as HTMLInputElement)?.checked;

    if (!name || phone.length < 10) {
        showToast('Заполните имя и телефон', 'error');
        return;
    }

    if (!agreement) {
        showToast('Примите условия оферты', 'error');
        return;
    }

    Telegram.WebApp.MainButton.showProgress();

    try {
        const payload = {
            master_telegram_id: parseInt(masterId),
            service_id: selectedService!.id,
            starts_at: selectedSlot,
            client_name: name,
            client_phone: phone,
            client_username: Telegram.WebApp.initDataUnsafe?.user?.username || null,
            pet_name: getVal('inp-pet-name').trim(),
            pet_breed: getVal('inp-pet-breed').trim() || null,
            comment: getVal('inp-comment').trim() || null
        };

        await apiFetch('/appointments', { method: 'POST', body: JSON.stringify(payload) });

        // Успех
        if (selectedDate && selectedSlot) {
            const dateObj = new Date(selectedSlot);
            const timeStr = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: masterTimezone });
            const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

            setText('success-date', `${dateStr} в ${timeStr}`);
            setText('success-service', selectedService!.name);
        }

        hide('view-booking');
        show('view-success');
        Telegram.WebApp.MainButton.hide();

    } catch (e: any) {
        Telegram.WebApp.MainButton.hideProgress();

        // [FIX] Обработка конфликта (409)
        if (e.message && (e.message.includes('409') || e.message.toLowerCase().includes('conflict') || e.message.includes('занято'))) {
            showToast('Это время только что заняли. Выберите другое.', 'error');
            // Обновляем слоты, чтобы пользователь увидел, что место пропало
            if (selectedDate) loadSlots(selectedDate);
        } else {
            showToast('Ошибка при записи. Попробуйте позже.', 'error');
        }
    }
}