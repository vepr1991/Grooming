import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

// Типы (можно вынести в types.ts)
export type Salon = {
  id: string;
  name: string;
  address: string;
  phone: string;
  photo_url: string;
  description: string;
  schedule: any[];
  gallery: string[];
  slot_step: number;
};

export type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
  image_url: string;
  description?: string;
  salon_id: string;
};

// 1. Получение данных о салоне
export function useSalon(salonId: string | undefined) {
  return useQuery({
    queryKey: ['salon', salonId],
    queryFn: async () => {
      if (!salonId) return null;
      const { data, error } = await supabase.from('salons').select('*').eq('id', salonId).single();
      if (error) throw error;

      // Парсим JSON поля, если они пришли строкой (защита от багов Supabase)
      let gallery = data.gallery;
      if (typeof gallery === 'string') {
          try { gallery = JSON.parse(gallery); } catch (e) { gallery = []; }
      }

      let schedule = data.schedule;
      if (typeof schedule === 'string') {
          try { schedule = JSON.parse(schedule); } catch (e) { schedule = []; }
      }

      return { ...data, gallery, schedule } as Salon;
    },
    enabled: !!salonId, // Запрос не пойдет, пока нет ID
  });
}

// 2. Получение услуг салона
export function useServices(salonId: string | undefined) {
  return useQuery({
    queryKey: ['services', salonId],
    queryFn: async () => {
      if (!salonId) return [];
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('salon_id', salonId)
        .eq('is_active', true);

      if (error) throw error;
      return data as Service[];
    },
    enabled: !!salonId,
  });
}

// 3. Получение занятых слотов
export function useBusySlots(salonId: string | undefined, date: Date) {
    return useQuery({
        queryKey: ['slots', salonId, date.toISOString().split('T')[0]], // Ключ меняется при смене даты
        queryFn: async () => {
            if (!salonId) return [];

            const start = new Date(date); start.setHours(0, 0, 0, 0);
            const end = new Date(date); end.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('appointments')
                .select('start_time, end_time')
                .eq('salon_id', salonId)
                .neq('status', 'canceled')
                .lte('start_time', end.toISOString())
                .gte('end_time', start.toISOString());

            if (error) throw error;
            return data || [];
        },
        enabled: !!salonId,
    });
}

// 4. Мутация создания записи
export function useCreateBooking() {
    return useMutation({
        mutationFn: async (payload: any) => {
            return await api.createBooking(payload);
        }
    });
}