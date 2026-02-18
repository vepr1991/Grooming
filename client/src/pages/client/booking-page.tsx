import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, addDays, isSameDay, isBefore, parse, addMinutes, startOfToday } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  CheckCircle2,
  Loader2,
  Image as ImageIcon,
  X,
  Check,
  Calendar,
  Wallet
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";
import { api } from "@/lib/api";

type Step = 'showcase' | 'datetime' | 'details' | 'success';

type Salon = {
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

type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
  image_url: string;
  description?: string;
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
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    petName: '',
    petBreed: '',
    agreed: false
  });

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      if (!salonId) return;
      setLoading(true);
      try {
        const [sRes, svRes] = await Promise.all([
          supabase.from('salons').select('*').eq('id', salonId).single(),
          supabase.from('services').select('*').eq('salon_id', salonId).eq('is_active', true)
        ]);

        if (sRes.data) {
           let parsedGallery = [];
           try { parsedGallery = typeof sRes.data.gallery === 'string' ? JSON.parse(sRes.data.gallery) : sRes.data.gallery || []; } catch(e) { parsedGallery = []; }

           let parsedSchedule = [];
           try { parsedSchedule = typeof sRes.data.schedule === 'string' ? JSON.parse(sRes.data.schedule) : sRes.data.schedule || []; } catch(e) { parsedSchedule = []; }

           setSalon({
               ...sRes.data,
               schedule: parsedSchedule,
               gallery: Array.isArray(parsedGallery) ? parsedGallery : []
           });
        }

        if (svRes.data) setServices(svRes.data);

        // @ts-ignore
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (tgUser) {
          setFormData(prev => ({ ...prev, name: tgUser.first_name || '' }));
        }
      } catch (e) {
        console.error(e);
        toast.error("Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [salonId]);

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

  const parseDbDate = (isoStr: string) => {
      const clean = isoStr.split('+')[0].split('Z')[0];
      return new Date(clean);
  };

  const getSlots = () => {
    if (!salon || !salon.schedule) return [];

    const dayName = format(selectedDate, 'eeeeee', { locale: ru }).toLowerCase();
    const dayConfig = salon.schedule.find((d: any) => d.day.toLowerCase() === dayName);

    if (!dayConfig || !dayConfig.isWorking) return [];

    const slots: string[] = [];
    let current = parse(dayConfig.hours.start, 'HH:mm', selectedDate);
    const endWorkDay = parse(dayConfig.hours.end, 'HH:mm', selectedDate);

    const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

    while (isBefore(current, endWorkDay)) {
      const timeStr = format(current, 'HH:mm');
      const slotStart = new Date(current);
      const slotEnd = addMinutes(slotStart, totalDuration);

      const isBusy = existingAppointments.some(app => {
        const appStart = parseDbDate(app.start_time);
        const appEnd = parseDbDate(app.end_time);
        return slotStart < appEnd && slotEnd > appStart;
      });

      const isTooLate = isBefore(endWorkDay, slotEnd);
      const isPast = isSameDay(selectedDate, new Date()) && isBefore(current, new Date());

      if (!isBusy && !isPast && !isTooLate) slots.push(timeStr);
      current = addMinutes(current, salon.slot_step || 30);
    }
    return slots;
  };

  // 👇 ИСПРАВЛЕННАЯ ЛОГИКА С ЛИМИТОМ В 3 УСЛУГИ
  const toggleService = (service: Service) => {
      const isSelected = selectedServices.some(s => s.id === service.id);

      if (isSelected) {
          // Если уже выбрана - убираем
          setSelectedServices(prev => prev.filter(s => s.id !== service.id));
      } else {
          // Если пытаемся добавить новую, проверяем лимит
          if (selectedServices.length >= 3) {
              toast.error("Максимум 3 услуги за одну запись", {
                  description: "Для большего количества создайте еще одну запись."
              });
              return;
          }
          setSelectedServices(prev => [...prev, service]);
      }
  };

  const handleFinish = async () => {
    if (selectedServices.length === 0 || !selectedTime || !salonId) return;

    setLoading(true);

    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    try {
      const payload = {
        salonId,
        services: selectedServices,
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

  const totalAmount = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  if (loading && step !== 'success') {
    return <div className="flex h-screen items-center justify-center bg-[#F2F2F7]"><Loader2 className="animate-spin text-[#007AFF]" size={32}/></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F2F2F7] max-w-md mx-auto overflow-x-hidden font-sans pb-24">
      {step !== 'success' && (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 px-5 pt-12 pb-4 border-b border-slate-100 flex items-center gap-4">
          {step !== 'showcase' && (
            <button onClick={() => setStep(step === 'datetime' ? 'showcase' : 'datetime')} className="text-[#007AFF] active:opacity-50">
              <ChevronLeft size={28} />
            </button>
          )}
          <h1 className="text-[17px] font-bold flex-1 text-center pr-8">
            {step === 'showcase' ? 'Услуги' : step === 'datetime' ? 'Время' : 'Детали'}
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

            <div className="p-5 pb-0 space-y-3">
                 {salon?.description && <p className="text-[14px] text-[#3A3A3C] leading-relaxed bg-white p-4 rounded-[20px] shadow-sm">{salon.description}</p>}
            </div>

            {salon?.gallery && salon.gallery.length > 0 && (
               <div className="p-5 pb-0 space-y-3">
                   <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 flex items-center gap-2">
                       <ImageIcon size={14}/> Наши работы
                   </h3>
                   <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-5 px-5 snap-x">
                       {salon.gallery.map((img, i) => (
                           <div key={i} className="snap-start shrink-0 first:pl-0">
                               <img 
                                   src={img} 
                                   className="w-32 h-32 rounded-[20px] object-cover shadow-sm cursor-pointer active:scale-95 transition-transform border border-slate-100"
                                   onClick={() => setLightboxIndex(i)}
                               />
                           </div>
                       ))}
                   </div>
               </div>
            )}

            <div className="p-5 space-y-4 pb-28">
              <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">Выберите услуги (макс. 3)</h3>
              {services.map(s => {
                const isSelected = selectedServices.some(sel => sel.id === s.id);
                // Опционально: делаем неактивными остальные услуги, если выбрано 3
                // const isMaxReached = selectedServices.length >= 3 && !isSelected;
                
                return (
                  <div 
                    key={s.id} 
                    className={`bg-white rounded-[24px] p-4 shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${isSelected ? 'border-[#007AFF] ring-1 ring-[#007AFF]' : 'border-slate-100'}`}
                    onClick={() => toggleService(s)}
                  >
                    <div className="flex gap-4">
                        <div className="w-20 h-20 rounded-[18px] bg-slate-100 overflow-hidden shrink-0">
                            <img src={s.image_url || "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?q=80&w=200"} className="w-full h-full object-cover" alt={s.title} />
                        </div>
                        <div className="flex-1 flex flex-col justify-between py-0.5">
                            <div>
                                <h4 className="text-[17px] font-bold text-black leading-tight">{s.title}</h4>
                                <p className="text-[13px] text-[#8E8E93] mt-1 font-medium">{s.duration_minutes} мин</p>
                                {s.description && (
                                    <p className="text-[12px] text-[#3A3A3C] mt-2 leading-tight opacity-80 line-clamp-2">{s.description}</p>
                                )}
                            </div>
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-[18px] font-black text-[#007AFF]">{s.price} ₸</span>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#007AFF] border-[#007AFF]' : 'border-slate-200'}`}>
                                    {isSelected && <Check size={14} className="text-white"/>}
                                </div>
                            </div>
                        </div>
                    </div>
                  </div>
                )
              })}
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
              <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 mb-3">Доступное время ({totalDuration} мин)</h3>
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
              <button onClick={() => setStep('details')} className="w-full bg-[#007AFF] text-white py-4 rounded-[20px] font-bold text-[17px] shadow-xl shadow-blue-100 active:scale-95 transition-all mt-4">
                Продолжить
              </button>
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="p-5 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="bg-white rounded-[24px] p-5 border border-slate-100 space-y-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[repeating-linear-gradient(45deg,#F2F2F7,#F2F2F7_10px,#fff_10px,#fff_20px)] opacity-50"></div>

                <div className="flex justify-between items-start pt-2">
                    <div>
                        <p className="text-[12px] text-[#8E8E93] font-bold uppercase tracking-wide">Дата и время</p>
                        <div className="flex items-center gap-2 mt-1">
                            <Calendar size={18} className="text-[#007AFF]" />
                            <span className="text-[17px] font-bold text-black">{format(selectedDate, 'd MMMM', { locale: ru })}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Clock size={18} className="text-[#007AFF]" />
                            <span className="text-[17px] font-bold text-black">{selectedTime}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-[#F9F9F9] rounded-xl p-3 border border-slate-50">
                    <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-wide mb-2 pl-1">Выбранные услуги</p>
                    
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                        {selectedServices.map(s => (
                            <div key={s.id} className="flex justify-between items-center text-[14px]">
                                <span className="font-medium text-slate-700 leading-tight pr-2">{s.title}</span>
                                <span className="font-bold text-black whitespace-nowrap">{s.price} ₸</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200">
                    <div className="flex items-center gap-2 text-[#8E8E93]">
                        <Wallet size={18} />
                        <span className="text-[15px] font-medium">Итого к оплате</span>
                    </div>
                    <span className="text-[22px] font-black text-[#007AFF]">{totalAmount} ₸</span>
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
              Записаться ({totalAmount} ₸)
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
              <button onClick={() => { setStep('showcase'); setSelectedServices([]); setSelectedTime(null); }} className="w-full py-4 text-[#007AFF] font-bold text-[17px] active:opacity-50">
                Вернуться назад
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FLOAT BOTTOM BAR */}
      {step === 'showcase' && selectedServices.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30 animate-in slide-in-from-bottom duration-300">
              <button 
                onClick={() => setStep('datetime')}
                className="w-full bg-[#007AFF] text-white py-4 rounded-[20px] font-bold text-[17px] shadow-xl shadow-blue-200 active:scale-95 transition-all flex justify-between px-6"
              >
                  <span>Продолжить ({selectedServices.length})</span>
                  <span>{totalAmount} ₸</span>
              </button>
          </div>
      )}

      {/* LIGHTBOX */}
      {lightboxIndex !== null && salon?.gallery && (
          <div className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-in fade-in duration-200" onClick={() => setLightboxIndex(null)}>
              <button className="absolute top-4 right-4 text-white/80 p-2"><X size={32}/></button>
              <img 
                src={salon.gallery[lightboxIndex]} 
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()} 
              />
              {salon.gallery.length > 1 && (
                  <>
                      <button className="absolute left-2 text-white/50 hover:text-white p-4" onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev! > 0 ? prev! - 1 : salon.gallery.length - 1)); }}><ChevronLeft size={40}/></button>
                      <button className="absolute right-2 text-white/50 hover:text-white p-4" onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev! < salon.gallery.length - 1 ? prev! + 1 : 0)); }}><ChevronRight size={40}/></button>
                  </>
              )}
          </div>
      )}
    </div>
  );
}
