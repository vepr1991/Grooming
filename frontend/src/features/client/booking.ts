import { $, setText, show, hide, getVal } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { Telegram } from '../../core/tg';
import { Service } from '../../types';
import { showToast } from '../../ui/toast';

let selectedService: Service | null = null;
let selectedDate: string | null = null;
let selectedSlot: string | null = null;
let masterId: string = '';
let masterTimezone = 'Asia/Almaty';
let isMasterPremium = false; // [FIX] Добавили переменную для хранения статуса

// Calendar state
let viewDate = new Date();
let onBackCallback: (() => void) | null = null;

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

// [FIX] Используем isPremium нормально
export function setupBooking(mId: string, tz: string, isPremium: boolean = false) {
    masterId = mId;
    masterTimezone = tz || 'Asia/Almaty';
    isMasterPremium = isPremium; // Сохраняем статус

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

    // Сбрасываем форму (включая фото)
    const photoInput = $('inp-pet-photo') as HTMLInputElement;
    const previewBox = $('photo-preview-box');
    const uploadLabel = photoInput?.closest('label');
    const photoContainer = $('photo-upload-container'); // Находим сам блок

    if (photoInput) photoInput.value = '';
    if (previewBox) previewBox.classList.add('hidden');
    if (uploadLabel) uploadLabel.classList.remove('hidden');

    // [FIX] Логика отображения: Показываем только если мастер Premium
    if (photoContainer) {
        if (isMasterPremium) {
            photoContainer.classList.remove('hidden');
        } else {
            photoContainer.classList.add('hidden');
        }
    }

    hide('view-home');
    show('view-booking');
    hide('slots-container');
    hide('booking-form');

    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick(closeBooking);

    viewDate = new Date();
    const today = new Date();

    renderCalendar();
    selectDate(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);
}

function selectDate(dateStr: string) {
    selectedDate = dateStr;
    selectedSlot = null;
    hide('booking-form');
    Telegram.WebApp.MainButton.hide();

    const days = document.querySelectorAll('.day-cell');
    days.forEach(d => {
        d.classList.remove('selected');
        renderCalendar();
    });

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
    for (let i = 1; i < firstDay; i++) gridEl.appendChild(createEl('div'));

    const today = new Date(); today.setHours(0,0,0,0);

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const isoDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        const isPast = date < today;
        const isSelected = selectedDate === isoDate;

        let cls = 'day-cell p-2 rounded-lg font-bold text-sm cursor-pointer hover:bg-surface transition-colors text-white';
        if (date.getTime() === today.getTime()) cls += ' border border-primary text-primary';
        if (isSelected) cls = 'day-cell p-2 rounded-lg font-bold text-sm bg-primary text-white shadow-lg transform scale-105';
        if (isPast) cls = 'day-cell p-2 text-text-secondary/20 cursor-not-allowed';

        const cell = createEl('div', cls, d.toString());
        if (!isPast) cell.onclick = () => selectDate(isoDate);
        gridEl.appendChild(cell);
    }
}

async function loadSlots(date: string) {
    show('slots-container');
    const grid = $('slots-grid');
    if(!grid) return;
    grid.innerHTML = '<div class="col-span-4 text-center text-text-secondary text-sm py-4 animate-pulse">Поиск окошек...</div>';

    try {
        const slots = await apiFetch<string[]>(`/masters/${masterId}/availability?date=${date}&service_id=${selectedService!.id}`);
        grid.innerHTML = '';

        if (slots.length === 0) {
            grid.innerHTML = '<div class="col-span-4 text-center text-text-secondary/50 text-sm py-2">Нет мест на этот день</div>';
            return;
        }

        slots.forEach((isoTime) => {
            const time = new Date(isoTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: masterTimezone });
            const btn = createEl('button', 'py-2 px-1 bg-surface border border-border rounded-xl text-white font-bold text-sm hover:border-primary focus:bg-primary focus:border-primary transition-all', time);

            btn.onclick = () => {
                Array.from(grid.children).forEach(child => {
                    child.className = 'py-2 px-1 bg-surface border border-border rounded-xl text-white font-bold text-sm hover:border-primary transition-all';
                });
                btn.className = 'py-2 px-1 bg-primary border-primary rounded-xl text-white font-bold text-sm shadow-lg ring-2 ring-primary/30';
                selectedSlot = isoTime;
                showBookingForm();
            };
            grid.appendChild(btn);
        });
    } catch {
        grid.innerHTML = '<div class="col-span-4 text-center text-red-400 text-sm">Ошибка загрузки расписания</div>';
    }
}

function showBookingForm() {
    show('booking-form');
    setTimeout(() => {
        const form = document.getElementById('booking-form');
        if(form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    if (selectedService) {
        Telegram.WebApp.MainButton.setText(`ЗАПИСАТЬСЯ • ${selectedService.price} ₸`);
        Telegram.WebApp.MainButton.show();
        Telegram.WebApp.MainButton.onClick(submitBooking);
    }
}

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

async function submitBooking() {
    const name = getVal('inp-client-name').trim();
    const phone = getVal('inp-phone').trim();
    const agreement = ($('inp-agreement') as HTMLInputElement)?.checked;

    if (!name || phone.length < 10) { showToast('Заполните имя и телефон', 'error'); return; }
    if (!agreement) { showToast('Примите условия оферты', 'error'); return; }

    Telegram.WebApp.MainButton.showProgress();

    try {
        let photoBase64 = null;
        // [FIX] Обрабатываем фото только если мастер Premium
        if (isMasterPremium) {
            const photoInput = $('inp-pet-photo') as HTMLInputElement;
            if (photoInput && photoInput.files && photoInput.files[0]) {
                try {
                    photoBase64 = await fileToBase64(photoInput.files[0]);
                } catch (e) {
                    console.error("Ошибка обработки фото", e);
                }
            }
        }

        const payload = {
            master_telegram_id: parseInt(masterId),
            service_id: selectedService!.id,
            starts_at: selectedSlot,
            client_name: name,
            client_phone: phone,
            client_username: Telegram.WebApp.initDataUnsafe?.user?.username || null,
            pet_name: getVal('inp-pet-name').trim(),
            pet_breed: getVal('inp-pet-breed').trim() || null,
            comment: getVal('inp-comment').trim() || null,
            pet_photo_base64: photoBase64 // Отправляем фото (или null)
        };

        await apiFetch('/appointments', { method: 'POST', body: JSON.stringify(payload) });

        if (selectedSlot) {
            const d = new Date(selectedSlot);
            const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: masterTimezone });
            const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
            setText('success-date', `${dateStr} в ${timeStr}`);
            setText('success-service', selectedService!.name);
        }

        hide('view-booking');
        show('view-success');
        Telegram.WebApp.MainButton.hide();
    } catch (e: any) {
        Telegram.WebApp.MainButton.hideProgress();
        if (e.message && e.message.includes('409')) {
            showToast('Это время уже занято', 'error');
            if (selectedDate) loadSlots(selectedDate);
        } else {
            console.error(e);
            showToast('Ошибка при записи', 'error');
        }
    }
}