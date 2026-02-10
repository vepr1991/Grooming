import { $, show, hide, getVal, setVal, setText } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { showToast } from '../../ui/toast';
import { showConfirm } from '../../ui/modal';
import { ICONS } from '../../ui/icons';
import { Service } from '../../types';

let editingId: number | null = null;
let parsedServices: any[] = [];

// Хелпер для быстрого создания элементов (чтобы код был чище)
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

export async function loadServices() {
    const list = $('services-list');
    if (!list) return;

    // Очистка и скелетон (безопасный способ)
    list.innerHTML = '';
    const loading = createEl('div', 'text-center text-text-secondary p-4 animate-pulse', 'Загрузка...');
    list.appendChild(loading);

    try {
        const [services, master] = await Promise.all([
            apiFetch<Service[]>('/me/services'),
            apiFetch<any>('/me')
        ]);

        list.innerHTML = ''; // Очищаем скелетон

        if (services.length === 0) {
            const emptyState = createEl('div', 'text-center text-text-secondary p-4 opacity-50', 'Список услуг пуст');
            list.appendChild(emptyState);
        } else {
            services.forEach(s => list.appendChild(createServiceCard(s)));
        }

        // Логика лимитов для Pro
        const btnAdd = $('btn-toggle-add-service');
        if (btnAdd) {
            const existingMsg = list.querySelector('.limit-msg');
            if (existingMsg) existingMsg.remove();

            if (!master.is_premium && services.length >= 10) {
                hide(btnAdd);

                const limitContainer = createEl('div', 'limit-msg text-center text-xs text-text-secondary py-2 mt-2');
                const boldPart = createEl('b', '', 'Обновитесь до Pro');

                limitContainer.textContent = 'Лимит услуг достигнут (10/10). ';
                limitContainer.appendChild(document.createElement('br'));
                limitContainer.appendChild(boldPart);
                limitContainer.appendChild(document.createTextNode(', чтобы добавить больше.'));

                list.appendChild(limitContainer);
            } else {
                show(btnAdd);
                btnAdd.style.display = 'flex';
            }
        }

    } catch (e) {
        console.error(e);
        list.innerHTML = '';
        list.appendChild(createEl('div', 'text-center text-error p-4', 'Ошибка загрузки'));
    }
}

// Полностью безопасная функция создания карточки через DOM API
function createServiceCard(s: Service): HTMLElement {
    // 1. Контейнер
    const card = createEl('div', 'w-full bg-surface-dark border border-border-dark/50 rounded-xl overflow-hidden transition-all mb-3');
    const hasDesc = !!s.description;

    // 2. Верхняя часть (Header)
    const headerRow = createEl('div', `p-4 flex justify-between items-center transition-colors min-h-[72px] header-row`);
    if (hasDesc) {
        headerRow.classList.add('cursor-pointer', 'hover:bg-black/5');
    }

    // --- Левая колонка (Инфо) ---
    const infoCol = createEl('div', 'flex flex-col gap-1 flex-1 min-w-0');

    // Имя и иконка
    const nameBlock = createEl('span', 'text-white font-bold text-base leading-tight break-words');
    const iconSpan = createEl('span', 'mr-1', s.category === 'cat' ? '🐱' : '🐶');
    const nameText = document.createTextNode(` ${s.name}`); // Безопасная вставка текста
    nameBlock.appendChild(iconSpan);
    nameBlock.appendChild(nameText);

    // Цена и длительность
    const metaBlock = createEl('span', 'text-primary text-sm font-bold', `${s.price} ₸ • ${s.duration_min} мин`);

    infoCol.appendChild(nameBlock);
    infoCol.appendChild(metaBlock);

    // --- Правая колонка (Кнопки) ---
    const actionsCol = createEl('div', 'flex items-center gap-1 shrink-0 ml-3 actions');

    // Кнопка Edit
    const editBtn = createEl('button', 'edit-btn text-text-secondary/40 hover:text-primary p-2 rounded-full hover:bg-black/5 transition-colors z-20');
    editBtn.innerHTML = ICONS.Edit; // ICONS - это доверенный SVG из файла, это безопасно
    editBtn.onclick = (e) => {
        e.stopPropagation();
        openForm(s);
    };

    // Кнопка Delete
    const delBtn = createEl('button', 'del-btn text-text-secondary/40 hover:text-error p-2 rounded-full hover:bg-black/5 transition-colors z-20');
    delBtn.innerHTML = ICONS.Delete; // SVG
    delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (await showConfirm('Удалить услугу?')) deleteService(s.id);
    };

    actionsCol.appendChild(editBtn);
    actionsCol.appendChild(delBtn);

    // Шеврон (стрелочка)
    let chevron: HTMLElement | null = null;
    let bodyContent: HTMLElement | null = null;

    if (hasDesc) {
        const chevronWrapper = createEl('div', 'p-1 text-text-secondary/50 chevron');
        chevron = createEl('span', 'material-symbols-outlined transition-transform duration-200 block', 'expand_more');
        chevronWrapper.appendChild(chevron);
        actionsCol.appendChild(chevronWrapper);
    }

    headerRow.appendChild(infoCol);
    headerRow.appendChild(actionsCol);
    card.appendChild(headerRow);

    // 3. Выпадающее описание (Body)
    if (hasDesc) {
        bodyContent = createEl('div', 'body-content hidden px-4 pb-4 pt-3 text-sm text-text-secondary/80 border-t border-border-dark/30 bg-black/5 break-words whitespace-normal w-full leading-relaxed');
        bodyContent.textContent = s.description!; // Вставляем описание безопасно как текст

        card.appendChild(bodyContent);

        // Клик по хедеру раскрывает описание
        headerRow.onclick = () => {
            const isHidden = bodyContent!.classList.toggle('hidden');
            if (chevron) {
                chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        };
    }

    return card;
}

