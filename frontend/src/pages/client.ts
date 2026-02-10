/**
 * (c) 2026 Vladimir Kovalenko
 */
import { initTelegram, Telegram } from '../core/tg';
import { $, show, hide } from '../core/dom';
import { apiFetch } from '../core/api';
import { loadMasterInfo, loadServices } from '../features/client/home';
import { setupBooking, openBooking } from '../features/client/booking';
import { MasterProfile } from '../types';

declare const IMask: any;

initTelegram();

const urlParams = new URLSearchParams(window.location.search);
const masterId = urlParams.get('start_param') || '579214945';

// Глобальная переменная для хранения профиля мастера (чтобы использовать в документах)
let loadedProfile: MasterProfile | null = null;

// --- ГЕНЕРАТОР ЮРИДИЧЕСКИХ ТЕКСТОВ ---
function getOfferData(p: MasterProfile | null) {
    const name = p?.salon_name || 'Груминг Салон';
    const address = p?.address || 'Республика Казахстан';
    const phone = p?.phone || 'Не указан';

    return [
        {
            title: "1. Общие положения",
            content: [
                `1.1. Настоящий документ является публичной офертой (предложением) Исполнителя («${name}») заключить договор на оказание услуг по уходу за животными (грумингу) на изложенных ниже условиях.`,
                "1.2. Оформление записи в Приложении означает полное и безоговорочное принятие (акцепт) условий настоящей оферты.",
                "1.3. Исполнитель оставляет за собой право вносить изменения в настоящую Оферту без предварительного уведомления."
            ]
        },
        {
            title: "2. Порядок записи и оказания услуг",
            content: [
                "2.1. Клиент самостоятельно выбирает услугу и время записи через интерфейс Приложения.",
                "2.2. Мастер имеет право отменить или перенести запись, уведомив Клиента, в случае возникновения форс-мажорных обстоятельств или болезни.",
                "2.3. Клиент обязуется предупредить об отмене визита не позднее чем за 24 часа до назначенного времени.",
                "2.4. Мастер вправе отказать в оказании услуги, если животное проявляет агрессию, имеет признаки инфекционных заболеваний или если Клиент находится в состоянии опьянения."
            ]
        },
        {
            title: "3. Финансовые условия",
            content: [
                "3.1. Стоимость услуг определяется согласно действующему прейскуранту (Тарифам), опубликованному в Приложении.",
                "3.2. Оплата производится Клиентом непосредственно после оказания услуги, либо в порядке предоплаты, если это предусмотрено условиями бронирования.",
                "3.3. В случае отказа от услуги менее чем за 24 часа, Исполнитель вправе требовать возмещения фактически понесенных расходов."
            ]
        },
        {
            title: "4. Ответственность",
            content: [
                "4.1. Мастер несет ответственность за безопасное и гуманное обращение с животным во время процедур.",
                "4.2. Клиент обязан предупредить Мастера об особенностях здоровья, аллергиях, перенесенных операциях и особенностях поведения питомца до начала услуги.",
                "4.3. Исполнитель не несет ответственности за ухудшение здоровья животного, если оно вызвано скрытыми заболеваниями, о которых Клиент не сообщил."
            ]
        },
        {
            title: "5. Использование Искусственного Интеллекта (AI)",
            content: [
                "5.1. Сервис использует технологии искусственного интеллекта (ИИ) для автоматизации функций: анализ расписания, генерация описаний, уведомления.",
                "5.2. Пользователь уведомлен, что ИИ является вероятностной технологией. Ответы или прогнозы ИИ могут содержать неточности («галлюцинации»).",
                "5.3. Исполнитель не несет ответственности за косвенные убытки, возникшие в результате решений, принятых Пользователем на основе рекомендаций ИИ.",
                "5.4. Пользователь предоставляет право использовать обезличенные данные о записях для обучения моделей ИИ с целью улучшения качества сервиса."
            ]
        },
        {
            title: "6. Реквизиты Исполнителя",
            content: [
                `Наименование: ${name}`,
                `Адрес: ${address}`,
                `Телефон: ${phone}`,
                `БИН/ИИН: [ЗАПОЛНИТЬ ПРИ РЕГИСТРАЦИИ]` // Плейсхолдер, так как в API этого поля пока нет
            ]
        }
    ];
}

