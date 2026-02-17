// client/src/lib/api.ts

// 👇 URL ТВОЕГО БЕКЕНДА
// Если работаешь локально, можешь поменять на http://localhost:8000
const BASE_URL = "https://grooming-tma.onrender.com";

// Типы ответов
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  message?: string;
  detail?: string; // Ошибки от FastAPI
};

// Универсальная функция запроса
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  // Если сервер вернул 204 (No Content), считаем успехом
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

  // 🟢 Салон (Профиль)
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

  // 🟢 Бронирование (Клиент)
  createBooking: (payload: any) =>
    request<{ success: boolean; id: string }>('/api/book', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // 🟢 Записи (Мастер)
  updateAppointmentStatus: (id: string, status: string) =>
    request<{ success: boolean; data: any }>(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
};