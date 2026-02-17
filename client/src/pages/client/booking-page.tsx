import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, addDays, isSameDay, isBefore, parse, addMinutes, startOfToday } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft,
  MapPin,
  Clock,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";
import { api } from "@/lib/api";

// --- Types ---
type Step = 'showcase' | 'datetime' | 'details' | 'success';

type Salon = {
  id: string;
  name: string;
  address: string;
  phone: string;
  photo_url: string;
  schedule: any[];
  slot_step: number;
};

type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
  image_url: string;
};

export function ClientBookingPage() {
  const { salonId } = useParams();
  const [step, setStep] = useState<Step>('showcase');
  const [salon, setSalon] = useState<Salon | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [existingAppointments, setExistingAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Booking State
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    petName: '',
    petBreed: '',
    agreed: false
  });

  // 1. Загрузка данных салона
  useEffect(() => {
    async function loadInitialData() {
      if (!salonId) return;
      setLoading(true);
      try {
        const [sRes, svRes] = await Promise.all([
          supabase.from('salons').select('*').eq('id', salonId).single(),
          supabase.from('services').select('*').eq('salon_id', salonId).eq('is_active', true)
        ]);

        if (sRes.data) setSalon(sRes.data);
        if (svRes.data) setServices(svRes.data);

        // @ts-ignore
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (tgUser) {
          setFormData(prev => ({ ...prev, name: tgUser.first_name || '' }));
        }
      } catch (e) {
        toast.error("Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [salonId]);

  // 2. Получаем занятые слоты
  useEffect(() => {
    async function fetchBusySlots() {
      if (!salonId || !selectedDate) return;
      setSlotsLoading(true);

      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('salon_id', salonId)
        .neq('status', 'canceled')
        .lte('start_time', end.toISOString())
        .gte('end_time', start.toISOString());

      setExistingAppointments(data || []);
      setSlotsLoading(false);
    }
    fetchBusySlots();
  }, [selectedDate, salonId]);

  const getSlots = () => {
    if (!salon || !salon.schedule) return [];

    let schedule = salon.schedule;
    if (typeof schedule === 'string') {
        try { schedule = JSON.parse(schedule); } catch(e) { schedule = []; }
    }

    const dayName = format(selectedDate, 'eeeeee', { locale: ru }).toLowerCase();
    const dayConfig = schedule.find((d: any) => d.day.toLowerCase() === dayName);

    if (!dayConfig || !dayConfig.isWorking) return [];

    const slots: string[] = [];
    let current = parse(dayConfig.hours.start, 'HH:mm', selectedDate);
    const endWorkDay = parse(dayConfig.hours.end, 'HH:mm', selectedDate);

    while (isBefore(current, endWorkDay)) {
      const timeStr = format(current, 'HH:mm');
      const duration = selectedService?.duration_minutes || 30;

      const slotStart = new Date(current);
      const slotEnd = addMinutes(slotStart, duration);

      const isBusy = existingAppointments.some(app => {
        const cleanStart = app.start_time.replace(' ', 'T').replace(/(Z|\+.*)$/, '');
        const cleanEnd = app.end_time.replace(' ', 'T').replace(/(Z|\+.*)$/, '');
        const appStart = new Date(cleanStart);
        const appEnd = new Date(cleanEnd);
        return slotStart < appEnd && slotEnd > appStart;
      });

      const isPast = isSameDay(selectedDate, new Date()) && isBefore(current, new Date());

      if (!isBusy && !isPast) slots.push(timeStr);
      current = addMinutes(current, salon.slot_step || 30);
    }
    return slots;
  };

  const handleFinish = async () => {
    if (!selectedService || !selectedTime || !salonId) return;

    setLoading(true);

    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    try {
      const payload = {
        salonId,
        service: selectedService,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        client: {
          name: formData.name,
          phone: formData.phone,
          telegram_user: tgUser || null
        },
        pet: { name: formData.petName, petBreed: formData.petBreed }
      };

      await api.createBooking(payload);

      setStep('success');
      // @ts-ignore
      if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

    } catch (err: any) {
      toast.error("Ошибка сервера: " + (err.message || "Неизвестная ошибка"));
    } finally {
      setLoading(false);
    }
  };

  if (loading && step !== 'success') {
    return <div className="flex h-screen items-center justify-center bg-[#F2F2F7]"><Loader2 className="animate-spin text-[#007AFF]" size={32}/></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F2F2F7] max-w-md mx-auto overflow-x-hidden font-sans">
      {step !== 'success' && (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 px-5 pt-12 pb-4 border-b border-slate-100 flex items-center gap-4">
          {step !== 'showcase' && (
            <button onClick={() => setStep(step === 'datetime' ? 'showcase' : 'datetime')} className="text-[#007AFF] active:opacity-50">
              <ChevronLeft size={28} />
            </button>
          )}
          <h1 className="text-[17px] font-bold flex-1 text-center pr-8">
            {step === 'showcase' ? 'Выбор услуги' : step === 'datetime' ? 'Дата и время' : 'Ваши данные'}
          </h1>
        </header>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {step === 'showcase' && (
          <div className="animate-in fade-in duration-500">
            <div className="relative h-56 w-full overflow-hidden">
              <img src={salon?.photo_url || "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?q=80&w=800"} className="w-full h-full object-cover" alt="Salon" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6">
                <h2 className="text-white text-2xl font-extrabold tracking-tight">{salon?.name}</h2>
                <div className="flex items-center text-white/90 text-[13px] mt-1 gap-1 font-medium">
                  <MapPin size={14} className="text-[#007AFF]" /> {salon?.address}
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">Наши услуги</h3>
              {services.map(s => (
                <div key={s.id} className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100 flex gap-4 active:scale-[0.98] transition-all cursor-pointer" onClick={() => { setSelectedService(s); setStep('datetime'); }}>
                  <div className="w-20 h-20 rounded-[18px] bg-slate-100 overflow-hidden shrink-0">
                    <img src={s.image_url || "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?q=80&w=200"} className="w-full h-full object-cover" alt={s.title} />
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <h4 className="text-[17px] font-bold text-black leading-tight tracking-tight">{s.title}</h4>
                      <p className="text-[13px] text-[#8E8E93] mt-1 font-medium">{s.duration_minutes} мин</p>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[18px] font-black text-[#007AFF]">{s.price} ₸</span>
                      <div className="bg-[#007AFF] text-white px-4 py-1.5 rounded-full text-[13px] font-bold">Выбрать</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'datetime' && (
          <div className="p-5 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <section>
              <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 mb-3">Выберите дату</h3>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {[...Array(14)].map((_, i) => {
                  const d = addDays(startOfToday(), i);
                  const isSelected = isSameDay(d, selectedDate);
                  return (
                    <button key={i} onClick={() => setSelectedDate(d)} className={`flex flex-col items-center justify-center min-w-[65px] h-[85px] rounded-[20px] transition-all ${isSelected ? 'bg-[#007AFF] text-white shadow-lg' : 'bg-white text-black border border-slate-100'}`}>
                      <span className={`text-[11px] font-bold uppercase ${isSelected ? 'opacity-80' : 'opacity-40'}`}>
                        {format(d, 'eee', { locale: ru })}
                      </span>
                      <span className="text-[20px] font-black mt-1">{format(d, 'd')}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 mb-3">Доступное время</h3>
              <div className="relative min-h-[100px]">
                {slotsLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" /></div>
                ) : (
                  <div className="grid grid-cols-4 gap-2.5">
                    {getSlots().map(time => (
                      <button key={time} onClick={() => setSelectedTime(time)} className={`py-3 rounded-[14px] text-[15px] font-bold transition-all border ${selectedTime === time ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-md' : 'bg-white text-black border-slate-100 active:bg-slate-50'}`}>
                        {time}
                      </button>
                    ))}
                  </div>
                )}
                {!slotsLoading && getSlots().length === 0 && (
                  <div className="text-center py-10 text-[#8E8E93] font-medium bg-white rounded-[20px] border border-dashed">На этот день окон нет</div>
                )}
              </div>
            </section>

            {selectedTime && (
              <button onClick={() => setStep('details')} className="w-full bg-[#007AFF] text-white py-4 rounded-[20px] font-bold text-[17px] shadow-xl shadow-blue-100 active:scale-95 transition-all">
                Продолжить
              </button>
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="p-5 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="bg-white rounded-[24px] p-5 border border-slate-100 space-y-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-[#007AFF]/10 p-3 rounded-[16px] text-[#007AFF]"><Clock size={24} /></div>
                <div>
                  <p className="text-[13px] text-[#8E8E93] font-bold uppercase tracking-tight">Ваша запись</p>
                  <p className="text-[16px] font-black text-black">{selectedService?.title}</p>
                  <p className="text-[14px] font-bold text-[#007AFF] mt-0.5">
                    {format(selectedDate, 'd MMMM', { locale: ru })} в {selectedTime}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-[#8E8E93] uppercase mb-1 ml-1">Имя владельца</p>
                <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-transparent text-[17px] font-bold outline-none caret-[#007AFF]" placeholder="Иван" />
              </div>
              <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black text-[#8E8E93] uppercase mb-1 ml-1">Телефон</p>
                <PhoneInput value={formData.phone} onChange={val => setFormData({...formData, phone: val})} className="border-none shadow-none h-auto p-0 text-[17px] font-bold caret-[#007AFF]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-[#8E8E93] uppercase mb-1 ml-1">Кличка</p>
                  <input value={formData.petName} onChange={e => setFormData({...formData, petName: e.target.value})} className="w-full bg-transparent text-[17px] font-bold outline-none caret-[#007AFF]" placeholder="Арчи" />
                </div>
                <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-[#8E8E93] uppercase mb-1 ml-1">Порода</p>
                  <input value={formData.petBreed} onChange={e => setFormData({...formData, petBreed: e.target.value})} className="w-full bg-transparent text-[17px] font-bold outline-none caret-[#007AFF]" placeholder="Шпиц" />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-white rounded-[20px] border border-slate-100 shadow-sm" onClick={() => setFormData({...formData, agreed: !formData.agreed})}>
                <div className={`w-6 h-6 rounded-[8px] border-2 flex items-center justify-center transition-all ${formData.agreed ? 'bg-[#34C759] border-[#34C759]' : 'border-slate-200'}`}>
                  {formData.agreed && <CheckCircle2 size={16} className="text-white" />}
                </div>
                <span className="text-[13px] text-[#8E8E93] font-bold leading-tight">Согласен на обработку данных</span>
              </div>
            </div>

            <button
              disabled={!formData.agreed || !formData.phone || !formData.petName}
              onClick={handleFinish}
              className={`w-full py-4 rounded-[20px] font-black text-[17px] shadow-xl transition-all ${
                formData.agreed && formData.phone && formData.petName
                ? 'bg-[#34C759] text-white active:scale-95 shadow-green-100'
                : 'bg-slate-200 text-[#8E8E93] cursor-not-allowed shadow-none'
              }`}
            >
              Записаться
            </button>
          </div>
        )}

        {/* ШАГ 4: УСПЕХ */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-[#34C759] rounded-full flex items-center justify-center text-white mb-8 shadow-2xl shadow-green-200">
              <CheckCircle2 size={52} strokeWidth={2.5} />
            </div>
            <h2 className="text-[32px] font-black text-black mb-3 tracking-tight">Готово!</h2>
            <p className="text-[17px] text-[#8E8E93] font-bold leading-relaxed mb-12 px-4">
              Мы пришлем уведомление когда мастер подтвердит вашу заявку. 🎉
            </p>

            <div className="w-full space-y-3">
              <button onClick={() => { setStep('showcase'); setSelectedService(null); setSelectedTime(null); }} className="w-full py-4 text-[#007AFF] font-bold text-[17px] active:opacity-50">
                Вернуться назад
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}