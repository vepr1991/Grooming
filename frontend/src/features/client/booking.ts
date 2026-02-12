import { $, setText, show, hide, getVal } from '../../core/dom';
import { apiFetch, BASE_URL } from '../../core/api';
import { Telegram } from '../../core/tg';
import { Service } from '../../types';
import { showToast } from '../../ui/toast';

let selectedService: Service | null = null;
let selectedDate: string | null = null;
let selectedSlot: string | null = null;
let masterId: string = '';
let masterTimezone = 'Asia/Almaty';
let uploadedPhotos: string[] = []; // [NEW] Массив загруженных фото
let isMasterPremium = false; // [NEW] Статус мастера

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

// [UPDATED] Принимаем isPremium
export function setupBooking(mId: string, tz: string, isPremium: boolean = false) {
    masterId = mId;
    masterTimezone = tz || 'Asia/Almaty';
    isMasterPremium = isPremium;

    const prevBtn = $('btn-prev-month');
    const nextBtn = $('btn-next-month');

    if (prevBtn) prevBtn.onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderCalendar(); };
    if (nextBtn) nextBtn.onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderCalendar(); };

    // Инициализация загрузчика, если мастер PRO
    initPhotoUploader();
}

// [NEW] Логика загрузки фото (Только для PRO)
function initPhotoUploader() {
    const container = document.querySelector('.group:has(#inp-pet-photo)') as HTMLElement;
    const input = $('inp-pet-photo') as HTMLInputElement;
    const preview = $('photo-preview') as HTMLImageElement;
    const icon = $('photo-icon');
    const loading = $('photo-loading');
    const removeBtn = $('btn-remove-photo');
    const label = $('photo-label');

    // Если мастер не премиум или элементов нет — скрываем блок и выходим
    if (!isMasterPremium || !container) {
        if (container) container.style.display = 'none';
        return;
    }

    // Показываем блок (на случай если он был скрыт)
    container.style.display = 'block';

    if (!input) return;

    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        if (loading) show(loading);

        try {
            // 1. Сжимаем
            const compressedFile = await compressImage(file);

            // 2. Загружаем
            const url = await uploadClientPhoto(compressedFile);

            // Сохраняем в массив (пока поддерживаем 1 фото для простоты UI, но шлем массив)
            uploadedPhotos = [url];

            // 3. Обновляем UI
            if (preview) {
                preview.src = URL.createObjectURL(compressedFile);
                show(preview);
            }
            if (icon) hide(icon);
            if (removeBtn) show(removeBtn);
            if (label) label.textContent = 'Фото загружено';

        } catch (e) {
            console.error(e);
            showToast('Ошибка загрузки фото', 'error');
        } finally {
            if (loading) hide(loading);
            input.value = '';
        }
    };

    if (removeBtn) {
        removeBtn.onclick = () => {
            uploadedPhotos = [];
            if (preview) { preview.src = ''; hide(preview); }
            if (icon) show(icon);
            hide(removeBtn);
            if (label) label.textContent = 'Нажмите, чтобы добавить фото';
        };
    }
}

// [NEW] Сжатие изображения (Canvas)
async function compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject('Canvas error');

            const MAX_SIZE = 1280;
            let { width, height } = img;

            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                else reject('Blob error');
            }, 'image/jpeg', 0.8);
        };
        img.onerror = reject;
    });
}

async function uploadClientPhoto(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: HeadersInit = {};
    const initData = Telegram.WebApp.initData || '';
    if (initData) headers['Authorization'] = `tma ${initData}`;

    const response = await fetch(`${BASE_URL}/upload-pet-photo`, {
        method: 'POST', headers, body: formData
    });

    if (!response.ok) throw new Error('Upload failed');
    const data = await response.json();
    return data.url;
}

export function openBooking(service: Service, onBack: () => void) {
    selectedService = service;
    selectedDate = null;
    selectedSlot = null;
    onBackCallback = onBack;

    // Сброс фото при новом открытии
    uploadedPhotos = [];
    const preview = $('photo-preview') as HTMLImageElement;
    const icon = $('photo-icon');
    const removeBtn = $('btn-remove-photo');
    const label = $('photo-label');

    if(preview) { hide(preview); preview.src = ''; }
    if(icon) show(icon);
    if(removeBtn) hide(removeBtn);
    if(label) label.textContent = 'Нажмите, чтобы добавить фото';

    setText('selected-service-name', `${service.name} • ${service.price} ₸`);
    hide('view-home');
    show('view-booking');
    hide('slots-container');
    hide('booking-form');

    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick(closeBooking);

    viewDate = new Date();
    const today = new Date();
    selectDate(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);
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
    for (let i = 1; i < firstDay; i++) gridEl.appendChild(createEl('div'));

    const today = new Date(); today.setHours(0,0,0,0);

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const isoDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        const isPast = date < today;
        const isSelected = selectedDate === isoDate;

        let cls = 'day-cell';
        if (date.getTime() === today.getTime()) cls += ' today';
        if (isSelected) cls += ' selected';
        if (isPast) cls += ' disabled';

        const cell = createEl('div', cls, d.toString());
        if (!isPast) cell.onclick = () => selectDate(isoDate);
        gridEl.appendChild(cell);
    }
}

async function loadSlots(date: string) {
    show('slots-container');
    const grid = $('slots-grid');
    if(!grid) return;
    grid.innerHTML = '<div class="col-span-4 text-center text-secondary text-sm py-4">Поиск окошек...</div>';

    try {
        const slots = await apiFetch<string[]>(`/masters/${masterId}/availability?date=${date}&service_id=${selectedService!.id}`);
        grid.innerHTML = '';

        if (slots.length === 0) {
            grid.innerHTML = '<div class="col-span-4 text-center text-secondary/50 text-sm py-2">Нет мест</div>';
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
    } catch {
        grid.innerHTML = '<div class="col-span-4 text-center text-error text-sm">Ошибка загрузки</div>';
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

    if (!name || phone.length < 10) { showToast('Заполните имя и телефон', 'error'); return; }
    if (!agreement) { showToast('Примите условия оферты', 'error'); return; }

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
            pet_photos: uploadedPhotos, // [UPDATED] Отправляем массив
            comment: getVal('inp-comment').trim() || null
        };

        await apiFetch('/appointments', { method: 'POST', body: JSON.stringify(payload) });

        if (selectedDate && selectedSlot) {
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
            showToast('Ошибка при записи', 'error');
        }
    }
}