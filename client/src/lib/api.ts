// client/src/lib/api.ts

// 👇 URL ТВОЕГО БЕКЕНДА
const BASE_URL = "https://grooming-tma.onrender.com";

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  message?: string;
  detail?: string;
};

// Функция для получения "паспорта" Телеграм
function getTelegramInitData() {
  // @ts-ignore
  return window.Telegram?.WebApp?.initData || "";
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  // Добавляем заголовок авторизации автоматически
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getTelegramInitData(), // 👈 ОТПРАВЛЯЕМ "ПАСПОРТ"
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 204) return {} as T;

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || data.message || 'Ошибка сервера');
  }

  return data;
}

// === API МЕТОДЫ ===

export const api = {
  // 🟢 Регистрация
  registerSalon: (payload: any) =>
    request<{ success: boolean; data: any }>('/api/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 🟢 Салон
  updateSalon: (id: string, payload: any) =>
    request<{ success: boolean; data: any }>(`/api/salons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  // 🟢 Услуги
  createService: (payload: any) =>
    request<{ success: boolean; data: any }>('/api/services', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateService: (id: string, payload: any) =>
    request<{ success: boolean; data: any }>(`/api/services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  deleteService: (id: string) =>
    request<{ success: boolean }>((`/api/services/${id}`), {
      method: 'DELETE'
    }),

  // 🟢 Бронирование
  createBooking: (payload: any) =>
    request<{ success: boolean; id: string }>('/api/book', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 🟢 Записи
  updateAppointmentStatus: (id: string, status: string) =>
    request<{ success: boolean; data: any }>(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
};