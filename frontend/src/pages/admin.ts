/**
 * (c) 2026 Vladimir Kovalenko
 */
import { initTelegram } from '../core/tg';
import { $ } from '../core/dom';
import { loadProfile, initProfileHandlers } from '../features/admin/profile';
import { loadServices, initServiceHandlers } from '../features/admin/services';
import { loadSchedule, initScheduleHandlers } from '../features/admin/schedule';
import { loadAppointments } from '../features/admin/appointments';
import { loadAnalytics } from '../features/admin/analytics'; // [NEW] Импорт аналитики

declare const IMask: any;

initTelegram();

// Global mask init
const phoneEl = $('phone');
if (phoneEl && typeof IMask !== 'undefined') {
    IMask(phoneEl, { mask: '+{7} (000) 000-00-00', lazy: false });
}

// Tab Switching Logic
(window as any).switchTab = (tabName: string) => {
    // UI Updates
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active', 'border-b-primary', 'text-white');
        el.querySelector('p')?.classList.remove('text-white');
    });

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => {
        if (btn.getAttribute('onclick')?.includes(tabName)) {
            btn.classList.add('active', 'border-b-primary');
            btn.querySelector('p')?.classList.add('text-white');
        }
    });

    // Titles
    const titles: any = {
        'profile': 'Данные салона',
        'services': 'Услуги',
        'schedule': 'График работы',
        'appointments': 'Журнал записей',
        'analytics': 'Аналитика' // [NEW] Заголовок
    };
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.innerText = titles[tabName] || 'Админка';

    // Data Loading
    if (tabName === 'appointments') loadAppointments();
    if (tabName === 'analytics') loadAnalytics(); // [NEW] Загрузка данных
};

// Init Actions
loadProfile();
initProfileHandlers();
loadServices();
initServiceHandlers();
loadSchedule();
initScheduleHandlers();