import axios from 'axios';

const API_URL = 'https://grooming-tma.onrender.com';

export const api = axios.create({
  baseURL: API_URL,
});

// Функция для получения списка услуг мастера
export const getServices = async (masterId: string) => {
  const response = await api.get(`/client/masters/${masterId}/services`);
  return response.data;
};

// Получение свободных слотов на конкретную дату
export const getAvailability = async (masterId: string, serviceId: number, date: string) => {
  const response = await api.get(`/client/masters/${masterId}/availability`, {
    params: { service_id: serviceId, date }
  });
  return response.data; // Придет массив строк типа ["2026-02-15T10:00:00+05:00", ...]
};