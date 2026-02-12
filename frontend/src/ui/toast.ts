import { $ } from '../core/dom';

let toastTimeout: any;
let animationTimeout: any;

export function showToast(msg: string, type: 'success' | 'error' = 'success') {
    const el = $('toast');
    const txt = $('toast-msg');

    // Поддержка обоих вариантов иконок (для Admin и Client)
    const icon = el?.querySelector('.material-symbols-rounded, .material-symbols-outlined');

    if (!el || !txt) {
        console.warn('Toast element not found in DOM');
        return;
    }

    // Сброс таймеров
    if (toastTimeout) clearTimeout(toastTimeout);
    if (animationTimeout) clearTimeout(animationTimeout);

    // Устанавливаем текст
    txt.textContent = msg;

    // Сначала убеждаемся, что элемент видим (display), но прозрачен
    el.classList.remove('hidden');

    // Форсируем перерисовку браузера (hack), чтобы анимация сработала плавно
    void el.offsetWidth;

    // Показываем: убираем прозрачность и сдвиг
    el.classList.remove('opacity-0', 'translate-y-[-20px]');

    // Сброс стилей границ и иконок
    el.classList.remove('border-primary', 'border-error');
    if (icon) {
        icon.classList.remove('text-primary', 'text-error', 'text-success');
    }

    // Применяем стили типа
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

    // Таймер скрытия
    toastTimeout = setTimeout(() => {
        // Уходим вверх и становимся прозрачными
        el.classList.add('opacity-0', 'translate-y-[-20px]');

        // После анимации (300мс) скрываем display
        animationTimeout = setTimeout(() => {
            el.classList.add('hidden');
        }, 300);
    }, 3000);
}