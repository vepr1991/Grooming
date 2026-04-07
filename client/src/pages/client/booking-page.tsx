import { useState, useMemo, useEffect, memo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { format, addDays, isSameDay, isBefore, parse, addMinutes, startOfToday, addMonths, subMonths, isSameMonth } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, MapPin, Clock, CheckCircle2,
  Loader2, Image as ImageIcon, X, Check, Calendar, Wallet, Instagram,
  History, Scissors
} from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";

// Импортируем хуки
import { useSalon, useServices, useBusySlots, useCreateBooking, useClientAppointments, type Service } from "@/hooks/use-booking";

// Типы состояний
type Step = 'showcase' | 'datetime' | 'details' | 'success';
type Tab = 'book' | 'history';

// Оптимизированный компонент календаря
const ClientCalendarGrid = memo(({
  currentMonth,
  selectedDate,
  schedule,
  setCurrentMonth,
  onSelectDate
}: {
  currentMonth: Date;
  selectedDate: Date;
  schedule: any;
  setCurrentMonth: (d: Date) => void;
  onSelectDate: (d: Date) => void;
}) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() || 7) - 1;

  const days: React.ReactNode[] = [];

  for (let i = 0; i < offset; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dObj = new Date(year, month, d);
    const isSelected = isSameDay(dObj, selectedDate);
    const isPastDay = isBefore(dObj, startOfToday());

    const dayName = format(dObj, 'eeeeee', { locale: ru }).toLowerCase();
    const dayConfig = schedule?.find((s: any) => s.day.toLowerCase() === dayName);
    const isWorking = dayConfig?.isWorking ?? true;

    const isDisabled = isPastDay || !isWorking;

    days.push(
      <button
        key={d}
        disabled={isDisabled}
        onClick={() => onSelectDate(dObj)}
        className={`h-11 w-full rounded-xl text-[15px] font-bold flex items-center justify-center transition-all
          ${isSelected ? 'bg-[#007AFF] text-white shadow-md' :
            isDisabled ? 'text-[#C7C7CC] opacity-40 cursor-not-allowed bg-slate-50' :
            'bg-white text-black border border-slate-100 hover:bg-slate-50 active:bg-slate-100'}`}
      >
        {d}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100 mb-2">
      <div className="flex justify-between items-center mb-4 px-2">
        <span className="font-extrabold text-[17px] capitalize text-black">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </span>
        <div className="flex gap-2">
          <button
            disabled={isBefore(currentMonth, startOfToday()) && !isSameMonth(currentMonth, startOfToday())}
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="w-8 h-8 flex items-center justify-center bg-[#F2F2F7] rounded-full text-black disabled:opacity-30 active:scale-95 transition-transform"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="w-8 h-8 flex items-center justify-center bg-[#F2F2F7] rounded-full text-black active:scale-95 transition-transform"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center pb-2 text-[11px] font-bold text-[#8E8E93] uppercase tracking-wider">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">{days}</div>
    </div>
  );
});