function openForm(s?: Service) {
    const form = $('add-service-form');
    const btnAdd = $('btn-toggle-add-service');
    if (!form) return;

    form.classList.remove('hidden');
    form.classList.add('flex');
    if (btnAdd) hide(btnAdd);

    editingId = s?.id || null;
    const saveBtn = $('btn-save-service');
    if (saveBtn) saveBtn.textContent = s ? 'Сохранить изменения' : 'Создать';

    setVal('new-srv-name', s?.name || '');
    setVal('new-srv-desc', s?.description || '');
    setVal('new-srv-price', s?.price?.toString() || '');
    setVal('new-srv-dur', s?.duration_min?.toString() || '60');

    const catVal = s?.category || 'dog';
    const radio = document.querySelector(`input[name="srv-cat"][value="${catVal}"]`) as HTMLInputElement;
    if (radio) radio.checked = true;

    $('new-srv-name')?.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteService(id: number) {
    try {
        await apiFetch(`/me/services/${id}`, { method: 'DELETE' });
        showToast('Услуга удалена');
        loadServices();
    } catch {
        showToast('Ошибка удаления', 'error');
    }
}

export function initServiceHandlers() {
    $('btn-toggle-add-service')!.onclick = () => openForm();

    $('btn-cancel-service')!.onclick = () => {
        const form = $('add-service-form');
        form?.classList.add('hidden');
        form?.classList.remove('flex');

        const btnAdd = $('btn-toggle-add-service');
        if (btnAdd) {
            show(btnAdd);
            btnAdd.style.display = 'flex';
        }
        editingId = null;
    };

    $('btn-save-service')!.onclick = async (e) => {
        const name = getVal('new-srv-name');
        const price = getVal('new-srv-price');

        if (!name || !price) return showToast('Название и цена обязательны', 'error');

        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;

        try {
            const catInputs = document.querySelectorAll('input[name="srv-cat"]');
            let category = 'dog';
            catInputs.forEach((inp: any) => { if (inp.checked) category = inp.value; });

            const payload = {
                name,
                description: getVal('new-srv-desc'),
                price: parseFloat(price),
                duration_min: parseInt(getVal('new-srv-dur')) || 60,
                category
            };

            if (editingId) {
                await apiFetch(`/me/services/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
                showToast('Обновлено');
            } else {
                await apiFetch('/me/services', { method: 'POST', body: JSON.stringify(payload) });
                showToast('Создано');
            }

            loadServices();
            $('btn-cancel-service')?.click();
        } catch {
            showToast('Ошибка сохранения', 'error');
        }
        btn.disabled = false;
    };

    // --- Логика Импорта (тоже переведена на DOM) ---

    (window as any).openImport = () => {
        const modal = $('import-modal');
        if(modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
            (window as any).resetImport();
        }
    };

    (window as any).closeImport = () => {
        const modal = $('import-modal');
        if(modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    };

    (window as any).resetImport = () => {
        hide('import-step-2');
        show('import-step-1');
        setVal('import-text', '');
        setText('import-count', '0');
        parsedServices = [];
        const list = $('import-preview-list');
        if(list) list.innerHTML = '';
    };

    (window as any).removeImportItem = (idx: number) => {
        parsedServices.splice(idx, 1);
        if (parsedServices.length === 0) {
            (window as any).resetImport();
        } else {
            setText('import-count', parsedServices.length.toString());
            showToast('Элемент удален', 'success');
            // Перерисовываем список (можно оптимизировать удаление конкретного элемента DOM, но для списка импорта так проще)
            const list = $('import-preview-list');
            if(list) list.innerHTML = ''; // Очистка перед перерисовкой
            renderImportPreview();
        }
    };

    // Новая функция рендера превью (без innerHTML для данных)
    function renderImportPreview() {
        const list = $('import-preview-list');
        if(!list) return;
        list.innerHTML = '';

        parsedServices.forEach((s, idx) => {
            const item = createEl('div', 'flex justify-between items-center bg-background-dark p-2 rounded-lg border border-border-dark/50 text-xs');

            const nameSpan = createEl('span', 'text-white font-medium truncate flex-1', s.name);
            const priceSpan = createEl('span', 'text-primary font-bold ml-2', `${s.price} ₸`);

            const delBtn = createEl('button', 'ml-2 text-error');
            const icon = createEl('span', 'material-symbols-outlined text-sm', 'close');
            delBtn.appendChild(icon);

            delBtn.onclick = () => (window as any).removeImportItem(idx);

            item.appendChild(nameSpan);
            item.appendChild(priceSpan);
            item.appendChild(delBtn);
            list.appendChild(item);
        });
    }

    $('btn-parse')?.addEventListener('click', () => {
        const text = getVal('import-text');
        const catSelect = $('import-cat') as HTMLSelectElement;
        const cat = (catSelect?.value || 'dog') as 'dog' | 'cat';

        if(!text.trim()) return showToast('Введите текст', 'error');

        parsedServices = parseServicesText(text, cat);

        if(parsedServices.length === 0) return showToast('Не удалось распознать услуги', 'error');

        renderImportPreview(); // Используем безопасный рендер

        setText('import-count', parsedServices.length.toString());
        hide('import-step-1');
        show('import-step-2');
    });

    $('btn-save-import')?.addEventListener('click', async (e) => {
        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;
        btn.innerText = 'Сохраняем...';

        try {
            await apiFetch('/me/services/bulk', {
                method: 'POST',
                body: JSON.stringify(parsedServices)
            });
            showToast(`Успешно добавлено: ${parsedServices.length}`);
            (window as any).closeImport();
            loadServices();
        } catch (err) {
            showToast('Ошибка при сохранении.', 'error');
        }
        btn.disabled = false;
        btn.innerText = 'Сохранить';
    });
}

function parseServicesText(text: string, defaultCategory: 'dog' | 'cat'): any[] {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const result = [];

    for (const line of lines) {
        const match = line.match(/^(.+?)\s*[-–—:]?\s*(\d+)\s*(?:тг|р|rub|kzt)?$/i);
        if (match) {
            const name = match[1].trim().replace(/[-–—]$/, '').trim();
            const price = parseFloat(match[2]);
            if (name && price) {
                result.push({
                    name: name,
                    price: price,
                    duration_min: 60,
                    category: defaultCategory,
                    description: ''
                });
            }
        }
    }
    return result;
}