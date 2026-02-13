import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, User, Phone, PawPrint } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Salon = { id: string; name: string; address: string; phone: string };
type Service = { id: string; title: string; price: number; duration_minutes: number };

export function ClientBookingPage() {
  const { salonId } = useParams();
  const [step, setStep] = useState(1);
  const [salon, setSalon] = useState<Salon | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string | null>(null);

  const [clientData, setClientData] = useState({ name: "", phone: "", petName: "", petBreed: "" });

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

  const timeSlots = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

  const handleSubmit = async () => {
    // ВАЖНО: Добавлена проверка salonId, чтобы убрать ошибку типов
    if (!selectedService || !date || !time || !salonId) return;

    const startDateTime = new Date(date);
    const [hours, minutes] = time.split(':');
    startDateTime.setHours(Number(hours), Number(minutes));

    const { error } = await supabase.from('appointments').insert([
      {
        salon_id: salonId,
        service_id: selectedService.id,
        client_name: clientData.name,
        client_phone: clientData.phone,
        pet_name: clientData.petName,
        pet_breed: clientData.petBreed,
        start_time: startDateTime.toISOString(),
        end_time: startDateTime.toISOString(),
        status: 'pending'
      }
    ]);

    if (error) {
      alert("Ошибка: " + error.message);
    } else {
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

        {/* ШАГ 1: УСЛУГА */}
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
                    <div className="font-bold bg-zinc-100 px-3 py-1 rounded-full">
                      {s.price} ₸
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ШАГ 2: ДАТА И ВРЕМЯ */}
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
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map((slot) => (
                <Button
                  key={slot}
                  variant={time === slot ? "default" : "outline"}
                  onClick={() => setTime(slot)}
                  className="w-full"
                >
                  {slot}
                </Button>
              ))}
            </div>

            <Button
              className="w-full mt-4"
              disabled={!time || !date}
              onClick={() => setStep(3)}
            >
              Продолжить
            </Button>
          </div>
        )}

        {/* ШАГ 3: КОНТАКТЫ */}
        {step === 3 && (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => setStep(2)}>← Назад</Button>
            <h2 className="text-xl font-bold">Ваши данные</h2>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Ваше имя</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Иван"
                    value={clientData.name}
                    onChange={e => setClientData({...clientData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Телефон</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="+7 700 000 00 00"
                    value={clientData.phone}
                    onChange={e => setClientData({...clientData, phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Кличка питомца</Label>
                <div className="relative">
                  <PawPrint className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Барсик"
                    value={clientData.petName}
                    onChange={e => setClientData({...clientData, petName: e.target.value})}
                  />
                </div>
              </div>

               <div className="space-y-1">
                <Label>Порода (не обязательно)</Label>
                <Input
                  placeholder="Корги"
                  value={clientData.petBreed}
                  onChange={e => setClientData({...clientData, petBreed: e.target.value})}
                />
              </div>
            </div>

            <Button className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-lg" onClick={handleSubmit}>
              Записаться
            </Button>
          </div>
        )}

        {/* ШАГ 4: УСПЕХ */}
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
            <Button variant="outline" onClick={() => window.location.reload()}>
              На главную
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}