export function ClientBookingPage() {
  const { salonId } = useParams();

  const [activeTab, setActiveTab] = useState<Tab>('book');

  // @ts-ignore
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  // 1. ЗАГРУЗКА ДАННЫХ
  const { data: salon, isLoading: isSalonLoading } = useSalon(salonId);
  const { data: services = [], isLoading: isServicesLoading } = useServices(salonId);
  const createBookingMutation = useCreateBooking();

  const { data: myAppointments = [], isLoading: isHistoryLoading } = useClientAppointments(tgUser?.id);

  // Сохраняем салон в историю посещений
  useEffect(() => {
    if (salon) {
      try {
        const history = JSON.parse(localStorage.getItem('visited_salons') || '[]');
        const filtered = history.filter((s: any) => s.id !== salon.id);

        filtered.unshift({
          id: salon.id,
          name: salon.name,
          niche: salon.niche,
          photo_url: salon.photo_url
        });

        localStorage.setItem('visited_salons', JSON.stringify(filtered.slice(0, 5)));
      } catch (e) {
        console.error("Ошибка сохранения истории салонов", e);
      }
    }
  }, [salon]);

  // 2. СОСТОЯНИЕ UI
  const [step, setStep] = useState<Step>('showcase');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 3. СОСТОЯНИЕ КОРЗИНЫ
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState<Date>(startOfToday());

  // 4. ДАННЫЕ ФОРМЫ (С ПАМЯТЬЮ)
  const [formData, setFormData] = useState(() => {
    try {
        const saved = localStorage.getItem('client_info');
        const parsed = saved ? JSON.parse(saved) : {};
        return {
          name: tgUser?.first_name || parsed.name || '',
          phone: parsed.phone || '',
          petName: parsed.petName || '',
          petBreed: parsed.petBreed || '',
          agreed: true
        };
    } catch {
        return { name: tgUser?.first_name || '', phone: '', petName: '', petBreed: '', agreed: true };
    }
  });

  // 5. ЗАГРУЗКА ЗАНЯТЫХ СЛОТОВ
  const { data: busySlots = [], isLoading: isSlotsLoading } = useBusySlots(salonId, selectedDate);

  const isGrooming = salon?.niche !== 'beauty';

  // === ЭФФЕКТ: КНОПКА НАЗАД В TELEGRAM ===
  useEffect(() => {
      // @ts-ignore
      const tg = window.Telegram?.WebApp;
      if (!tg) return;

      if (activeTab === 'history' || (step !== 'showcase' && step !== 'success')) {
          tg.BackButton.show();
          tg.BackButton.onClick(() => {
              if (activeTab === 'history') setActiveTab('book');
              else if (step === 'details') setStep('datetime');
              else if (step === 'datetime') setStep('showcase');
          });
      } else {
          tg.BackButton.hide();
      }

      return () => {
          tg.BackButton.offClick();
          tg.BackButton.hide();
      };
  }, [step, activeTab]);

  const handleDateSelect = useCallback((d: Date) => {
    setSelectedDate(d);
    setSelectedTime(null);
  }, []);

  // === ЛОГИКА: Расчет свободных слотов ===
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  const freeSlots = useMemo(() => {
    if (!salon?.schedule || selectedServices.length === 0) return [];

    const dayName = format(selectedDate, 'eeeeee', { locale: ru }).toLowerCase();
    const dayConfig = salon.schedule.find((d: any) => d.day.toLowerCase() === dayName);

    if (!dayConfig || !dayConfig.isWorking) return [];

    const slots: string[] = [];
    let current = parse(dayConfig.hours.start, 'HH:mm', selectedDate);
    const endWorkDay = parse(dayConfig.hours.end, 'HH:mm', selectedDate);

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
  }, [salon, selectedDate, selectedServices, busySlots, totalDuration]);

  // Расчет времени окончания
  const endTimeStr = useMemo(() => {
      if (!selectedTime) return "";
      const start = parse(selectedTime, 'HH:mm', selectedDate);
      const end = addMinutes(start, totalDuration);
      return format(end, 'HH:mm');
  }, [selectedTime, selectedDate, totalDuration]);

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
    if (!formData.phone || formData.phone.length < 11) {
        toast.error("Введите корректный номер телефона");
        return;
    }
    if (isGrooming && !formData.petName.trim()) {
        toast.error("Пожалуйста, укажите кличку питомца");
        return;
    }
    if (!formData.agreed) {
        toast.error("Необходимо согласие на обработку данных");
        return;
    }

    if (!selectedTime || !salonId) return;

    try {
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
        metadata: metadataParams
      });

      const existingData = JSON.parse(localStorage.getItem('client_info') || '{}');
      localStorage.setItem('client_info', JSON.stringify({
          ...existingData,
          name: formData.name,
          phone: formData.phone,
          ...(isGrooming && {
              petName: formData.petName,
              petBreed: formData.petBreed
          })
      }));

      setStep('success');
      // @ts-ignore
      if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      toast.error(err.message || "Ошибка при записи");
    }
  };

  if ((isSalonLoading || isServicesLoading) && step !== 'success') {
    return <div className="flex h-screen items-center justify-center bg-[#F2F2F7]"><Loader2 className="animate-spin text-[#007AFF]" size={32}/></div>;
  }

  const totalAmount = selectedServices.reduce((sum, s) => sum + s.price, 0);

  let addressUrl = "";
  let displayAddress = "";
  if (salon?.address) {
      const addressUrlMatch = salon.address.match(/(https?:\/\/[^\s]+)/);
      addressUrl = addressUrlMatch ? addressUrlMatch[0] : `https://2gis.kz/search/${encodeURIComponent(salon.address)}`;
      displayAddress = salon.address.replace(/(https?:\/\/[^\s]+)/g, '').trim() || salon.address;
  }

  // --- РЕНДЕР ИСТОРИИ ЗАПИСЕЙ ---
  const renderHistory = () => {
      if (isHistoryLoading) return <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-[#007AFF]"/></div>;
      if (!tgUser) return <div className="py-20 text-center text-[#8E8E93] px-5">История доступна только при входе через Telegram.</div>;

      const futureApps = myAppointments.filter((a: any) => new Date(a.start_time) >= new Date() && a.status !== 'canceled');
      const pastApps = myAppointments.filter((a: any) => new Date(a.start_time) < new Date() || a.status === 'canceled');

      return (
          <div className="p-5 space-y-8 animate-in fade-in duration-300">
              {myAppointments.length === 0 && (
                  <div className="text-center py-20 text-[#8E8E93] bg-white rounded-[24px] border border-dashed border-slate-200">
                      У вас пока нет записей 😔
                  </div>
              )}

              {futureApps.length > 0 && (
                  <div className="space-y-3">
                      <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">Предстоящие</h3>
                      {futureApps.map((app: any) => <HistoryCard key={app.id} app={app} />)}
                  </div>
              )}

              {pastApps.length > 0 && (
                  <div className="space-y-3">
                      <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 mt-6">Прошедшие</h3>
                      {pastApps.map((app: any) => <HistoryCard key={app.id} app={app} isPast />)}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F2F2F7] max-w-md mx-auto overflow-x-hidden font-sans pb-32">

      {/* ШАПКА */}
      {activeTab === 'book' && step !== 'success' && step !== 'showcase' && (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 px-5 pt-12 pb-4 border-b border-slate-100 flex items-center gap-4 transition-all">
          <button onClick={() => setStep(step === 'details' ? 'datetime' : 'showcase')} className="text-[#007AFF] active:opacity-50">
            <ChevronLeft size={28} />
          </button>
          <h1 className="text-[17px] font-bold flex-1 text-center pr-8">
            {step === 'datetime' ? 'Время' : 'Детали'}
          </h1>
        </header>
      )}

      {activeTab === 'history' && (
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 px-5 pt-12 pb-4 border-b border-slate-100 flex items-center justify-center">
          <h1 className="text-[20px] font-extrabold text-black tracking-tight">Мои записи</h1>
        </header>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar">

        {/* ВКЛАДКА: ИСТОРИЯ */}
        {activeTab === 'history' && renderHistory()}

        {/* ВКЛАДКА: ЗАПИСЬ */}
        {activeTab === 'book' && (
            <>
            {/* ЭКРАН 1: ВИТРИНА */}
            {step === 'showcase' && salon && (
              <div className="animate-in fade-in duration-500">
                <div className="relative h-64 w-full overflow-hidden bg-slate-200">
                  <img src={salon.photo_url || "/placeholder-salon.jpg"} loading="lazy" className="w-full h-full object-cover" alt="Salon" />
                </div>

                <div className="bg-white px-5 pt-5 pb-5 rounded-b-[24px] shadow-sm mb-4">
                    <h2 className="text-[26px] font-extrabold text-black tracking-tight leading-tight mb-3">
                        {salon.name}
                    </h2>

                    <a
                        href={addressUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-2 bg-[#F2F2F7] px-3.5 py-3 rounded-[14px] active:scale-95 transition-transform w-full"
                    >
                        <MapPin size={18} className="text-[#007AFF] shrink-0 mt-0.5" />
                        <span className="text-[14px] text-black font-medium leading-snug">{displayAddress}</span>
                    </a>
                </div>

                {salon.description && (
                    <div className="px-5 pb-4">
                        <p className="text-[14px] text-[#3A3A3C] leading-relaxed bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">{salon.description}</p>
                    </div>
                )}

                {salon.instagram_url && (
                    <div className="px-5 pb-4">
                        <a
                           href={salon.instagram_url.startsWith('http') ? salon.instagram_url : `https://instagram.com/${salon.instagram_url.replace('@', '')}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] text-white rounded-[16px] font-bold text-[15px] shadow-md active:scale-95 transition-all"
                        >
                            <Instagram size={18} /> Посмотреть работы в Instagram
                        </a>
                    </div>
                )}

                {salon.gallery?.length > 0 && (
                   <div className="p-5 pt-0 space-y-3">
                       <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 flex items-center gap-2">
                           <ImageIcon size={14}/> Портфолио
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
                                {s.image_url && <img src={s.image_url} loading="lazy"
                                 className="w-full h-full object-cover" />}
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

            {/* ЭКРАН 2: ВРЕМЯ И КАЛЕНДАРЬ */}
            {step === 'datetime' && (
              <div className="p-5 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">

                <ClientCalendarGrid
                  currentMonth={currentMonth}
                  selectedDate={selectedDate}
                  schedule={salon?.schedule}
                  setCurrentMonth={setCurrentMonth}
                  onSelectDate={handleDateSelect}
                />

                <section>
                  <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1 mb-3 mt-4">
                    Свободное время
                  </h3>
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
                          <div className="col-span-4 text-center py-8 text-[#8E8E93] bg-white rounded-[20px] border border-dashed text-[15px] font-medium">Нет свободных окон 😔</div>
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
                            <div className="flex items-center gap-2 mb-1">
                                <Calendar size={16} className="text-[#007AFF]"/>
                                <span className="font-bold text-black">{format(selectedDate, 'd MMMM', { locale: ru })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock size={16} className="text-[#007AFF]"/>
                                <span className="font-bold text-black">{selectedTime} - {endTimeStr}</span>
                                <span className="text-[#8E8E93] text-[13px] ml-1">({totalDuration} мин)</span>
                            </div>
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

                   {isGrooming && (
                       <div className="grid grid-cols-2 gap-3">
                          <InputBlock label="Кличка" value={formData.petName} onChange={(v: string) => setFormData({...formData, petName: v})} placeholder="Арчи" />
                          <InputBlock label="Порода" value={formData.petBreed} onChange={(v: string) => setFormData({...formData, petBreed: v})} placeholder="Шпиц" />
                       </div>
                   )}

                   <div className="flex items-center gap-3 p-4 bg-white rounded-[20px] border border-slate-100 shadow-sm cursor-pointer" onClick={() => setFormData({...formData, agreed: !formData.agreed})}>
                      <div className={`w-6 h-6 rounded-[8px] border-2 flex items-center justify-center transition-all ${formData.agreed ? 'bg-[#34C759] border-[#34C759]' : 'border-slate-200'}`}>
                        {formData.agreed && <CheckCircle2 size={16} className="text-white" />}
                      </div>
                      <span className="text-[13px] text-[#8E8E93] font-bold">Согласен на обработку данных</span>
                   </div>
                </div>

                {/* 👇 ИСПРАВЛЕНИЕ: Кнопка "Записаться" теперь динамическая */}
                <button
                  disabled={createBookingMutation.isPending || !formData.agreed}
                  onClick={handleFinish}
                  className={`w-full py-4 rounded-[20px] font-black text-[17px] transition-all active:scale-95 ${
                    formData.agreed
                      ? 'bg-[#34C759] text-white shadow-xl shadow-green-100'
                      : 'bg-[#E5E5EA] text-[#8E8E93] cursor-not-allowed shadow-none'
                  }`}
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
                  Ждем подтверждения от мастера. Уведомление придет прямо в этот чат с ботом.
                </p>
                <button onClick={() => { setStep('showcase'); setSelectedServices([]); setSelectedTime(null); setActiveTab('history'); }} className="w-full py-4 text-[#007AFF] font-bold text-[17px] active:opacity-50">
                  Мои записи
                </button>
              </div>
            )}
            </>
        )}
      </div>

      {/* Нижняя панель навигации (Tab bar) */}
      {step !== 'datetime' && step !== 'details' && step !== 'success' && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-30 pb-safe pt-2 px-6 flex justify-around max-w-md mx-auto items-center pb-6">
              <button
                onClick={() => setActiveTab('book')}
                className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'book' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                  <Scissors size={24} strokeWidth={activeTab === 'book' ? 2.5 : 2} />
                  <span className="text-[10px] font-bold">Главная</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'history' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                  <History size={24} strokeWidth={activeTab === 'history' ? 2.5 : 2} />
                  <span className="text-[10px] font-bold">Мои записи</span>
              </button>
          </div>
      )}

      {/* Кнопка продолжить */}
      {activeTab === 'book' && step === 'showcase' && selectedServices.length > 0 && (
          <div className="fixed bottom-24 left-0 right-0 p-4 z-40 animate-in slide-in-from-bottom duration-300 max-w-md mx-auto">
              <button onClick={() => setStep('datetime')} className="w-full bg-[#007AFF] text-white py-4 rounded-[20px] font-bold text-[17px] shadow-2xl active:scale-95 transition-all flex justify-between px-6">
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

// 👇 ИСПРАВЛЕНИЕ: Переработанный дизайн карточки истории + фикс времени
const HistoryCard = ({ app, isPast }: { app: any, isPast?: boolean }) => {
    // Отрезаем часовой пояс (+00 или Z), чтобы браузер не плюсовал 5 часов
    const sTime = new Date(app.start_time.split('+')[0].split('Z')[0]);

    let services = [];
    if (app.selected_services && app.selected_services.length > 0) services = app.selected_services;
    else if (app.services) services = Array.isArray(app.services) ? app.services : [app.services];

    const displayService = services.length > 0 ? services.map((s:any) => s.title).join(' + ') : 'Услуга';
    const totalAmount = services.reduce((sum: number, s:any) => sum + (Number(s.price) || 0), 0);

    const cfg: any = {
        pending: { text: 'Ожидает', color: 'text-orange-500' },
        confirmed: { text: 'Подтверждена', color: 'text-blue-500' },
        completed: { text: 'Выполнена', color: 'text-green-500' },
        canceled: { text: 'Отменена', color: 'text-red-500' }
    }[app.status] || { text: 'Неизвестно', color: 'text-slate-500' };

    return (
        <div className={`rounded-[20px] p-4 border transition-all ${
            isPast
                ? 'bg-slate-50 border-slate-100 opacity-60 grayscale-[0.5]'
                : 'bg-white border-blue-100 shadow-md ring-1 ring-blue-50'
        }`}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className={`font-bold text-[16px] ${isPast ? 'text-slate-600' : 'text-black'}`}>{app.salons?.name || 'Салон'}</h4>
                    <span className={`text-[12px] font-bold ${cfg.color}`}>{cfg.text}</span>
                </div>
                <div className="text-right">
                    <div className={`font-black text-[18px] leading-tight ${isPast ? 'text-slate-500' : 'text-black'}`}>{format(sTime, 'd MMM', { locale: ru })}</div>
                    <div className="text-[#8E8E93] font-medium text-[13px]">{format(sTime, 'HH:mm')}</div>
                </div>
            </div>

            <div className={`rounded-xl p-3 space-y-1 ${isPast ? 'bg-[#E5E5EA]/50' : 'bg-blue-50/50'}`}>
                <div className={`text-[14px] font-medium truncate ${isPast ? 'text-slate-500' : 'text-slate-700'}`}>{displayService}</div>
                <div className={`text-[14px] font-bold ${isPast ? 'text-slate-500' : 'text-black'}`}>{totalAmount} ₸</div>
            </div>
        </div>
    );
};