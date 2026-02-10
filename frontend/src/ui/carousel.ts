import { $ } from '../core/dom';
import { BASE_URL } from '../core/api'; 
import { Telegram } from '../core/tg';
// Если у вас есть иконки в ICONS, можно импортировать их, но здесь оставим SVG строками для простоты,
// так как они константны и безопасны.

// Хелпер для создания элементов
function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}

export function renderCarousel(
    trackId: string,
    indicatorsId: string,
    photos: string[],
    isEditMode = false,
    onAddClick?: () => void,
    onRemoveClick?: (index: number) => void
) {
    const track = $(trackId);
    const indicators = $(indicatorsId);
    if (!track) return;

    // Очистка безопасна
    track.innerHTML = '';

    if (photos.length === 0 && !isEditMode) {
        // Пустое состояние
        const emptySlide = createEl('div', 'flex-shrink-0 w-full h-full snap-center bg-surface-dark flex flex-col items-center justify-center text-text-secondary/50');

        const icon = createEl('span', 'material-symbols-outlined text-4xl mb-2 opacity-50');
        icon.textContent = 'image_not_supported';

        const text = createEl('span', 'text-xs');
        text.textContent = 'Нет фотографий';

        emptySlide.appendChild(icon);
        emptySlide.appendChild(text);
        track.appendChild(emptySlide);
    }

    photos.forEach((photo, index) => {
        const slide = createEl('div', 'flex-shrink-0 w-full h-full snap-center relative group flex items-center justify-center bg-black/20');

        // БЕЗОПАСНАЯ вставка изображения
        const img = createEl('img', 'w-full h-full object-contain');
        img.src = photo; // Присваивание свойства src безопасно
        img.alt = `Фото салона ${index + 1}`;

        // Затемнение при наведении
        const overlay = createEl('div', 'absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors');

        slide.appendChild(img);
        slide.appendChild(overlay);

        // Кнопка удаления
        if (isEditMode && onRemoveClick) {
            const delBtn = createEl('button', 'absolute top-4 right-4 p-2 bg-black/60 rounded-full text-white backdrop-blur-sm hover:bg-red-500/80 transition-all z-10');
            // SVG константа — это безопасно для innerHTML
            delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
            delBtn.onclick = (e) => {
                e.stopPropagation();
                onRemoveClick(index);
            };
            slide.appendChild(delBtn);
        }
        track.appendChild(slide);
    });

    // Кнопка "Добавить"
    if (isEditMode && photos.length < 10 && onAddClick) { // Лимит проверяем и тут визуально
        const addSlide = createEl('div', 'flex-shrink-0 w-full h-full snap-center bg-surface-dark flex items-center justify-center cursor-pointer hover:brightness-110 transition-colors border-2 border-dashed border-primary/30');
        addSlide.onclick = onAddClick;

        const container = createEl('div', 'flex flex-col items-center gap-2 text-primary');
        const iconCircle = createEl('div', 'w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center');
        iconCircle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;

        const label = createEl('span', 'text-sm font-medium');
        label.textContent = 'Добавить';

        container.appendChild(iconCircle);
        container.appendChild(label);
        addSlide.appendChild(container);

        track.appendChild(addSlide);
    }

    renderIndicators(indicators, photos.length + (isEditMode && photos.length < 10 && onAddClick ? 1 : 0), 0);

    // Обработчик скролла для индикаторов
    track.onscroll = () => {
        const index = Math.round(track.scrollLeft / track.clientWidth);
        renderIndicators(indicators, indicators?.children.length || 0, index);
    }
}

function renderIndicators(container: HTMLElement | null, count: number, activeIndex: number) {
    if (!container) return;
    container.innerHTML = '';
    if (count <= 1) return;

    for (let i = 0; i < count; i++) {
        const dot = createEl('div', `h-1.5 rounded-full transition-all duration-300 ${i === activeIndex ? 'bg-primary w-3' : 'bg-text-secondary/30 w-1.5'}`);
        container.appendChild(dot);
    }
}

export async function uploadPhoto(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    // Используем fetch напрямую, т.к. apiFetch выставляет Content-Type: application/json,
    // а для FormData браузер должен сам выставить boundary.
    const response = await fetch(`${BASE_URL}/me/upload-photo`, {
        method: 'POST',
        headers: {
            'X-Tg-Init-Data': Telegram.WebApp.initData || ''
            // Content-Type НЕ ставим
        },
        body: formData
    });

    if (!response.ok) {
        let errDetail = 'Upload failed';
        try {
            const err = await response.json();
            errDetail = err.detail || errDetail;
        } catch {}
        throw new Error(errDetail);
    }

    const res = await response.json();
    return res.url;
}