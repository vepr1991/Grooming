import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format, addDays, isSameDay, isBefore, parse, addMinutes, startOfToday } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, MapPin, Clock, CheckCircle2,
  Loader2, Image as ImageIcon, X, Check, Calendar, Wallet
} from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";

// Импортируем наши хуки
import { useSalon, useServices, useBusySlots, useCreateBooking, type Service } from "@/hooks/use-booking";

// Типы состояний
type Step = 'showcase' | 'datetime' | 'details' | 'success';

export function ClientBookingPage() {
  const { salonId } = useParams();

  // 1. ЗАГРУЗКА ДАННЫХ
  const { data: salon, isLoading: isSalonLoading } = useSalon(salonId);
  const { data: services = [], isLoading: isServicesLoading } = useServices(salonId);
  const createBookingMutation = useCreateBooking();

  // 2. СОСТОЯНИЕ UI
  const [step, setStep] = useState<Step>('showcase');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 3. СОСТОЯНИЕ КОРЗИНЫ
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // 4. ДАННЫЕ ФОРМЫ (С ПАМЯТЬЮ)
  // @ts-ignore
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  const [formData, setFormData] = useState(() => {
    // 🧠 Пытаемся достать данные из прошлого визита
    try {
        const saved = localStorage.getItem('client_info');
        const parsed = saved ? JSON.parse(saved) : {};
        return {
          name: tgUser?.first_name || parsed.name || '',
          phone: parsed.phone || '',
          petName: parsed.petName || '',
          petBreed: parsed.petBreed || '',
          agreed: false
        };
    } catch {
        return { name: tgUser?.first_name || '', phone: '', petName: '', petBreed: '', agreed: false };
    }
  });

  // 5. ЗАГРУЗКА ЗАНЯТЫХ СЛОТОВ
  const { data: busySlots = [], isLoading: isSlotsLoading } = useBusySlots(salonId, selectedDate);

  // ОПРЕДЕЛЯЕМ НИШУ
  const isGrooming = salon?.niche !== 'beauty';

  // === ЭФФЕКТ: КНОПКА НАЗАД В TELEGRAM ===
  useEffect(() => {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (!tg) return;

      if (step !== 'showcase' && step !== 'success') {
          tg.BackButton.show();
          tg.BackButton.onClick(() => {
              if (step === 'details') setStep('datetime');
              else if (step === 'datetime') setStep('showcase');
          });
      } else {
          tg.BackButton.hide();
      }

      return () => {
          tg.BackButton.offClick();
          tg.BackButton.hide();
      };
  }, [step]);

  // === ЛОГИКА: Расчет свободных слотов ===
  const freeSlots = useMemo(() => {
    if (!salon?.schedule || selectedServices.length === 0) return [];

    const dayName = format(selectedDate, 'eeeeee', { locale: ru }).toLowerCase();
    const dayConfig = salon.schedule.find((d: any) => d.day.toLowerCase() === dayName);

    if (!dayConfig || !dayConfig.isWorking) return [];

    const slots: string[] = [];
    let current = parse(dayConfig.hours.start, 'HH:mm', selectedDate);
    const endWorkDay = parse(dayConfig.hours.end, 'HH:mm', selectedDate);
    const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

    const parseDbDate = (isoStr: string) => new Date(isoStr.split('+')[0].split('Z')[0]);

    while (isBefore(current, endWorkDay)) {
      const timeStr = format(current, 'HH:mm');
      const slotStart = new Date(current);
      const slotEnd = addMinutes(slotStart, totalDuration);

      const isBusy = busySlots.some((app: any) => {
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
  }, [salon, selectedDate, selectedServices, busySlots]);

  const toggleService = (service: Service) => {
      const isSelected = selectedServices.some(s => s.id === service.id);
      if (isSelected) {
          setSelectedServices(prev => prev.filter(s => s.id !== service.id));
      } else {
          if (selectedServices.length >= 3) {
              toast.error("Максимум 3 услуги", { description: "Создайте вторую запись для дополнительных услуг." });
              return;
          }
          setSelectedServices(prev => [...prev, service]);
      }
  };

  const handleFinish = async () => {
    if (!selectedTime || !salonId) return;

    try {
      // ИЗМЕНЕНИЕ: Динамически формируем метаданные
      const metadataParams = isGrooming ? {
          petName: formData.petName,
          petBreed: formData.petBreed
      } : {};

      await createBookingMutation.mutateAsync({
        salonId,
        services: selectedServices,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        client: {
          name: formData.name,
          phone: formData.phone,
          telegram_user: tgUser || null
        },
        metadata: metadataParams // <--- Отправляем новый JSON
      });

      // 💾 СОХРАНЯЕМ ДАННЫЕ В ПАМЯТЬ
      localStorage.setItem('client_info', JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          petName: isGrooming ? formData.petName : "",
          petBreed: isGrooming ? formData.petBreed : ""
      }));

      setStep('success');
      // @ts-ignore
      if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      toast.error(err.message || "Ошибка при записи");
    }
  };

  // Валидация кнопки (для Бьюти кличка не нужна)
  const isFormValid = formData.agreed && formData.phone && (!isGrooming || formData.petName);

  if ((isSalonLoading || isServicesLoading) && step !== 'success') {
    return <div className="flex h-screen items-center justify-center bg-[#F2F2F7]"><Loader2 className="animate-spin text-[#007AFF]" size={32}/></div>;
  }

  const totalAmount = selectedServices.reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="flex flex-col min-h-screen bg-[#F2F2F7] max-w-md mx-auto overflow-x-hidden font-sans pb-24">
      {/* ШАПКА */}
      {step !== 'success' && (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 px-5 pt-12 pb-4 border-b border-slate-100 flex items-center gap-4 transition-all">
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
        {/* ЭКРАН 1: ВИТРИНА */}
        {step === 'showcase' && salon && (
          <div className="animate-in fade-in duration-500">
            <div className="relative h-56 w-full overflow-hidden">
              <img src={salon.photo_url || "/placeholder-salon.jpg"} className="w-full h-full object-cover" alt="Salon" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6">
                <h2 className="text-white text-2xl font-extrabold tracking-tight">{salon.name}</h2>
                <div className="flex items-center text-white/90 text-[13px] mt-1 gap-1 font-medium">
                  <MapPin size={14} className="text-[#007AFF]" /> {salon.address}
                </div>
              </div>
            </div>

            {salon.description && (
                <div className="p-5 pb-0">
                    <p className="text-[14px] text-[#3A3A3C] leading-relaxed bg-white p-4 rounded-[20px] shadow-sm">{salon.description}</p>
                </div>
            )}

            {salon.gallery?.length > 0 && (
               <div className="p-5 pb-0 space-y-3">
                   <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 flex items-center gap-2">
                       <ImageIcon size={14}/> Наши работы
                   </h3>
                   <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-5 px-5 snap-x">
                       {salon.gallery.map((img: string, i: number) => (
                           <img
                               key={i} src={img} onClick={() => setLightboxIndex(i)}
                               className="snap-start shrink-0 w-32 h-32 rounded-[20px] object-cover shadow-sm cursor-pointer active:scale-95 transition-transform border border-slate-100"
                           />
                       ))}
                   </div>
               </div>
            )}

            <div className="p-5 space-y-4 pb-28">
              <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">Выберите услуги</h3>
              {services.map(s => {
                const isSelected = selectedServices.some(sel => sel.id === s.id);
                return (
                  <div
                    key={s.id}
                    className={`bg-white rounded-[24px] p-4 shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${isSelected ? 'border-[#007AFF] ring-1 ring-[#007AFF]' : 'border-slate-100'}`}
                    onClick={() => toggleService(s)}
                  >
                    <div className="flex gap-4">
                        <div className="w-20 h-20 rounded-[18px] bg-slate-100 overflow-hidden shrink-0">
                            {s.image_url && <img src={s.image_url} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 flex flex-col justify-between py-0.5">
                            <div>
                                <h4 className="text-[17px] font-bold text-black leading-tight">{s.title}</h4>
                                <p className="text-[13px] text-[#8E8E93] mt-1 font-medium">{s.duration_minutes} мин</p>
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

        {/* ЭКРАН 2: ВРЕМЯ */}
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
                {isSlotsLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-300" /></div>
                ) : (
                  <div className="grid grid-cols-4 gap-2.5">
                    {freeSlots.length > 0 ? freeSlots.map(time => (
                      <button key={time} onClick={() => setSelectedTime(time)} className={`py-3 rounded-[14px] text-[15px] font-bold transition-all border ${selectedTime === time ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-md' : 'bg-white text-black border-slate-100 active:bg-slate-50'}`}>
                        {time}
                      </button>
                    )) : (
                      <div className="col-span-4 text-center py-8 text-[#8E8E93] bg-white rounded-[20px] border border-dashed text-sm">Нет свободных окон 😔</div>
                    )}
                  </div>
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

        {/* ЭКРАН 3: ДЕТАЛИ */}
        {step === 'details' && (
          <div className="p-5 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[repeating-linear-gradient(45deg,#F2F2F7,#F2F2F7_10px,#fff_10px,#fff_20px)] opacity-50"></div>
                <div className="flex flex-col gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1"><Calendar size={16} className="text-[#007AFF]"/> <span className="font-bold text-black">{format(selectedDate, 'd MMMM', { locale: ru })}</span></div>
                        <div className="flex items-center gap-2"><Clock size={16} className="text-[#007AFF]"/> <span className="font-bold text-black">{selectedTime}</span></div>
                    </div>
                    <div className="bg-[#F9F9F9] rounded-xl p-3 border border-slate-50 space-y-2">
                        {selectedServices.map(s => (
                            <div key={s.id} className="flex justify-between text-[14px]">
                                <span className="font-medium text-slate-700">{s.title}</span>
                                <span className="font-bold">{s.price} ₸</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200">
                        <span className="flex items-center gap-2 text-[#8E8E93] text-[15px] font-medium"><Wallet size={18}/> Итого</span>
                        <span className="text-[22px] font-black text-[#007AFF]">{totalAmount} ₸</span>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
               <InputBlock label="Имя" value={formData.name} onChange={(v: string) => setFormData({...formData, name: v})} placeholder="Ваше имя" />
               <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-[#8E8E93] uppercase mb-1 ml-1">Телефон</p>
                  <PhoneInput value={formData.phone} onChange={val => setFormData({...formData, phone: val})} className="border-none shadow-none h-auto p-0 text-[17px] font-bold caret-[#007AFF]" />
               </div>

               {/* ИЗМЕНЕНИЕ: Скрываем собак, если это маникюр */}
               {isGrooming && (
                   <div className="grid grid-cols-2 gap-3">
                      <InputBlock label="Кличка" value={formData.petName} onChange={(v: string) => setFormData({...formData, petName: v})} placeholder="Арчи" />
                      <InputBlock label="Порода" value={formData.petBreed} onChange={(v: string) => setFormData({...formData, petBreed: v})} placeholder="Шпиц" />
                   </div>
               )}

               <div className="flex items-center gap-3 p-4 bg-white rounded-[20px] border border-slate-100 shadow-sm" onClick={() => setFormData({...formData, agreed: !formData.agreed})}>
                  <div className={`w-6 h-6 rounded-[8px] border-2 flex items-center justify-center transition-all ${formData.agreed ? 'bg-[#34C759] border-[#34C759]' : 'border-slate-200'}`}>
                    {formData.agreed && <CheckCircle2 size={16} className="text-white" />}
                  </div>
                  <span className="text-[13px] text-[#8E8E93] font-bold">Согласен на обработку данных</span>
               </div>
            </div>

            <button
              disabled={!isFormValid || createBookingMutation.isPending}
              onClick={handleFinish}
              className={`w-full py-4 rounded-[20px] font-black text-[17px] shadow-xl transition-all ${isFormValid ? 'bg-[#34C759] text-white active:scale-95 shadow-green-100' : 'bg-slate-200 text-[#8E8E93] cursor-not-allowed'}`}
            >
              {createBookingMutation.isPending ? <Loader2 className="animate-spin mx-auto"/> : `Записаться (${totalAmount} ₸)`}
            </button>
          </div>
        )}

        {/* ЭКРАН 4: УСПЕХ */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in zoom-in duration-500 pt-20">
            <div className="w-24 h-24 bg-[#34C759] rounded-full flex items-center justify-center text-white mb-8 shadow-2xl shadow-green-200">
              <CheckCircle2 size={52} strokeWidth={2.5} />
            </div>
            <h2 className="text-[32px] font-black text-black mb-3 tracking-tight">Готово!</h2>
            <p className="text-[17px] text-[#8E8E93] font-bold leading-relaxed mb-12 px-4">
              Ждем подтверждения от мастера. Уведомление придет сюда.
            </p>
            <button onClick={() => { setStep('showcase'); setSelectedServices([]); setSelectedTime(null); }} className="w-full py-4 text-[#007AFF] font-bold text-[17px] active:opacity-50">
              На главную
            </button>
          </div>
        )}
      </div>

      {step === 'showcase' && selectedServices.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30 animate-in slide-in-from-bottom duration-300 max-w-md mx-auto">
              <button onClick={() => setStep('datetime')} className="w-full bg-[#007AFF] text-white py-4 rounded-[20px] font-bold text-[17px] shadow-xl shadow-blue-200 active:scale-95 transition-all flex justify-between px-6">
                  <span>Продолжить ({selectedServices.length})</span>
                  <span>{totalAmount} ₸</span>
              </button>
          </div>
      )}

      {lightboxIndex !== null && salon?.gallery && (
          <div className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-in fade-in duration-200" onClick={() => setLightboxIndex(null)}>
              <button className="absolute top-4 right-4 text-white/80 p-2"><X size={32}/></button>
              <img src={salon.gallery[lightboxIndex]} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
              {salon.gallery.length > 1 && (
                  <>
                      <button className="absolute left-2 text-white/50 p-4" onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev! > 0 ? prev! - 1 : salon.gallery.length - 1)); }}><ChevronLeft size={40}/></button>
                      <button className="absolute right-2 text-white/50 p-4" onClick={(e) => { e.stopPropagation(); setLightboxIndex(prev => (prev! < salon.gallery.length - 1 ? prev! + 1 : 0)); }}><ChevronRight size={40}/></button>
                  </>
              )}
          </div>
      )}
    </div>
  );
}

const InputBlock = ({ label, value, onChange, placeholder }: any) => (
  <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black text-[#8E8E93] uppercase mb-1 ml-1">{label}</p>
    <input value={value} onChange={e => onChange(e.target.value)} className="w-full bg-transparent text-[17px] font-bold outline-none caret-[#007AFF]" placeholder={placeholder} />
  </div>
);