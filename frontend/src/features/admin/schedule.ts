import { $ } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { showToast } from '../../ui/toast';
import { getScheduleSkeleton } from '../../ui/skeletons';
import { WorkingHour } from '../../types';

// Хелпер
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

export async function loadSchedule() {
    const container = $('schedule-container');
    if (!container) return;

    let isPremium = false;
    try {
        const me = await apiFetch<any>('/me');
        isPremium = me.profile.is_premium;
    } catch { }

    container.innerHTML = getScheduleSkeleton();

    try {
        const hours = await apiFetch<WorkingHour[]>('/me/working-hours');
        container.innerHTML = '';

        // Настройка селекта слотов
        const slotSelect = $('slot-duration') as HTMLSelectElement;
        if (slotSelect) {
            const savedSlot = hours.find(h => h.slot_minutes)?.slot_minutes || 30;

            if (!isPremium) {
                slotSelect.value = "30";
                slotSelect.disabled = true;
                slotSelect.classList.add('opacity-50', 'cursor-not-allowed');
                slotSelect.title = "Доступно в Pro версии";
            } else {
                slotSelect.disabled = false;
                slotSelect.classList.remove('opacity-50', 'cursor-not-allowed');
                slotSelect.value = savedSlot.toString();
            }
        }

        const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

        days.forEach((dayName, idx) => {
            const dayNum = idx + 1;
            const data = hours.find(h => h.day_of_week === dayNum);
            const isActive = !!data;

            // Создаем строку через DOM
            const row = createEl('div', `group flex items-center gap-3 bg-background-dark px-4 py-4 min-h-[64px] hover:bg-surface-dark transition-colors border-b border-border-dark/30 last:border-0 ${!isActive ? 'opacity-50' : ''}`);

            // 1. Левая часть (Чекбокс + Название)
            const leftDiv = createEl('div', 'flex items-center gap-3 flex-1 min-w-0');

            const checkWrapper = createEl('div', 'flex size-6 items-center justify-center shrink-0');
            const checkbox = createEl('input', 'h-5 w-5 rounded border-border-dark border-2 bg-transparent text-primary checked:bg-primary focus:ring-0 cursor-pointer transition-all');
            checkbox.type = 'checkbox';
            checkbox.dataset.day = dayNum.toString();
            checkbox.checked = isActive;

            const label = createEl('p', `label text-white text-base font-medium truncate transition-all ${!isActive ? 'line-through decoration-text-secondary text-text-secondary' : ''}`, dayName);

            checkWrapper.appendChild(checkbox);
            leftDiv.appendChild(checkWrapper);
            leftDiv.appendChild(label);

            // 2. Правая часть (Инпуты времени)
            const settingsDiv = createEl('div', `settings flex items-center gap-2 shrink-0 transition-all ${!isActive ? 'pointer-events-none grayscale opacity-50' : ''}`);

            const inputStart = createEl('input', 'time-start bg-surface-dark border border-border-dark/50 text-white text-sm font-semibold px-2 py-1.5 rounded-lg w-[76px] text-center focus:ring-1 focus:ring-primary outline-none');
            inputStart.type = 'time';
            inputStart.value = data?.start_time?.slice(0,5) || '09:00';

            const divider = createEl('span', 'text-text-secondary font-medium', '-');

            const inputEnd = createEl('input', 'time-end bg-surface-dark border border-border-dark/50 text-white text-sm font-semibold px-2 py-1.5 rounded-lg w-[76px] text-center focus:ring-1 focus:ring-primary outline-none');
            inputEnd.type = 'time';
            inputEnd.value = data?.end_time?.slice(0,5) || '18:00';

            settingsDiv.appendChild(inputStart);
            settingsDiv.appendChild(divider);
            settingsDiv.appendChild(inputEnd);

            row.appendChild(leftDiv);
            row.appendChild(settingsDiv);

            // Логика переключения
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    row.classList.remove('opacity-50');
                    settingsDiv.classList.remove('pointer-events-none', 'grayscale', 'opacity-50');
                    label.classList.remove('line-through', 'decoration-text-secondary', 'text-text-secondary');
                } else {
                    row.classList.add('opacity-50');
                    settingsDiv.classList.add('pointer-events-none', 'grayscale', 'opacity-50');
                    label.classList.add('line-through', 'decoration-text-secondary', 'text-text-secondary');
                }
            };

            container.appendChild(row);
        });
    } catch (e) { console.error(e); }
}

export function initScheduleHandlers() {
    const btn = $('btn-save-schedule');
    if (btn) {
        btn.onclick = async (e) => {
            const button = e.target as HTMLButtonElement;
            button.disabled = true;
            const payload: any[] = [];

            const slotSelect = $('slot-duration') as HTMLSelectElement;
            const slotDur = parseInt(slotSelect?.value) || 30;

            const rows = document.querySelectorAll('#schedule-container .group');

            rows.forEach(row => {
                const cb = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
                if (cb.checked) {
                    const start = (row.querySelector('.time-start') as HTMLInputElement).value;
                    const end = (row.querySelector('.time-end') as HTMLInputElement).value;
                    payload.push({
                        day_of_week: parseInt(cb.dataset.day!),
                        start_time: start,
                        end_time: end,
                        slot_minutes: slotDur
                    });
                }
            });

            try {
                await apiFetch('/me/working-hours', { method: 'POST', body: JSON.stringify(payload) });
                showToast('График сохранен');
            } catch { showToast('Ошибка сохранения', 'error'); }
            button.disabled = false;
        };
    }
}