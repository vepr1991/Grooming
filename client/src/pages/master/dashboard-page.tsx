import { useEffect, useState } from "react";
import { format, addMonths, subMonths, isToday, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Plus,
  User,
  Clock,
  Calendar as CalendarIcon,
  PawPrint,
  Wallet,
  TrendingUp,
  Ban,
  CheckCircle2,
  ChevronDown,
  Scissors,
  Loader2,
  Copy,
  MessageSquare,
  BarChart3
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
  const [view, setView] = useState<'agenda' | 'calendar' | 'stats'>('agenda');
  const [filter, setFilter] = useState<'pending' | 'history'>('pending');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newApp, setNewApp] = useState({
    client_name: "", client_phone: "", pet_name: "", pet_breed: "", service_id: "",
    date: format(new Date(), "yyyy-MM-dd"), time: format(new Date(), "HH:mm")
  });

  const salonId = localStorage.getItem("salon_id");

  const loadAllData = () => {
    fetchAppointments();
    if (view === 'stats') fetchStats();
  };

  const fetchAppointments = async () => {
    if (!salonId) return;
    setLoading(true);
    const { data, error } = await supabase.from('appointments')
      .select(`*, services (title, price, duration_minutes, image_url)`)
      .eq('salon_id', salonId);
    if (!error) setAppointments(data || []);
    setLoading(false);
  };

  const fetchServices = async () => {
    if (!salonId) return;
    const { data } = await supabase.from('services').select('id, title, price, duration_minutes').eq('salon_id', salonId).eq('is_active', true);
    if (data) setServices(data);
  };

  const fetchStats = async () => {
    if (!salonId) return;
    try {
      const data = await api.getAnalytics(salonId);
      setStats(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchServices(); fetchAppointments(); }, [salonId]);
  useEffect(() => { if (view === 'stats') fetchStats(); }, [view]);

  const handleManualAdd = async () => {
    if (!newApp.client_name || !newApp.service_id || !newApp.client_phone) return toast.error("Заполните поля");
    const selectedS = services.find(s => s.id === newApp.service_id);
    if (!selectedS || !salonId) return;
    setIsSubmitting(true);
    try {
      await api.createBooking({ salonId, service: selectedS, date: newApp.date, time: newApp.time, client: { name: newApp.client_name, phone: newApp.client_phone }, pet: { name: newApp.pet_name, petBreed: newApp.pet_breed } });
      toast.success("Записано!"); setIsAdding(false); fetchAppointments();
    } catch (e: any) { toast.error("Ошибка"); } finally { setIsSubmitting(false); }
  };

  const updateStatus = async (id: string, newStatus: Appointment['status']) => {
    const tId = toast.loading("Обновление...");
    try { await api.updateAppointmentStatus(id, newStatus); toast.success("Готово", { id: tId }); fetchAppointments(); if(view === 'stats') fetchStats(); }
    catch (e) { toast.error("Ошибка", { id: tId }); }
  };

  const filteredApps = appointments.filter(app => filter === 'pending' ? app.status === 'pending' : ['confirmed', 'completed', 'canceled'].includes(app.status)).sort((a, b) => parseDate(a.start_time).getTime() - parseDate(b.start_time).getTime());
  const calendarPendingApps = appointments.filter(app => isSameDay(parseDate(app.start_time), selectedDate) && app.status === 'pending');

  const renderCalendar = () => {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (new Date(year, month, 1).getDay() || 7) - 1;
    const days = [];
    for (let i = 0; i < offset; i++) days.push(<div key={`p-${i}`} className="h-12" />);
    for (let d = 1; d <= daysInMonth; d++) {
      const dObj = new Date(year, month, d), isSel = isSameDay(dObj, selectedDate), hasP = appointments.some(a => isSameDay(parseDate(a.start_time), dObj) && a.status === 'pending');
      days.push(<div key={d} className="relative flex items-center justify-center h-12 cursor-pointer" onClick={() => setSelectedDate(dObj)}><div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${isSel ? 'bg-[#007AFF] text-white' : isToday(dObj) ? 'text-[#007AFF] bg-[#007AFF]/10' : 'text-black'}`}>{d}</div>{hasP && !isSel && <div className="absolute bottom-1 w-1.5 h-1.5 bg-orange-500 rounded-full" />}</div>);
    }
    return (
      <div className="bg-white rounded-[16px] p-2 shadow-sm border border-slate-100 mx-5 mt-2">
        <div className="flex justify-between items-center px-4 py-2"><span className="font-bold text-lg capitalize">{format(currentMonth, 'LLLL yyyy', { locale: ru })}</span><div className="flex gap-2"><button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft /></button><button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight /></button></div></div>
        <div className="grid grid-cols-7 text-center py-2 text-[11px] font-bold text-[#8E8E93]">{['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-1">{days}</div>
      </div>
    );
  };

  const renderStats = () => {
    if (!stats) return <div className="text-center py-20"><Loader2 className="animate-spin mx-auto text-[#007AFF]" /></div>;
    return (
      <div className="px-5 space-y-4 animate-in fade-in slide-in-from-right-4">
        <div className="bg-gradient-to-br from-[#007AFF] to-[#0055FF] rounded-[24px] p-6 text-white shadow-lg shadow-blue-200">
          <div className="flex items-center justify-between opacity-80 mb-1"><span className="text-[13px] font-bold uppercase">Выручка месяца</span><Wallet size={20} /></div>
          <div className="text-[34px] font-extrabold">{stats.total_revenue.toLocaleString()} ₸</div>
          <div className="mt-4 flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-[13px]"><TrendingUp size={14} /> +{stats.today_revenue} ₸ сегодня</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-[20px] border shadow-sm flex flex-col justify-between h-28"><div className="flex items-center gap-2 text-[#34C759]"><CheckCircle2 size={18}/><span className="text-[12px] font-bold text-[#8E8E93]">ГОТОВО</span></div><span className="text-[28px] font-black">{stats.completed_count}</span></div>
          <div className="bg-white p-4 rounded-[20px] border shadow-sm flex flex-col justify-between h-28"><div className="flex items-center gap-2 text-[#FF3B30]"><Ban size={18}/><span className="text-[12px] font-bold text-[#8E8E93]">ОТМЕНЫ</span></div><span className="text-[28px] font-black">{stats.canceled_count}</span></div>
        </div>
        {/* График */}
        <div className="bg-white p-5 rounded-[24px] border shadow-sm">
          <div className="flex items-center gap-2 mb-6"><BarChart3 size={20}/><h3 className="font-bold">Динамика</h3></div>
          <div className="flex items-end gap-2 h-32 overflow-x-auto no-scrollbar pb-2">
            {stats.daily_stats.map((d: any, i: number) => {
              const max = Math.max(...stats.daily_stats.map((s:any) => s.value), 1);
              return (
                <div key={i} className="flex flex-col items-center gap-2 min-w-[30px] flex-1">
                  <div className="w-full bg-[#F2F2F7] rounded-t-[6px] h-full flex items-end overflow-hidden group relative">
                    <div style={{ height: `${(d.value/max)*100}%` }} className="w-full bg-[#007AFF] rounded-t-[6px] transition-all" />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] p-1 rounded opacity-0 group-hover:opacity-100">{d.value}</div>
                  </div>
                  <span className="text-[10px] font-bold text-[#8E8E93]">{d.date}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Топ услуг */}
        <div className="bg-white p-5 rounded-[24px] border shadow-sm">
          <div className="flex items-center gap-2 mb-4"><TrendingUp className="text-orange-500" /><h3 className="font-bold">Популярные услуги</h3></div>
          <div className="space-y-3">
            {stats.top_services?.map((s: any, i: number) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[12px] font-bold">{i+1}</div><span className="text-[15px]">{s.title}</span></div>
                <div className="font-bold">{s.count} <span className="text-[12px] font-normal text-[#8E8E93]">записей</span></div>
              </div>
            )) || <p className="text-center text-slate-400 text-sm">Нет данных</p>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen">
      <div className="px-5 flex justify-between items-end mb-4"><h1 className="text-[32px] font-extrabold">{view === 'stats' ? 'Финансы' : 'Записи'}</h1><div className="flex gap-2">{view !== 'stats' && <button onClick={() => setIsAdding(true)} className="w-10 h-10 bg-[#007AFF] text-white rounded-full flex items-center justify-center shadow-lg"><Plus /></button>}<button onClick={loadAllData} className="w-10 h-10 bg-white border rounded-full flex items-center justify-center shadow-sm"><RefreshCcw className={loading ? "animate-spin" : ""} /></button></div></div>
      <div className="px-5"><div className="flex bg-[#E3E3E8] p-1 rounded-xl shadow-sm"><button onClick={() => setView('agenda')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg ${view === 'agenda' ? 'bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Список</button><button onClick={() => setView('calendar')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg ${view === 'calendar' ? 'bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Календарь</button><button onClick={() => setView('stats')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg ${view === 'stats' ? 'bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Финансы</button></div></div>
      {view === 'agenda' && <div className="px-5 space-y-4"><div className="flex bg-white/50 p-1 rounded-xl shadow-sm"><button onClick={() => setFilter('pending')} className={`flex-1 py-2 text-[15px] font-bold rounded-lg ${filter === 'pending' ? 'text-[#007AFF] bg-white' : 'text-[#8E8E93]'}`}>Ожидают</button><button onClick={() => setFilter('history')} className={`flex-1 py-2 text-[15px] font-bold rounded-lg ${filter === 'history' ? 'text-[#007AFF] bg-white' : 'text-[#8E8E93]'}`}>История</button></div><div className="space-y-3">{loading ? <p className="text-center py-10">Загрузка...</p> : filteredApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} />)}</div></div>}
      {view === 'calendar' && <div className="space-y-4">{renderCalendar()}<div className="px-5 space-y-3"><h2 className="text-[13px] font-bold text-[#8E8E93] uppercase px-1">{format(selectedDate, 'd MMMM', { locale: ru })}</h2>{calendarPendingApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} />)}</div></div>}
      {view === 'stats' && renderStats()}
      {isAdding && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end justify-center"><div className="bg-[#F2F2F7] w-full max-w-md rounded-t-[24px] h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom"><div className="p-4 border-b flex justify-between items-center bg-white"><button onClick={() => setIsAdding(false)} className="text-[#007AFF]">Отмена</button><span className="font-bold">Новая запись</span><button onClick={handleManualAdd} className="font-bold text-[#007AFF]">{isSubmitting ? "..." : "Готово"}</button></div><div className="p-5 space-y-4 overflow-y-auto"><div className="bg-white p-4 rounded-xl space-y-3"><input placeholder="Имя" className="w-full text-lg outline-none" value={newApp.client_name} onChange={e => setNewApp({...newApp, client_name: e.target.value})} /><PhoneInput value={newApp.client_phone} onChange={val => setNewApp({...newApp, client_phone: val})} /></div><div className="grid grid-cols-2 gap-3"><div className="bg-white p-3 rounded-xl"><input placeholder="Кличка" className="w-full outline-none" value={newApp.pet_name} onChange={e => setNewApp({...newApp, pet_name: e.target.value})} /></div><div className="bg-white p-3 rounded-xl"><input placeholder="Порода" className="w-full outline-none" value={newApp.pet_breed} onChange={e => setNewApp({...newApp, pet_breed: e.target.value})} /></div></div><div className="bg-white p-3 rounded-xl"><select className="w-full outline-none" value={newApp.service_id} onChange={e => setNewApp({...newApp, service_id: e.target.value})}><option value="">Выбрать услугу</option>{services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><input type="date" className="p-3 rounded-xl outline-none" value={newApp.date} onChange={e => setNewApp({...newApp, date: e.target.value})} /><input type="time" className="p-3 rounded-xl outline-none" value={newApp.time} onChange={e => setNewApp({...newApp, time: e.target.value})} /></div></div></div></div>
      )}
    </div>
  );
}

function AppointmentCard({ app, onStatusUpdate }: { app: Appointment, onStatusUpdate: (id: string, s: Appointment['status']) => void }) {
  const [ex, setEx] = useState(false);
  const sInfo = Array.isArray(app.services) ? app.services[0] : app.services;
  const sTime = parseDate(app.start_time);
  const cfg: any = { pending: { bg: '#FFF4D6', text: '#855E00', lbl: 'НОВАЯ' }, confirmed: { bg: '#E3F2FF', text: '#007AFF', lbl: 'ПРИНЯТА' }, completed: { bg: '#E8F5E9', text: '#2E7D32', lbl: 'ГОТОВО' }, canceled: { bg: '#FFEBEE', text: '#C62828', lbl: 'ОТМЕНА' } }[app.status];

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-4 flex items-center justify-between" onClick={() => setEx(!ex)}>
        <div className="flex items-center gap-4"><div className="text-center shrink-0 w-12"><div className="font-bold text-lg">{format(sTime, 'HH:mm')}</div><div className="text-[10px] uppercase text-slate-400">{format(sTime, 'd MMM', { locale: ru })}</div></div><div className="w-[1px] h-8 bg-slate-100" /><div><div className="font-bold">{app.pet_name}</div><div className="text-xs text-slate-400">{sInfo?.title}</div></div></div>
        <div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.lbl}</span><ChevronDown size={16} className={ex ? "rotate-180" : ""} /></div>
      </div>
      {ex && (
        <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-1">
          <div className="pt-3 border-t flex gap-4"><div className="w-16 h-16 rounded-xl bg-slate-50 overflow-hidden shrink-0">{sInfo?.image_url ? <img src={sInfo.image_url} className="w-full h-full object-cover" /> : <Scissors className="m-auto mt-4 opacity-10" />}</div><div className="space-y-1"><div className="font-bold text-sm">{app.pet_breed}</div><div className="text-xs bg-slate-50 p-2 rounded-lg">{sInfo?.title} • {sInfo?.price} ₸</div><div className="text-xs text-slate-400">Владелец: {app.client_name} ({app.client_phone})</div></div></div>
          <div className="flex gap-2 border-t pt-3">{app.status === 'pending' ? <><button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="flex-1 bg-[#007AFF] text-white py-2 rounded-xl font-bold">Принять</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="flex-1 bg-slate-50 text-red-500 py-2 rounded-xl font-bold">Отмена</button></> : app.status === 'confirmed' ? <><button onClick={() => onStatusUpdate(app.id, 'completed')} className="flex-1 bg-green-600 text-white py-2 rounded-xl font-bold">Готово</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="flex-1 bg-slate-50 text-red-500 py-2 rounded-xl font-bold">Отмена</button></> : null}</div>
        </div>
      )}
    </div>
  );
}