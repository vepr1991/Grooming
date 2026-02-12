import { Telegram } from './tg';

const ENV_API_URL = import.meta.env.VITE_API_URL;
// Убираем слэш в конце, если он есть
export const BASE_URL = ENV_API_URL ? ENV_API_URL.replace(/\/$/, '') : '/api';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Получаем строку инициализации от Telegram
    const initData = Telegram.WebApp.initData || '';

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        // [ИСПРАВЛЕНИЕ] Отправляем данные в заголовке Authorization с префиксом tma
        'Authorization': `tma ${initData}`,
        ...(options.headers || {}),
    };

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            // Пытаемся достать текст ошибки из JSON ответа
            let errorDetail = `Error ${response.status}`;
            try {
                const errJson = await response.json();
                if (errJson.detail) errorDetail = errJson.detail;
            } catch (e) {
                // Если ответ не JSON, оставляем дефолтную ошибку
            }
            throw new Error(errorDetail);
        }

        // Обработка пустых ответов (например, 204 No Content)
        if (response.status === 204) return {} as T;

        return response.json();
    } catch (e) {
        console.error(`API Error [${endpoint}]:`, e);
        throw e;
    }
}