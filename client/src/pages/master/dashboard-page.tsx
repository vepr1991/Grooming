import { useEffect, useState } from "react";
import { format, addMonths, subMonths, isToday, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  RefreshCcw,
  Scissors,
  Plus,
  User,
  Clock,
  Calendar as CalendarIcon,
  Copy,
  Loader2,
  PawPrint
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";
import { api } from "@/lib/api";

type Appointment = {
  id: string;
  client_name: string;
  client_phone: string;
  client_tg_user?: string | any;
  pet_name: string;
  pet_breed: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'canceled';
  services: any;
};

type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
};

const parseDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  return new Date(dateStr.substring(0, 19));
};

export function MasterDashboardPage() {
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda');
  const [filter, setFilter] = useState<'pending' | 'history'>('pending');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newApp, setNewApp] = useState({
    client_name: "", client_phone: "", pet_name: "", pet_breed: "", service_id: "",
    date: format(new Date(), "yyyy-MM-dd"), time: format(new Date(), "HH:mm")
  });

  const salonId = localStorage.getItem("salon_id");

  const fetchAppointments = async () => {
    if (!salonId) return;
    setLoading(true);
    // 👇 ИСПРАВЛЕНИЕ 1: Добавил image_url в запрос
    const { data, error } = await supabase.from('appointments')
      .select(`*, services (title, price, duration_minutes, image_url)`)
      .eq('salon_id', salonId);

    if (!error) setAppointments(data || []);
    setLoading(false);
  };

  const fetchServices = async () => {
    if (!salonId) return;
    const { data } = await supabase.from('services')
      .select('id, title, price, duration_minutes')
      .eq('salon_id', salonId)
      .eq('is_active', true);
    if (data) setServices(data);
  };

  useEffect(() => { fetchAppointments(); fetchServices(); }, [salonId]);

  const handleManualAdd = async () => {
    if (!newApp.client_name || !newApp.service_id || !newApp.client_phone) {
      toast.error("Заполните имя, телефон и услугу");
      return;
    }

    const selectedS = services.find(s => s.id === newApp.service_id);
    if (!selectedS || !salonId) return;

    setIsSubmitting(true);

    try {
      const payload = {
        salonId: salonId,
        service: {
          id: selectedS.id,
          title: selectedS.title,
          duration_minutes: selectedS.duration_minutes
        },
        date: newApp.date,
        time: newApp.time,
        client: {
          name: newApp.client_name,
          phone: newApp.client_phone,
          telegram_user: null
        },
        pet: {
          name: newApp.pet_name,
          petBreed: newApp.pet_breed
        }
      };

      await api.createBooking(payload);

      toast.success("Клиент успешно записан!");
      setIsAdding(false);
      setNewApp(prev => ({ ...prev, client_name: "", client_phone: "", pet_name: "", pet_breed: "" }));
      fetchAppointments();

    } catch (e: any) {
      console.error(e);
      if (e.message && e.message.includes("409")) {
          toast.error("Это время уже занято! ⚠️");
      } else {
          toast.error(e.message || "Не удалось создать запись");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (id: string, newStatus: Appointment['status']) => {
    const toastId = toast.loading("Обновление...");
    try {
        await api.updateAppointmentStatus(id, newStatus);
        toast.success("Статус обновлен", { id: toastId });
        fetchAppointments();
    } catch (e) {
        toast.error("Не удалось обновить статус", { id: toastId });
    }
  };

  const filteredApps = appointments
    .filter(app => filter === 'pending' ? app.status === 'pending' : ['confirmed', 'completed', 'canceled'].includes(app.status))
    .sort((a, b) => {
      const tA = parseDate(a.start_time).getTime();
      const tB = parseDate(b.start_time).getTime();
      return filter === 'pending' ? tA - tB : tB - tA;
    });

  const calendarPendingApps = appointments.filter(app =>
    isSameDay(parseDate(app.start_time), selectedDate) && app.status === 'pending'
  );

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    const days: React.ReactNode[] = [];

    for (let i = 0; i < offset; i++) days.push(<div key={`prev-${i}`} className="h-12"></div>);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const isSel = isSameDay(dateObj, selectedDate);

      const hasPending = appointments.some(a => isSameDay(parseDate(a.start_time), dateObj) && a.status === 'pending');
      const isCurrToday = isToday(dateObj);

      days.push(
        <div key={d} className="relative flex items-center justify-center h-12 cursor-pointer" onClick={() => setSelectedDate(dateObj)}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
            isSel ? 'bg-[#007AFF] text-white' : isCurrToday ? 'text-[#007AFF] bg-[#007AFF]/10' : 'text-black'
          }`}>
            {d}
          </div>
          {hasPending && !isSel && <div className="absolute bottom-1 w-1.5 h-1.5 bg-orange-500 rounded-full"></div>}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-[16px] p-2 shadow-sm border border-slate-100 mx-5 mt-2">
        <div className="flex justify-between items-center px-4 py-2">
          <span className="font-bold text-lg capitalize">{format(currentMonth, 'LLLL yyyy', { locale: ru })}</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-[#007AFF]"><ChevronLeft size={22}/></button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-[#007AFF]"><ChevronRight size={22}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center py-2">
          {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map(d => <span key={d} className="text-[11px] font-bold text-[#8E8E93]">{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1 pb-2">{days}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen font-sans">
      <div className="px-5 flex justify-between items-end mb-4">
        <h1 className="text-[32px] font-extrabold tracking-tight text-black">Записи</h1>
        <div className="flex gap-2">
          <button onClick={() => setIsAdding(true)} className="w-10 h-10 rounded-full bg-[#007AFF] text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"><Plus size={24}/></button>
          <button onClick={fetchAppointments} className="w-10 h-10 rounded-full bg-white border border-slate-200 text-[#8E8E93] flex items-center justify-center shadow-sm active:opacity-50 transition-opacity"><RefreshCcw size={20} className={loading ? "animate-spin" : ""}/></button>
        </div>
      </div>

      <div className="px-5 space-y-4">
        <div className="flex w-full bg-[#E3E3E8] p-1 rounded-xl border border-slate-200 shadow-sm">
          <button onClick={() => setView('agenda')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-[8px] transition-all ${view === 'agenda' ? 'bg-white shadow-sm text-black' : 'text-[#8E8E93]'}`}>Список</button>
          <button onClick={() => setView('calendar')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-[8px] transition-all ${view === 'calendar' ? 'bg-white shadow-sm text-black' : 'text-[#8E8E93]'}`}>Календарь</button>
        </div>
        {view === 'agenda' && (
          <div className="flex w-full bg-white/50 p-1 rounded-xl border border-slate-200 shadow-sm">
            <button onClick={() => setFilter('pending')} className={`flex-1 py-2 text-[15px] font-bold rounded-lg transition-all ${filter === 'pending' ? 'text-[#007AFF] bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Ожидают</button>
            <button onClick={() => setFilter('history')} className={`flex-1 py-2 text-[15px] font-bold rounded-lg transition-all ${filter === 'history' ? 'text-[#007AFF] bg-white shadow-sm' : 'text-[#8E8E93]'}`}>История</button>
          </div>
        )}
      </div>

      {view === 'agenda' ? (
        <div className="px-5 space-y-3">
          {loading ? <div className="text-center py-20 text-[#8E8E93]">Загрузка...</div> : filteredApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} />)}
        </div>
      ) : (
        <div className="space-y-4">
          {renderCalendar()}
          <div className="px-5 pt-2">
            <h2 className="text-[13px] font-bold text-[#8E8E93] uppercase mb-3 px-1">Ожидают на {format(selectedDate, 'd MMMM', { locale: ru })}</h2>
            <div className="space-y-3">
              {calendarPendingApps.length === 0 ? (
                <div className="bg-white/50 rounded-[16px] p-8 text-center text-[#8E8E93] text-[15px] border border-dashed">На этот день новых записей нет</div>
              ) : (
                calendarPendingApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} />)
              )}
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-end justify-center p-0">
          <div className="bg-[#F2F2F7] w-full max-w-md rounded-t-[24px] pb-10 overflow-hidden animate-in slide-in-from-bottom duration-300 shadow-2xl h-[92vh] flex flex-col">
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-200 bg-white/80 sticky top-0 z-10"><button onClick={() => setIsAdding(false)} className="text-[17px] text-[#007AFF]">Отмена</button><h2 className="text-[17px] font-bold">Новая запись</h2><button onClick={handleManualAdd} disabled={isSubmitting} className="text-[17px] font-bold text-[#007AFF]">{isSubmitting ? <Loader2 className="animate-spin"/> : "Готово"}</button></div>
            <div className="px-5 mt-6 space-y-5 flex-1 overflow-y-auto pb-10">
              <div className="space-y-1.5"><label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1"><User size={14} className="inline mr-1"/> Владелец</label><div className="bg-white rounded-[12px] p-1 border border-slate-100 shadow-sm"><input placeholder="Имя клиента" className="w-full px-4 py-3 bg-transparent text-[17px] outline-none" value={newApp.client_name} onChange={e => setNewApp({...newApp, client_name: e.target.value})} /></div><div className="bg-white rounded-[12px] p-3.5 border border-slate-100 shadow-sm"><PhoneInput value={newApp.client_phone} onChange={val => setNewApp({...newApp, client_phone: val})} className="border-none shadow-none h-auto p-0 text-[17px]"/></div></div>
              <div className="space-y-1.5"><label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1"><PawPrint size={14} className="inline mr-1"/> Питомец</label><div className="grid grid-cols-2 gap-3"><div className="bg-white rounded-[12px] p-1 border border-slate-100 shadow-sm"><input placeholder="Кличка" className="w-full px-4 py-3 bg-transparent text-[17px] outline-none" value={newApp.pet_name} onChange={e => setNewApp({...newApp, pet_name: e.target.value})} /></div><div className="bg-white rounded-[12px] p-1 border border-slate-100 shadow-sm"><input placeholder="Порода" className="w-full px-4 py-3 bg-transparent text-[17px] outline-none" value={newApp.pet_breed} onChange={e => setNewApp({...newApp, pet_breed: e.target.value})} /></div></div></div>
              <div className="space-y-1.5"><label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1"><Scissors size={14} className="inline mr-1"/> Услуга</label><div className="bg-white rounded-[12px] p-1 border border-slate-100 shadow-sm"><select className="w-full px-4 py-3 bg-transparent text-[17px] outline-none appearance-none font-medium" value={newApp.service_id} onChange={e => setNewApp({...newApp, service_id: e.target.value})}><option value="">Выберите услугу</option>{services.map(s => (<option key={s.id} value={s.id}>{s.title} ({s.price} ₸)</option>))}</select></div></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1"><CalendarIcon size={14} className="inline mr-1"/> Дата</label><div className="bg-white rounded-[12px] p-1 border border-slate-100 shadow-sm"><input type="date" className="w-full px-4 py-3 bg-transparent text-[17px] outline-none font-bold text-[#007AFF] text-center" value={newApp.date} onChange={e => setNewApp({...newApp, date: e.target.value})} /></div></div><div className="space-y-1.5"><label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1"><Clock size={14} className="inline mr-1"/> Время</label><div className="bg-white rounded-[12px] p-1 border border-slate-100 shadow-sm"><input type="time" className="w-full px-4 py-3 bg-transparent text-[17px] outline-none font-bold text-[#007AFF] text-center" value={newApp.time} onChange={e => setNewApp({...newApp, time: e.target.value})} /></div></div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ app, onStatusUpdate }: { app: Appointment, onStatusUpdate: (id: string, s: Appointment['status']) => void }) {
  const [expanded, setExpanded] = useState(false);

  let tgUsername = null;
  try {
    if (app.client_tg_user) {
      const userObj = typeof app.client_tg_user === 'string' ? JSON.parse(app.client_tg_user) : app.client_tg_user;
      tgUsername = userObj?.username;
    }
  } catch (e) {
    console.error("Failed to parse tg user", e);
  }

  const cleanPhone = app.client_phone.replace(/[^0-9+]/g, '');
  const chatLink = tgUsername ? `https://t.me/${tgUsername}` : `https://wa.me/${cleanPhone}`;
  const isTelegram = !!tgUsername;

  const statusConfig: any = {
    pending: { bg: '#FFF4D6', text: '#855E00', label: 'ОЖИДАЕТ' },
    confirmed: { bg: '#E3F2FF', text: '#007AFF', label: 'ПРИНЯТА' },
    completed: { bg: '#E8F5E9', text: '#2E7D32', label: 'ГОТОВО' },
    canceled: { bg: '#FFEBEE', text: '#C62828', label: 'ОТМЕНА' },
  };
  const config = statusConfig[app.status] || statusConfig.pending;

  const sTime = parseDate(app.start_time);
  const sInfo = Array.isArray(app.services) ? app.services[0] : app.services;

  return (
    <div className={`bg-white rounded-[16px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden ${expanded ? 'shadow-md' : ''}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer active:bg-zinc-50 hover:bg-zinc-50 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex flex-col items-center justify-center shrink-0 w-[52px]">
            <span className="text-[17px] font-bold text-black">{format(sTime, 'HH:mm')}</span>
            <span className={`text-[10px] font-bold uppercase ${isToday(sTime) ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}>{isToday(sTime) ? 'Сегодня' : format(sTime, 'd MMM', { locale: ru })}</span>
          </div>
          <div className="w-[1px] h-10 bg-[#E5E5EA] shrink-0"></div>
          <div className="min-w-0 flex-1"><h3 className="text-[17px] font-bold text-black truncate">{app.pet_name}</h3><p className="text-[13px] text-[#8E8E93] truncate">{sInfo?.title || 'Услуга...'}</p></div>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0"><span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-tight text-center min-w-[70px]" style={{ backgroundColor: config.bg, color: config.text }}>{config.label}</span><ChevronDown size={18} className={`text-[#C7C7CC] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} /></div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 bg-white animate-in slide-in-from-top-2">
          <div className="flex gap-4 py-3 border-t border-[#F2F2F7]">
            {/* 👇 ИСПРАВЛЕНИЕ 2: Отрисовка картинки */}
            <div className="w-20 h-20 rounded-2xl bg-[#F2F2F7] flex items-center justify-center shrink-0 overflow-hidden relative border border-slate-100">
              {sInfo?.image_url ? (
                <img src={sInfo.image_url} className="absolute inset-0 w-full h-full object-cover" alt="Service" />
              ) : (
                <Scissors size={28} className="text-[#8E8E93] opacity-20" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[15px] font-bold text-black truncate">{app.pet_breed || "Порода не указана"}</p>
              <div className="bg-[#F2F2F7] rounded-xl p-2.5"><p className="text-[13px] font-semibold text-black truncate">{sInfo?.title}</p><p className="text-[11px] text-[#8E8E93]">{sInfo?.duration_minutes || '30'} мин • {sInfo?.price || '0'} ₸</p></div>
              <p className="text-[13px] text-[#8E8E93] pt-1 font-medium">Владелец: {app.client_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(app.client_phone);
                toast.success("Номер скопирован");
                window.location.href = `tel:${cleanPhone}`;
              }}
              className="flex-1 min-w-0 flex items-center justify-start pl-4 gap-3 bg-[#F2F2F7] text-black py-3 rounded-2xl text-[14px] font-bold active:scale-95 transition-all overflow-hidden hover:bg-slate-200"
            >
              <Copy size={16} className="shrink-0 text-[#8E8E93]" />
              <span className="truncate">{app.client_phone}</span>
            </button>

            <a
              href={chatLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`w-32 h-[46px] flex items-center justify-center rounded-2xl active:scale-95 transition-all shrink-0 hover:opacity-80 ${isTelegram ? 'bg-[#E3F2FF] text-[#007AFF]' : 'bg-[#E8F5E9] text-[#2E7D32]'}`}
            >
              {isTelegram ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> : <MessageSquare size={22} />}
            </a>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[#F2F2F7]">
            {app.status === 'pending' ? (<><button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="h-11 bg-[#007AFF] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all hover:bg-[#0069d9]">Принять</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all hover:bg-red-50">Отмена</button></>) : app.status === 'confirmed' ? (<><button onClick={() => onStatusUpdate(app.id, 'completed')} className="h-11 bg-[#2E7D32] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all hover:bg-[#256628]">Завершить</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all hover:bg-red-50">Отмена</button></>) : null}
          </div>
        </div>
      )}
    </div>
  );
}