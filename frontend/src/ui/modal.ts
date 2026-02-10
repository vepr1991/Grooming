import { $, setText } from '../core/dom';

export function showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        const modal = $('custom-confirm');
        if (!modal) return resolve(false);

        setText('confirm-text', message);
        modal.classList.remove('hidden');

        // Анимация входа
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            const box = $('confirm-box', modal);
            box?.classList.remove('scale-95');
            box?.classList.add('scale-100');
        }, 10);

        const close = (res: boolean) => {
            modal.classList.add('opacity-0');
            const box = $('confirm-box', modal);
            box?.classList.remove('scale-100');
            box?.classList.add('scale-95');

            setTimeout(() => {
                modal.classList.add('hidden');
                resolve(res);
            }, 200);
        };

        const okBtn = $('confirm-btn-ok');
        const cancelBtn = $('confirm-btn-cancel');

        // Используем onclick, чтобы перезаписать старый обработчик (избегаем дублей)
        if (okBtn) okBtn.onclick = () => close(true);
        if (cancelBtn) cancelBtn.onclick = () => close(false);
    });
}