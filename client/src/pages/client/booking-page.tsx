import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, addMinutes, isWithinInterval, areIntervalsOverlapping } from "date-fns"; // Добавили функции date-fns
import { ru } from "date-fns/locale";
import { Check, User, Phone, PawPrint } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Salon = {
  id: string;
  name: string;
  address: string;
  phone: string;
  work_start?: string;
  work_end?: string;
};

type Service = { id: string; title: string; price: number; duration_minutes: number };

// Тип для занятого интервала
type BusySlot = {
  start: Date;
  end: Date;
};

export function ClientBookingPage() {
  const { salonId } = useParams();
  const [step, setStep] = useState(1);
  const [salon, setSalon] = useState<Salon | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | null>(null);

  // Храним не просто строки, а интервалы занятости
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);

  const [clientData, setClientData] = useState({ name: "", phone: "", petName: "", petBreed: "" });

  // 1. Исходная загрузка
  useEffect(() => {
    if (!salonId) return;

    async function fetchData() {
      const salonRes = await supabase.from('salons').select('*').eq('id', salonId).single();
      if (salonRes.data) setSalon(salonRes.data);

      const servicesRes = await supabase.from('services').select('*');
      if (servicesRes.data) setServices(servicesRes.data);
    }
    fetchData();
  }, [salonId]);

  // 2. Загрузка занятых интервалов
  useEffect(() => {
    if (!salonId || !date) return;

    async function fetchBusySlots() {
      const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

      // Нам нужно знать, когда заканчивается предыдущая запись
      // Supabase не умеет джойнить сложно, поэтому возьмем start_time и service_id
      // В идеале в таблице appointments хранить end_time. Мы это делали?
      // Да! У нас есть end_time в таблице appointments. Супер.

      const { data } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('salon_id', salonId)
        .neq('status', 'canceled')
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString());

      if (data) {
        const slots = data.map(app => ({
          start: new Date(app.start_time),
          end: new Date(app.end_time)
        }));
        setBusySlots(slots);
      }
    }

    fetchBusySlots();
    setTime(null);
  }, [date, salonId]);

  // 3. Генерация слотов с проверкой пересечений
  const generateTimeSlots = () => {
    if (!salon || !date) return [];

    const slots = [];
    const [startHour, startMinute] = (salon.work_start || "10:00").split(":").map(Number);
    const [endHour, endMinute] = (salon.work_end || "20:00").split(":").map(Number);

    // Начало рабочего дня (дата выбранная пользователем + часы работы)
    let currentSlot = new Date(date);
    currentSlot.setHours(startHour, startMinute, 0, 0);

    // Конец рабочего дня
    const endWorkDay = new Date(date);
    endWorkDay.setHours(endHour, endMinute, 0, 0);

    const stepMinutes = 30; // Шаг сетки
    const serviceDuration = selectedService ? selectedService.duration_minutes : 60;

    while (currentSlot < endWorkDay) {
      // Рассчитываем, когда закончится услуга, если начать её СЕЙЧАС
      const potentialEnd = addMinutes(currentSlot, serviceDuration);

      // 1. Проверяем: успеем ли до закрытия?
      if (potentialEnd <= endWorkDay) {

        // 2. Проверяем: не пересекается ли с другими записями?
        const isOverlapping = busySlots.some(busy => {
          return areIntervalsOverlapping(
            { start: currentSlot, end: potentialEnd },
            { start: busy.start, end: busy.end }
          );
        });

        const timeString = currentSlot.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        slots.push({
          time: timeString,
          disabled: isOverlapping // Блокируем, если занято
        });
      }

      currentSlot = addMinutes(currentSlot, stepMinutes);
    }

    return slots;
  };

  const timeSlots = generateTimeSlots();

  // 4. Отправка
  const handleSubmit = async () => {
    if (!selectedService || !date || !time || !salonId) return;

    const startDateTime = new Date(date);
    const [hours, minutes] = time.split(':');
    startDateTime.setHours(Number(hours), Number(minutes));

    // Рассчитываем конец услуги для базы данных
    const endDateTime = addMinutes(startDateTime, selectedService.duration_minutes);

    const { error } = await supabase.from('appointments').insert([
      {
        salon_id: salonId,
        service_id: selectedService.id,
        client_name: clientData.name,
        client_phone: clientData.phone,
        pet_name: clientData.petName,
        pet_breed: clientData.petBreed,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(), // <--- Теперь сохраняем реальный конец!
        status: 'pending'
      }
    ]);

    if (error) {
      alert("Ошибка: " + error.message);
    } else {
      try {
        await fetch("http://localhost:8000/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salon_id: salonId,
            client_name: clientData.name,
            client_phone: clientData.phone,
            pet_name: clientData.petName,
            date: date.toLocaleDateString('ru-RU'),
            time: time,
            service_title: selectedService.title
          })
        });
      } catch (err) {
        console.error("Ошибка уведомления:", err);
      }
      setStep(4);
    }
  };

  if (!salon) return <div className="p-10 text-center">Загрузка салона...</div>;

  return (
    <div className="min-h-screen bg-white pb-10">
      <div className="bg-zinc-900 text-white p-6 rounded-b-3xl shadow-xl">
        <h1 className="text-2xl font-bold">{salon.name}</h1>
        <p className="text-zinc-400 text-sm mt-1">{salon.address}</p>
        <p className="text-zinc-500 text-xs mt-1">{salon.phone}</p>
      </div>

      <div className="p-4 space-y-6">

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Выберите услугу</h2>
            <div className="grid gap-3">
              {services.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:border-black transition-all"
                  onClick={() => { setSelectedService(s); setStep(2); }}
                >
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold">{s.title}</h3>
                      <p className="text-sm text-gray-500">{s.duration_minutes} мин</p>
                    </div>
                    <div className="font-bold bg-zinc-100 px-3 py-1 rounded-full">{s.price} ₸</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <Button variant="outline" onClick={() => setStep(1)}>← Назад</Button>
            <h2 className="text-xl font-bold">Выберите время</h2>

            <div className="flex justify-center border rounded-lg p-4 bg-zinc-50">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                locale={ru}
                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map((slot, index) => (
                <Button
                  key={index}
                  variant={time === slot.time ? "default" : "outline"}
                  onClick={() => setTime(slot.time)}
                  disabled={slot.disabled} // <--- Теперь умная блокировка
                  className={`w-full ${slot.disabled ? "opacity-30 bg-gray-100 decoration-slice line-through" : ""}`}
                >
                  {slot.time}
                </Button>
              ))}
            </div>

            <Button className="w-full mt-4" disabled={!time || !date} onClick={() => setStep(3)}>
              Продолжить
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => setStep(2)}>← Назад</Button>
            <h2 className="text-xl font-bold">Ваши данные</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Ваше имя</Label>
                <div className="relative">
                   <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                   <Input className="pl-9" placeholder="Иван" value={clientData.name} onChange={e => setClientData({...clientData, name: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Телефон</Label>
                <div className="relative">
                   <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                   <Input className="pl-9" placeholder="+7 700..." value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Кличка питомца</Label>
                <div className="relative">
                   <PawPrint className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                   <Input className="pl-9" placeholder="Барсик" value={clientData.petName} onChange={e => setClientData({...clientData, petName: e.target.value})} />
                </div>
              </div>
               <div className="space-y-1">
                <Label>Порода (не обязательно)</Label>
                <Input placeholder="Корги" value={clientData.petBreed} onChange={e => setClientData({...clientData, petBreed: e.target.value})} />
              </div>
            </div>
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-lg" onClick={handleSubmit}>
              Записаться
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-10 space-y-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">Вы записаны!</h2>
            <p className="text-gray-500">
              Ждем вас и {clientData.petName} в {time} <br/>
              {date ? format(date, 'd MMMM', { locale: ru }) : ''}
            </p>
             <p className="text-xs text-gray-400">Вам перезвонят для подтверждения</p>
          </div>
        )}

      </div>
    </div>
  );
}