function getPolicyData(p: MasterProfile | null) {
    const name = p?.salon_name || 'Сервис';

    return [
        {
            title: "1. Общие положения",
            content: [
                `1.1. Настоящая Политика действует в отношении всех персональных данных, которые «${name}» (далее — Оператор) может получить от Клиента во время использования Приложения.`,
                "1.2. Использование Приложения означает согласие Клиента на обработку его персональных данных в соответствии с Законом Республики Казахстан № 94-V «О персональных данных и их защите»."
            ]
        },
        {
            title: "2. Состав данных",
            content: [
                "2.1. Оператор обрабатывает следующие данные:",
                "— Имя, фамилия;",
                "— Номер телефона;",
                "— Данные аккаунта Telegram (ID, username);",
                "— Данные о питомце (кличка, порода, особенности);",
                "— История посещений и транзакций."
            ]
        },
        {
            title: "3. Цели обработки",
            content: [
                "3.1. Оформление записи на услуги и исполнение договора.",
                "3.2. Отправка уведомлений о статусе записи и напоминаний о визите (в т.ч. через ботов).",
                "3.3. Улучшение качества обслуживания и аналитика (в обезличенном виде)."
            ]
        },
        {
            title: "4. Порядок обработки и безопасность",
            content: [
                "4.1. Оператор принимает необходимые технические меры для защиты данных от неправомерного доступа.",
                "4.2. Сбор и хранение персональных данных граждан РК осуществляется с соблюдением требований локализации.",
                "4.3. Пользователь соглашается на трансграничную передачу данных исключительно в целях технического обеспечения работы Сервиса (хостинг, резервное копирование)."
            ]
        },
        {
            title: "5. Права пользователя",
            content: [
                "5.1. Пользователь имеет право требовать изменения или уничтожения своих данных.",
                "5.2. Согласие может быть отозвано путем направления письменного уведомления Оператору."
            ]
        }
    ];
}

async function init() {
    const phoneInput = $('inp-phone');
    if (typeof IMask !== 'undefined' && phoneInput) {
        IMask(phoneInput, { mask: '+{7} (000) 000-00-00', lazy: false });
    }

    const user = Telegram.WebApp.initDataUnsafe?.user;
    if (user) {
        const nameInput = $('inp-client-name') as HTMLInputElement;
        if (nameInput) nameInput.value = `${user.first_name} ${user.last_name || ''}`.trim();
    }

    // Загружаем профиль и сохраняем его в глобальную переменную
    loadedProfile = await loadMasterInfo(masterId);

    const tz = loadedProfile?.timezone || 'Asia/Almaty';
    setupBooking(masterId, tz);

    await loadServices(masterId, (service) => {
        openBooking(service, () => {});
    });

    const btnMyApps = $('btn-open-my-appointments');
    if (btnMyApps) {
        btnMyApps.onclick = openMyAppointments;
    }

    // Глобальные хендлеры
    (window as any).openLegal = openLegal;
    (window as any).closeLegal = closeLegal;
}

// --- ФУНКЦИИ ИНТЕРФЕЙСА ---

function closeHistory() {
    hide('view-my-appointments');
    show('view-home');
    Telegram.WebApp.BackButton.hide();
}

