/**
 * UI Skeletons for loading states
 */

// Скелет карточки услуги для Клиента (светлая тема/адаптив)
export function getClientServiceSkeleton(count = 3): string {
    return Array(count).fill(0).map(() => `
        <div class="w-full bg-surface border border-border rounded-xl p-4 mb-3 animate-pulse">
            <div class="flex justify-between items-start">
                <div class="space-y-2 flex-1">
                    <div class="h-5 bg-secondary/20 rounded w-2/3"></div>
                    <div class="h-3 bg-secondary/10 rounded w-1/3"></div>
                </div>
                <div class="h-6 bg-primary/20 rounded w-16"></div>
            </div>
            <div class="mt-4 h-10 bg-primary/10 rounded-xl w-full"></div>
        </div>
    `).join('');
}

// Скелет карточки услуги для Админа (темная тема)
export function getAdminServiceSkeleton(count = 3): string {
    return Array(count).fill(0).map(() => `
        <div class="w-full bg-surface-dark border border-border-dark/50 rounded-xl p-4 mb-3 animate-pulse">
            <div class="flex justify-between items-center">
                <div class="space-y-2 flex-1">
                    <div class="h-5 bg-text-secondary/20 rounded w-1/2"></div>
                    <div class="h-3 bg-text-secondary/10 rounded w-1/3"></div>
                </div>
                <div class="flex gap-2">
                    <div class="w-8 h-8 rounded-full bg-text-secondary/10"></div>
                    <div class="w-8 h-8 rounded-full bg-text-secondary/10"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// Скелет для Графика работы (список дней)
export function getScheduleSkeleton(): string {
    return Array(7).fill(0).map(() => `
        <div class="flex items-center justify-between px-4 py-4 border-b border-border-dark/30 animate-pulse min-h-[64px]">
            <div class="flex items-center gap-3 flex-1">
                <div class="w-5 h-5 rounded bg-text-secondary/10"></div>
                <div class="h-4 w-24 bg-text-secondary/20 rounded"></div>
            </div>
            <div class="h-8 w-40 bg-text-secondary/10 rounded-lg"></div>
        </div>
    `).join('');
}

// Скелет карточки Записи (самый сложный)
export function getAppointmentSkeleton(count = 3): string {
    return Array(count).fill(0).map(() => `
        <div class="w-full bg-surface-dark border border-border-dark rounded-2xl p-4 mb-3 animate-pulse">
            <div class="flex justify-between mb-4">
                <div class="flex gap-2 items-center">
                    <div class="w-2 h-2 rounded-full bg-text-secondary/20"></div>
                    <div class="h-3 bg-text-secondary/20 rounded w-12"></div>
                </div>
                <div class="h-4 bg-text-secondary/20 rounded w-20"></div>
            </div>
            <div class="flex gap-4">
                <div class="w-20 h-20 rounded-2xl bg-text-secondary/10 shrink-0"></div>
                <div class="flex-1 space-y-2 py-1">
                    <div class="h-5 bg-text-secondary/20 rounded w-3/4"></div>
                    <div class="h-3 bg-text-secondary/10 rounded w-1/2"></div>
                    <div class="h-3 bg-text-secondary/10 rounded w-2/3"></div>
                </div>
            </div>
            <div class="mt-4 flex gap-2">
                <div class="h-10 bg-text-secondary/10 rounded-xl flex-1"></div>
                <div class="h-10 bg-text-secondary/10 rounded-xl flex-[2]"></div>
            </div>
        </div>
    `).join('');
}