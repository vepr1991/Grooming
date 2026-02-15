import { useEffect, useState } from "react";
import { format, addMonths, subMonths, isToday, isValid, isSameDay, addMinutes } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronDown,
  Phone,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  PawPrint,
  RefreshCcw,
  Scissors,
  Plus,
  User,
  Clock,
  Calendar as CalendarIcon,
  Copy
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";

type Appointment = {
  id: string;
  client_name: string;
  client_phone: string;
  client_tg_user?: string | any; // Может быть JSON строкой или объектом
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

export function MasterDashboardPage() {
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda');
  const [filter, setFilter] = useState<'pending' | 'history'>('pending');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [newApp, setNewApp] = useState({
    client_name: "", client_phone: "", pet_name: "", pet_breed: "", service_id: "",
    date: format(new Date(), "yyyy-MM-dd"), time: format(new Date(), "HH:mm")
  });

  const salonId = localStorage.getItem("salon_id");

  const fetchAppointments = async () => {
    if (!salonId) return;
    setLoading(true);
    const { data, error } = await supabase.from('appointments').select(`*, services (title, price, duration_minutes)`).eq('salon_id', salonId);
    if (!error) setAppointments(data || []);
    setLoading(false);
  };

  const fetchServices = async () => {
    if (!salonId) return;
    const { data } = await supabase.from('services').select('id, title, price, duration_minutes').eq('salon_id', salonId);
    if (data) setServices(data);
  };

  useEffect(() => { fetchAppointments(); fetchServices(); }, [salonId]);

  const handleManualAdd = async () => {
    if (!newApp.client_name || !newApp.service_id || !newApp.client_phone) { toast.error("Заполните поля"); return; }
    const selectedS = services.find(s => s.id === newApp.service_id);
    const duration = selectedS?.duration_minutes || 30;
    const startDate = new Date(`${newApp.date}T${newApp.time}:00`);
    const start_time = startDate.toISOString();
    const end_time = addMinutes(startDate, duration).toISOString();

    const { error } = await supabase.from('appointments').insert([{
      salon_id: salonId, client_name: newApp.client_name, client_phone: newApp.client_phone,
      pet_name: newApp.pet_name, pet_breed: newApp.pet_breed, service_id: newApp.service_id,
      start_time, end_time, status: 'confirmed'
    }]);

    if (!error) { toast.success("Записано!"); setIsAdding(false); fetchAppointments(); }
  };

  const filteredApps = appointments
    .filter(app => filter === 'pending' ? app.status === 'pending' : ['confirmed', 'completed', 'canceled'].includes(app.status))
    .sort((a, b) => {
      const tA = new Date(a.start_time).getTime();
      const tB = new Date(b.start_time).getTime();
      return filter === 'pending' ? tA - tB : tB - tA;
    });

  const calendarPendingApps = appointments.filter(app =>
    isSameDay(new Date(app.start_time), selectedDate) && app.status === 'pending'
  );

  const updateStatus = async (id: string, newStatus: Appointment['status']) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
    if (!error) fetchAppointments();
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    const days: React.ReactNode[] = [];

    for (let i = 0; i < offset; i++) days.push(<div key={`prev-${i}`} className="h-12"></div>);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const isSel = isSameDay(dateObj, selectedDate);
      const hasPending = appointments.some(a => isSameDay(new Date(a.start_time), dateObj) && a.status === 'pending');
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
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-200 bg-white/80 sticky top-0 z-10"><button onClick={() => setIsAdding(false)} className="text-[17px] text-[#007AFF]">Отмена</button><h2 className="text-[17px] font-bold">Новая запись</h2><button onClick={handleManualAdd} className="text-[17px] font-bold text-[#007AFF]">Готово</button></div>
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
      const userObj = typeof app.client_tg_user === 'string'
        ? JSON.parse(app.client_tg_user)
        : app.client_tg_user;
      tgUsername = userObj?.username;
    }
  } catch (e) {
    console.error("Failed to parse tg user", e);
  }

  // Очистка номера
  const cleanPhone = app.client_phone.replace(/[^0-9+]/g, '');

  const chatLink = tgUsername
    ? `https://t.me/${tgUsername}`
    : `https://wa.me/${cleanPhone}`;

  const isTelegram = !!tgUsername;

  const statusConfig: any = {
    pending: { bg: '#FFF4D6', text: '#855E00', label: 'ОЖИДАЕТ' },
    confirmed: { bg: '#E3F2FF', text: '#007AFF', label: 'ПРИНЯТА' },
    completed: { bg: '#E8F5E9', text: '#2E7D32', label: 'ГОТОВО' },
    canceled: { bg: '#FFEBEE', text: '#C62828', label: 'ОТМЕНА' },
  };
  const config = statusConfig[app.status] || statusConfig.pending;
  const sTime = new Date(app.start_time);
  const sInfo = Array.isArray(app.services) ? app.services[0] : app.services;

  return (
    <div className={`bg-white rounded-[16px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden ${expanded ? 'shadow-md' : ''}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer active:bg-zinc-50" onClick={() => setExpanded(!expanded)}>
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
            <div className="w-20 h-20 rounded-2xl bg-[#F2F2F7] flex items-center justify-center shrink-0"><Scissors size={28} className="text-[#8E8E93] opacity-20" /></div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[15px] font-bold text-black truncate">{app.pet_breed || "Порода не указана"}</p>
              <div className="bg-[#F2F2F7] rounded-xl p-2.5"><p className="text-[13px] font-semibold text-black truncate">{sInfo?.title}</p><p className="text-[11px] text-[#8E8E93]">{sInfo?.duration_minutes || '30'} мин • {sInfo?.price || '0'} ₸</p></div>
              <p className="text-[13px] text-[#8E8E93] pt-1 font-medium">Владелец: {app.client_name}</p>

              <div className="flex items-center gap-2 mt-3">
                {/* 👇 НОВАЯ КНОПКА: СКОПИРОВАТЬ НОМЕР */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(app.client_phone);
                    toast.success("Номер скопирован");
                    // Пробуем открыть звонилку после копирования
                    window.location.href = `tel:${cleanPhone}`;
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#F2F2F7] text-black py-2.5 rounded-full text-[13px] font-bold active:scale-95 transition-all"
                >
                  <Copy size={14} /> {app.client_phone}
                </button>

                {/* Кнопка мессенджера */}
                <a
                  href={chatLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-[13px] font-bold active:scale-95 transition-all ${isTelegram ? 'bg-[#E3F2FF] text-[#007AFF]' : 'bg-[#E8F5E9] text-[#2E7D32]'}`}
                >
                  {isTelegram ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> : <MessageSquare size={14} />}
                  {isTelegram ? 'Telegram' : 'WhatsApp'}
                </a>
              </div>

            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[#F2F2F7]">
            {app.status === 'pending' ? (<><button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="h-11 bg-[#007AFF] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all">Принять</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all">Отмена</button></>) : app.status === 'confirmed' ? (<><button onClick={() => onStatusUpdate(app.id, 'completed')} className="h-11 bg-[#2E7D32] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all">Завершить</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all">Отмена</button></>) : null}
          </div>
        </div>
      )}
    </div>
  );
}