async function openMyAppointments() {
    hide('view-home');
    hide('view-booking');
    show('view-my-appointments');

    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick(closeHistory);

    const htmlBtn = $('btn-close-history');
    if (htmlBtn) htmlBtn.onclick = closeHistory;

    const list = $('my-appointments-list');
    if (!list) return;

    list.innerHTML = '';
    list.appendChild(createEl('div', 'text-center text-secondary py-10 animate-pulse', 'Загрузка...'));

    try {
        const apps = await apiFetch<any[]>('/my-appointments');
        list.innerHTML = '';

        if (apps.length === 0) {
            const emptyContainer = createEl('div', 'flex flex-col items-center justify-center py-20 opacity-50');
            const icon = createEl('span', 'material-symbols-rounded text-6xl text-secondary mb-4', 'history_toggle_off');
            const text = createEl('p', 'text-secondary font-bold', 'История пуста');

            emptyContainer.appendChild(icon);
            emptyContainer.appendChild(text);
            list.appendChild(emptyContainer);
            return;
        }

        apps.forEach(a => {
            const card = createEl('div', 'bg-surface border border-border rounded-xl p-4 flex gap-4');

            let statusColor = "bg-primary";
            let statusText = "Ожидает";
            if (a.status === 'confirmed') { statusColor = "bg-success"; statusText = "Подтверждено"; }
            if (a.status === 'cancelled') { statusColor = "bg-error"; statusText = "Отменено"; }
            if (a.status === 'completed') { statusColor = "bg-secondary"; statusText = "Завершено"; }

            const dateObj = new Date(a.starts_at);
            const dayNum = dateObj.toLocaleDateString('ru-RU', { day: 'numeric' });
            const monthStr = dateObj.toLocaleDateString('ru-RU', { month: 'short' });
            const timeStr = dateObj.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            const dateBox = createEl('div', 'flex flex-col items-center justify-center w-14 h-14 bg-bg rounded-lg border border-border shrink-0');
            dateBox.appendChild(createEl('span', 'text-xs font-bold text-secondary uppercase', monthStr));
            dateBox.appendChild(createEl('span', 'text-xl font-black text-white', dayNum));

            const infoBox = createEl('div', 'flex-1 min-w-0');

            const topRow = createEl('div', 'flex justify-between items-start');
            topRow.appendChild(createEl('h4', 'text-white font-bold text-sm truncate', a.services?.name || 'Услуга'));
            topRow.appendChild(createEl('span', `text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${statusColor}`, statusText));

            const metaStr = `${timeStr} • ${a.services?.price} ₸`;
            const metaP = createEl('p', 'text-xs text-primary font-bold mt-0.5', metaStr);

            const petP = createEl('p', 'text-xs text-secondary mt-1 truncate', `🐶 ${a.pet_name}`);

            const footerDiv = createEl('div', 'mt-2 pt-2 border-t border-border/30 flex items-center gap-1 text-xs text-secondary');
            footerDiv.appendChild(createEl('span', 'material-symbols-rounded text-sm', 'store'));
            footerDiv.appendChild(createEl('span', 'truncate', a.masters?.salon_name || 'Салон'));

            infoBox.appendChild(topRow);
            infoBox.appendChild(metaP);
            infoBox.appendChild(petP);
            infoBox.appendChild(footerDiv);

            card.appendChild(dateBox);
            card.appendChild(infoBox);
            list.appendChild(card);
        });

    } catch (e) {
        list.innerHTML = '';
        list.appendChild(createEl('div', 'text-center text-error py-10', 'Ошибка загрузки'));
    }
}

// [UPDATED] Генерация документов с данными мастера
function openLegal(type: 'offer' | 'policy') {
    hide('view-booking');
    show('view-legal');

    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick(closeLegal);

    const titleEl = $('legal-title');
    const contentEl = $('legal-content');

    if(contentEl) contentEl.innerHTML = '';

    // Генерируем данные "на лету", используя загруженный профиль
    const data = type === 'offer' ? getOfferData(loadedProfile) : getPolicyData(loadedProfile);
    const title = type === 'offer' ? 'Публичная оферта' : 'Политика обработки данных';

    if(titleEl) titleEl.textContent = title;

    if(contentEl) {
        data.forEach(section => {
            const h3 = createEl('h3', 'font-bold text-white mb-2 text-base', section.title);
            contentEl.appendChild(h3);

            section.content.forEach(paragraph => {
                const p = createEl('p', 'mb-2 opacity-80', paragraph);
                contentEl.appendChild(p);
            });

            contentEl.appendChild(createEl('div', 'h-4'));
        });
    }
}

function closeLegal() {
    hide('view-legal');
    show('view-booking');

    Telegram.WebApp.BackButton.show();
    Telegram.WebApp.BackButton.onClick((window as any).goBack);
}

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

init();