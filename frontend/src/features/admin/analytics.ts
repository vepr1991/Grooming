import { $, setText, show, hide } from '../../core/dom';
import { apiFetch } from '../../core/api';

export async function loadAnalytics() {
    const content = $('analytics-content');
    const lock = $('analytics-lock');
    if (!content || !lock) return;

    try {
        const data = await apiFetch<any>('/me/analytics/dashboard');

        if (!data.is_premium) {
            show(lock);
            hide(content);
            return;
        }

        hide(lock);
        show(content);
        content.classList.add('flex');

        // 1. KPI
        setText('an-revenue', `${data.kpi.revenue.toLocaleString()} ₸`);
        setText('an-avg', `${data.kpi.avg_check.toLocaleString()} ₸`);

        // 2. Топ услуг (SECURE FIX)
        const topContainer = $('an-top-services');
        if (topContainer) {
            topContainer.innerHTML = ''; // Очистка безопасна
            const max = Math.max(...data.top_services.map((s:any) => s.count)) || 1;

            if (data.top_services.length === 0) {
                 const p = document.createElement('p');
                 p.className = "text-xs text-text-secondary text-center";
                 p.textContent = "Нет данных";
                 topContainer.appendChild(p);
            } else {
                data.top_services.forEach((s: any) => {
                    const percent = (s.count / max) * 100;

                    // Создаем контейнер
                    const item = document.createElement('div');
                    item.className = "flex flex-col gap-1.5";

                    // Верхняя строка (Имя + Кол-во)
                    const header = document.createElement('div');
                    header.className = "flex justify-between items-center text-xs";

                    const nameSpan = document.createElement('span');
                    nameSpan.className = "text-white font-medium truncate pr-4";
                    nameSpan.textContent = s.name; // БЕЗОПАСНО

                    const countSpan = document.createElement('span');
                    countSpan.className = "text-text-secondary font-bold";
                    countSpan.textContent = `${s.count} зап.`;

                    header.appendChild(nameSpan);
                    header.appendChild(countSpan);

                    // Прогресс бар
                    const barBg = document.createElement('div');
                    barBg.className = "w-full bg-background-dark h-2 rounded-full overflow-hidden";

                    const barFill = document.createElement('div');
                    barFill.className = "h-full bg-primary transition-all duration-1000 ease-out";
                    barFill.style.width = `${percent}%`;

                    barBg.appendChild(barFill);

                    item.appendChild(header);
                    item.appendChild(barBg);

                    topContainer.appendChild(item);
                });
            }
        }

        // 3. Bar Chart (Динамика)
        const barsContainer = $('an-chart-bars');
        const labelsContainer = $('an-chart-labels');
        if (barsContainer && labelsContainer) {
            barsContainer.innerHTML = '';
            labelsContainer.innerHTML = '';

            const maxVal = Math.max(...data.daily_dynamics.map((d:any) => d.value)) || 5;

            data.daily_dynamics.forEach((day: any) => {
                const height = (day.value / maxVal) * 100;
                const color = day.is_today ? 'bg-primary' : 'bg-primary/40';

                // Столбик
                const barWrapper = document.createElement('div');
                barWrapper.className = "w-full bg-background-dark/30 rounded-t-lg relative group flex items-end justify-center h-full";

                const bar = document.createElement('div');
                bar.className = `${color} w-full mx-1 rounded-t-md transition-all duration-700 ease-out relative group-hover:brightness-110`;
                bar.style.height = `${height || 5}%`;

                const tooltip = document.createElement('div');
                tooltip.className = "absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-dark border border-border-dark px-2 py-1 rounded text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-xl";
                tooltip.textContent = `${day.value} зап.`;

                bar.appendChild(tooltip);
                barWrapper.appendChild(bar);
                barsContainer.appendChild(barWrapper);

                // Подпись
                const label = document.createElement('span');
                label.className = "text-[9px] text-text-secondary font-bold uppercase w-full text-center truncate";
                label.textContent = day.day.split(' ')[0];
                labelsContainer.appendChild(label);
            });
        }

        // 4. Pie Chart
        const s = data.status_distribution;
        const total = s.completed + s.cancelled + s.pending;
        setText('an-total-count', total.toString());

        if (total > 0) {
            const degCompleted = (s.completed / total) * 360;
            const degPending = (s.pending / total) * 360;
            const p1 = degCompleted;
            const p2 = degCompleted + degPending;

            const pie = document.getElementById('an-pie');
            if (pie) {
                pie.style.background = `conic-gradient(
                    var(--c-success) 0deg ${p1}deg,
                    var(--c-primary) ${p1}deg ${p2}deg,
                    var(--c-error) ${p2}deg 360deg
                )`;
            }

            const legend = $('an-pie-legend');
            if (legend) {
                legend.innerHTML = ''; // Чистим
                legend.appendChild(createLegendItem('Завершено', s.completed, total, 'bg-success'));
                legend.appendChild(createLegendItem('В ожидании', s.pending, total, 'bg-primary'));
                legend.appendChild(createLegendItem('Отменено', s.cancelled, total, 'bg-error'));
            }
        }

        // 5. Совет
        const advice = data.top_services.length > 0
            ? `Услуга "${data.top_services[0].name}" в топе! Попробуйте создать пакетное предложение с ней.`
            : 'Заполните график и добавьте услуги, чтобы начать работу.';
        setText('an-advice', advice);

    } catch (e) { console.error(e); }
}

function createLegendItem(label: string, val: number, total: number, bgClass: string) {
    if (val === 0) return document.createDocumentFragment(); // Пустой элемент

    const percent = Math.round((val / total) * 100);

    const container = document.createElement('div');
    container.className = "flex items-center justify-between";

    const left = document.createElement('div');
    left.className = "flex items-center gap-2";

    const dot = document.createElement('div');
    dot.className = `w-2.5 h-2.5 rounded-full ${bgClass}`;

    const textLabel = document.createElement('span');
    textLabel.className = "text-xs text-text-secondary font-medium";
    textLabel.textContent = label;

    left.appendChild(dot);
    left.appendChild(textLabel);

    const right = document.createElement('span');
    right.className = "text-xs font-bold text-white";
    right.textContent = `${val} (${percent}%)`;

    container.appendChild(left);
    container.appendChild(right);

    return container;
}