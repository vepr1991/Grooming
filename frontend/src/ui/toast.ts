import { $ } from '../core/dom';

let toastTimeout: any;
let animationTimeout: any;

export function showToast(msg: string, type: 'success' | 'error' = 'success') {
    const el = $('toast');
    const txt = $('toast-msg');

    // Поддержка обоих вариантов иконок (для Admin и Client)
    const icon = el?.querySelector('.material-symbols-rounded, .material-symbols-outlined');

    if (!el || !txt) {
        console.warn('Toast element not found in DOM (id="toast" or "toast-msg" missing)');
        return;
    }

    // Сбрасываем предыдущие таймеры, чтобы тост не исчез посередине нового показа
    if (toastTimeout) clearTimeout(toastTimeout);
    if (animationTimeout) clearTimeout(animationTimeout);

    // Устанавливаем текст
    txt.textContent = msg;

    // Сбрасываем классы скрытия (показываем элемент)
    el.classList.remove('hidden', 'opacity-0', 'translate-y-[-20px]');

    // Сбрасываем цвета границ
    el.classList.remove('border-primary', 'border-error');

    // Сбрасываем цвета иконки
    if (icon) {
        icon.classList.remove('text-primary', 'text-error', 'text-success'); // text-success добавлен на всякий случай
    }

    // Применяем стили
    if (type === 'error') {
        el.classList.add('border-error');
        if (icon) {
            icon.textContent = 'error';
            icon.classList.add('text-error');
        }
    } else {
        el.classList.add('border-primary');
        if (icon) {
            icon.textContent = 'check_circle';
            icon.classList.add('text-primary');
        }
    }

    // Таймер на исчезновение
    toastTimeout = setTimeout(() => {
        // Анимация ухода вверх и прозрачности
        el.classList.add('opacity-0', 'translate-y-[-20px]');

        // Реальное скрытие (display: none) после завершения анимации
        animationTimeout = setTimeout(() => {
            el.classList.add('hidden');
        }, 300);
    }, 3000);
}