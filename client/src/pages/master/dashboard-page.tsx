import { useEffect, useState } from "react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarCheck, Check, X, Phone } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Тип данных (включая вложенную услугу)
type Appointment = {
  id: string;
  client_name: string;
  client_phone: string;
  pet_name: string;
  start_time: string;
  status: 'pending' | 'confirmed' | 'canceled' | 'completed';
  services: {
    title: string;
    price: number;
  } | null;
};

export function MasterDashboardPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Загрузка записей
  const fetchAppointments = async () => {
    setLoading(true);
    // Берем записи + данные об услуге
    const { data, error } = await supabase
      .from('appointments')
      .select('*, services(title, price)')
      .order('start_time', { ascending: true }); // Сначала ближайшие

    if (error) {
      console.error("Ошибка:", error);
    } else {
      // @ts-ignore (Supabase иногда сложно типизирует join-ы)
      setAppointments(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  // 2. Смена статуса (Подтвердить / Отменить)
  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', id);

    if (!error) {
      // Обновляем локально, чтобы не грузить заново
      setAppointments(prev =>
        prev.map(app => app.id === id ? { ...app, status: newStatus as any } : app)
      );
    }
  };

  // Форматирование даты
  const formatDate = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) return `Сегодня, ${format(date, 'HH:mm')}`;
    if (isTomorrow(date)) return `Завтра, ${format(date, 'HH:mm')}`;
    return format(date, 'd MMM, HH:mm', { locale: ru });
  };

  if (loading) return <div className="p-10 text-center">Загрузка записей...</div>;

  return (
    <div className="p-4 pb-24 space-y-6 bg-zinc-50 min-h-screen">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <CalendarCheck className="h-6 w-6" /> Записи
      </h1>

      {/* Блок 1: ОЖИДАЮТ ПОДТВЕРЖДЕНИЯ */}
      {appointments.some(a => a.status === 'pending') && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-orange-600 uppercase tracking-wide">Новые заявки</h2>
          {appointments
            .filter(a => a.status === 'pending')
            .map((app) => (
              <Card key={app.id} className="border-orange-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-lg">{app.client_name} <span className="text-gray-400 font-normal">и {app.pet_name}</span></h3>
                      <p className="text-sm text-gray-500">{app.services?.title}</p>
                    </div>
                    <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                      {formatDate(app.start_time)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                     <Phone className="h-3 w-3" /> {app.client_phone}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => updateStatus(app.id, 'canceled')}
                    >
                      <X className="h-4 w-4 mr-2" /> Отклонить
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => updateStatus(app.id, 'confirmed')}
                    >
                      <Check className="h-4 w-4 mr-2" /> Принять
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Блок 2: ПРЕДСТОЯЩИЕ */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Актуальные</h2>
        {appointments.filter(a => a.status === 'confirmed').length === 0 ? (
          <p className="text-gray-400 text-sm">Нет подтвержденных записей</p>
        ) : (
          appointments
            .filter(a => a.status === 'confirmed')
            .map((app) => (
              <Card key={app.id} className="border-l-4 border-l-green-500 shadow-sm">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
                        {formatDate(app.start_time)}
                      </Badge>
                    </div>
                    <h3 className="font-bold">{app.pet_name}</h3>
                    <p className="text-xs text-gray-500">{app.services?.title}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{app.services?.price} ₸</div>
                    <a href={`tel:${app.client_phone}`} className="inline-block p-2 bg-zinc-100 rounded-full mt-1">
                      <Phone className="h-4 w-4 text-gray-600" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))
        )}
      </div>

       {/* Блок 3: ИСТОРИЯ (Отмененные/Завершенные) */}
       {/* Можно добавить позже, чтобы не захламлять экран */}

    </div>
  );
}