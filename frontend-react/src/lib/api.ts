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