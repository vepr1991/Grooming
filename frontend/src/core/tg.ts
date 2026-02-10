export const Telegram = (window as any).Telegram;

export function initTelegram() {
    Telegram.WebApp.ready();
    try {
        Telegram.WebApp.expand();
        // Настройка цветов под тему
        const isDark = (Telegram.WebApp.colorScheme === 'dark') ||
                       (!Telegram.WebApp.initData && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');

        const bg = isDark ? '#101a23' : '#f3f4f6';
        if (Telegram.WebApp.setHeaderColor) Telegram.WebApp.setHeaderColor(bg);
        if (Telegram.WebApp.setBackgroundColor) Telegram.WebApp.setBackgroundColor(bg);
    } catch(e) {
        console.warn('Telegram WebApp environment not detected or customization failed.');
    }
}