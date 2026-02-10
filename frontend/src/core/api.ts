import { Telegram } from './tg';

const ENV_API_URL = import.meta.env.VITE_API_URL;
export const BASE_URL = ENV_API_URL ? ENV_API_URL.replace(/\/$/, '') : '/api';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
        'Content-Type': 'application/json',
        'X-Tg-Init-Data': Telegram.WebApp.initData || '',
        ...(options.headers || {}),
    };

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(err.detail || 'Network error');
        }
        return response.json();
    } catch (e) {
        console.error(`API Error [${endpoint}]:`, e);
        throw e;
    }
}