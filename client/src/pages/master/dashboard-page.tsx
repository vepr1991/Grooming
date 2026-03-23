import { useEffect, useState } from "react";
import { format, addMonths, subMonths, isToday, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Plus,
  Wallet,
  TrendingUp,
  Ban,
  CheckCircle2,
  ChevronDown,
  Scissors,
  Loader2,
  Copy,
  MessageSquare,
  BarChart3,
  Coffee,
  Trash2,
  Clock,
  User
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
  // ИЗМЕНЕНИЕ: Заменяем старые поля на универсальные метаданные
  metadata?: any;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'canceled' | 'blocked';
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

  // Modals state
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Состояние для ID удаляемого блока
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null);

  const [newApp, setNewApp] = useState({
    client_name: "", client_phone: "", pet_name: "", pet_breed: "", service_id: "",
    date: format(new Date(), "yyyy-MM-dd"), time: format(new Date(), "HH:mm"),
    duration_minutes: 60
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

  const confirmDeleteBlock = async () => {
    if (!blockToDelete) return;
    try {
      await api.updateAppointmentStatus(blockToDelete, 'canceled');
      toast.success("Перерыв удален");
      fetchAppointments();
    } catch(e) {
      toast.error("Ошибка удаления");
    } finally {
      setBlockToDelete(null);
    }
  };

  const handleAddBlock = async () => {
      if (!salonId) return;
      setIsSubmitting(true);
      try {
          await api.blockSlot({
              salonId,
              date: format(selectedDate, "yyyy-MM-dd"),
              time: newApp.time,
              duration_minutes: Number(newApp.duration_minutes),
              reason: "Перерыв"
          });
          toast.success("Время заблокировано");
          setIsAddingBlock(false);
          fetchAppointments();
      } catch (e: any) {
          toast.error("Ошибка: " + (e.message || "занято"));
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleManualAdd = async () => {
    if (!salonId) return;
    setIsSubmitting(true);
    try {
        const selectedS = services.find(s => s.id === newApp.service_id);
        if (!selectedS) return;

        // ИЗМЕНЕНИЕ: Формируем metadata для ручной записи (если мастер ввел кличку)
        const metadataParams = newApp.pet_name ? { petName: newApp.pet_name, petBreed: newApp.pet_breed } : {};

        await api.createBooking({
            salonId,
            services: [{ id: selectedS.id, title: selectedS.title, price: selectedS.price, duration_minutes: selectedS.duration_minutes }],
            date: newApp.date,
            time: newApp.time,
            client: { name: newApp.client_name, phone: newApp.client_phone },
            metadata: metadataParams // <--- Отправляем метаданные вместо pet
        });
        toast.success("Записано!");
        setIsAdding(false);
        setNewApp({
            client_name: "", client_phone: "", pet_name: "", pet_breed: "", service_id: "",
            date: format(new Date(), "yyyy-MM-dd"), time: format(new Date(), "HH:mm"),
            duration_minutes: 60
        });
        fetchAppointments();
    } catch (e: any) {
        toast.error("Ошибка при записи");
    } finally {
        setIsSubmitting(false);
    }
  };

  const updateStatus = async (id: string, newStatus: Appointment['status']) => {
    const tId = toast.loading("Обновление...");
    try {
      await api.updateAppointmentStatus(id, newStatus);
      toast.success("Готово", { id: tId });
      fetchAppointments();
      if(view === 'stats') fetchStats();
    }
    catch (e) { toast.error("Ошибка", { id: tId }); }
  };

  const filteredApps = appointments.filter(app => {
      if (filter === 'pending') {
          return ['pending', 'confirmed', 'blocked'].includes(app.status);
      } else {
          return ['completed', 'canceled'].includes(app.status) && app.status !== 'blocked';
      }
  }).sort((a, b) => {
      const tA = parseDate(a.start_time).getTime();
      const tB = parseDate(b.start_time).getTime();
      return filter === 'pending' ? tA - tB : tB - tA;
  });

  const calendarDayApps = appointments.filter(app => isSameDay(parseDate(app.start_time), selectedDate) && app.status !== 'canceled');

  const renderCalendar = () => {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (new Date(year, month, 1).getDay() || 7) - 1;
    const days: React.ReactNode[] = [];
    for (let i = 0; i < offset; i++) days.push(<div key={`p-${i}`} className="h-12" />);
    for (let d = 1; d <= daysInMonth; d++) {
      const dObj = new Date(year, month, d), isSel = isSameDay(dObj, selectedDate), hasP = appointments.some(a => isSameDay(parseDate(a.start_time), dObj) && a.status === 'pending');
      days.push(
        <div key={d} className="relative flex items-center justify-center h-12 cursor-pointer" onClick={() => setSelectedDate(dObj)}>
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${isSel ? 'bg-[#007AFF] text-white' : isToday(dObj) ? 'text-[#007AFF] bg-[#007AFF]/10' : 'text-black'}`}>{d}</div>
          {hasP && !isSel && <div className="absolute bottom-1 w-1.5 h-1.5 bg-orange-500 rounded-full" />}
        </div>
      );
    }
    return (
      <div className="bg-white rounded-[16px] p-2 shadow-sm border border-slate-100 mx-5 mt-2">
        <div className="flex justify-between items-center px-4 py-2">
          <span className="font-bold text-lg capitalize">{format(currentMonth, 'LLLL yyyy', { locale: ru })}</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft /></button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center py-2 text-[11px] font-bold text-[#8E8E93]">{['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map(d => <span key={d}>{d}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-1">{days}</div>

        <button
          onClick={() => setIsAddingBlock(true)}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#F2F2F7] text-[#007AFF] rounded-xl text-[14px] font-bold active:scale-95 transition-all"
        >
          <Coffee size={18} /> Заблокировать время
        </button>
      </div>
    );
  };

  const renderStats = () => {
    if (!stats) return <div className="text-center py-20"><Loader2 className="animate-spin mx-auto text-[#007AFF]" /></div>;
    return (
      <div className="px-5 space-y-4 animate-in fade-in duration-500">
        <div className="bg-gradient-to-br from-[#007AFF] to-[#0055FF] rounded-[24px] p-6 text-white shadow-lg">
          <div className="flex items-center justify-between opacity-80 mb-1"><span className="text-[13px] font-bold uppercase">Выручка</span><Wallet size={20} /></div>
          <div className="text-[34px] font-extrabold">{stats.total_revenue?.toLocaleString() || 0} ₸</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-[20px] border shadow-sm flex flex-col justify-between h-24">
             <div className="text-[#34C759] font-bold text-[12px]">ГОТОВО</div>
             <span className="text-[24px] font-black">{stats.completed_count || 0}</span>
          </div>
          <div className="bg-white p-4 rounded-[20px] border shadow-sm flex flex-col justify-between h-24">
             <div className="text-[#FF3B30] font-bold text-[12px]">ОТМЕНЫ</div>
             <span className="text-[24px] font-black">{stats.canceled_count || 0}</span>
          </div>
        </div>

        {/* Секция популярных услуг */}
        <div className="bg-white p-5 rounded-[24px] border shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={20} className="text-[#FF9500]" />
            <h3 className="font-bold text-[17px]">Популярные услуги</h3>
          </div>
          <div className="space-y-3">
            {stats.top_services && stats.top_services.length > 0 ? (
              stats.top_services.map((s: any, i: number) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[13px] font-bold text-[#8E8E93]">
                      {i + 1}
                    </div>
                    <span className="text-[15px] font-medium text-black">{s.title}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-[15px]">{s.count}</span>
                    <span className="text-[11px] text-[#8E8E93]">записей</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-[#8E8E93] py-4 text-sm">Нет данных по услугам</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen">
      {/* Шапка */}
      <div className="px-5 flex justify-between items-end">
        <h1 className="text-[32px] font-extrabold">{view === 'stats' ? 'Финансы' : 'Записи'}</h1>
        <div className="flex gap-2">
          {view !== 'stats' && <button onClick={() => setIsAdding(true)} className="w-10 h-10 bg-[#007AFF] text-white rounded-full flex items-center justify-center shadow-lg"><Plus /></button>}
          <button onClick={loadAllData} className="w-10 h-10 bg-white border rounded-full flex items-center justify-center shadow-sm"><RefreshCcw className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {/* Переключатель вкладок */}
      <div className="px-5">
        <div className="flex bg-[#E3E3E8] p-1 rounded-xl shadow-sm">
          <button onClick={() => setView('agenda')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg ${view === 'agenda' ? 'bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Список</button>
          <button onClick={() => setView('calendar')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg ${view === 'calendar' ? 'bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Календарь</button>
          <button onClick={() => setView('stats')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg ${view === 'stats' ? 'bg-white shadow-sm' : 'text-[#8E8E93]'}`}>Финансы</button>
        </div>
      </div>

      {view === 'agenda' && (
        <div className="px-5 space-y-4">
          <div className="flex bg-white/50 p-1 rounded-xl shadow-sm">
            <button onClick={() => setFilter('pending')} className={`flex-1 py-2 text-[15px] font-bold rounded-lg ${filter === 'pending' ? 'text-[#007AFF] bg-white' : 'text-[#8E8E93]'}`}>Ожидают</button>
            <button onClick={() => setFilter('history')} className={`flex-1 py-2 text-[15px] font-bold rounded-lg ${filter === 'history' ? 'text-[#007AFF] bg-white' : 'text-[#8E8E93]'}`}>История</button>
          </div>
          <div className="space-y-3">
             {filteredApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} onDeleteBlock={(id) => setBlockToDelete(id)} />)}
          </div>
        </div>
      )}

      {view === 'calendar' && (
        <div className="space-y-4">
          {renderCalendar()}
          <div className="px-5 space-y-3">
            <h2 className="text-[13px] font-bold text-[#8E8E93] uppercase px-1">{format(selectedDate, 'd MMMM', { locale: ru })}</h2>
            {calendarDayApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} onDeleteBlock={(id) => setBlockToDelete(id)} />)}
          </div>
        </div>
      )}

      {view === 'stats' && renderStats()}

      {/* Модалка записи */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-[#F2F2F7] w-full max-w-md rounded-t-[24px] h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            <div className="p-4 border-b flex justify-between items-center bg-white">
              <button onClick={() => setIsAdding(false)} className="text-[#007AFF]">Отмена</button>
              <span className="font-bold">Новый клиент</span>
              <button onClick={handleManualAdd} className="font-bold text-[#007AFF]">{isSubmitting ? "..." : "Записать"}</button>
            </div>
            <div className="px-5 mt-6 space-y-4">
               <div className="bg-white p-4 rounded-xl space-y-3"><input placeholder="Имя" className="w-full text-lg outline-none" value={newApp.client_name} onChange={e => setNewApp({...newApp, client_name: e.target.value})} /><PhoneInput value={newApp.client_phone} onChange={val => setNewApp({...newApp, client_phone: val})} /></div>
               {/* Оставляем эти поля для ручного добавления, но они станут необязательными для сервера */}
               <div className="grid grid-cols-2 gap-3"><input placeholder="Кличка (если есть)" className="bg-white p-3 rounded-xl outline-none text-sm" value={newApp.pet_name} onChange={e => setNewApp({...newApp, pet_name: e.target.value})} /><input placeholder="Порода" className="bg-white p-3 rounded-xl outline-none text-sm" value={newApp.pet_breed} onChange={e => setNewApp({...newApp, pet_breed: e.target.value})} /></div>
               <select className="w-full bg-white p-3 rounded-xl outline-none" value={newApp.service_id} onChange={e => setNewApp({...newApp, service_id: e.target.value})}><option value="">Выбрать услугу</option>{services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
               <div className="grid grid-cols-2 gap-3"><input type="date" className="p-3 rounded-xl bg-white outline-none" value={newApp.date} onChange={e => setNewApp({...newApp, date: e.target.value})} /><input type="time" className="p-3 rounded-xl bg-white outline-none" value={newApp.time} onChange={e => setNewApp({...newApp, time: e.target.value})} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Модалки перерыва и удаления (без изменений) */}
      {isAddingBlock && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white w-full max-w-sm p-6 rounded-[24px] shadow-2xl animate-in zoom-in-95">
                <h3 className="text-xl font-bold text-center mb-4 flex items-center justify-center gap-2"><Coffee /> Перерыв</h3>
                <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-[#8E8E93] uppercase ml-1">Начало</label>
                        <input type="time" className="w-full bg-[#F2F2F7] p-3 rounded-xl outline-none font-bold" value={newApp.time} onChange={e => setNewApp({...newApp, time: e.target.value})} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-[#8E8E93] uppercase ml-1">Длительность (мин)</label>
                        <select className="w-full bg-[#F2F2F7] p-3 rounded-xl outline-none font-bold" value={newApp.duration_minutes} onChange={e => setNewApp({...newApp, duration_minutes: Number(e.target.value)})}>
                            {[15, 30, 60, 90, 120, 180].map(v => <option key={v} value={v}>{v} мин</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => setIsAddingBlock(false)} className="flex-1 py-3 bg-[#F2F2F7] rounded-xl font-bold">Отмена</button>
                        <button onClick={handleAddBlock} disabled={isSubmitting} className="flex-1 py-3 bg-[#007AFF] text-white rounded-xl font-bold">Ок</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {blockToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white w-full max-w-sm p-6 rounded-[24px] shadow-2xl">
                <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={24} /></div>
                <h3 className="text-xl font-bold text-center mb-2 text-black">Удалить перерыв?</h3>
                <div className="flex gap-3 mt-6">
                    <button onClick={() => setBlockToDelete(null)} className="flex-1 py-3 bg-[#F2F2F7] rounded-xl font-bold">Отмена</button>
                    <button onClick={confirmDeleteBlock} className="flex-1 py-3 bg-[#FF3B30] text-white rounded-xl font-bold">Удалить</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

function AppointmentCard({ app, onStatusUpdate, onDeleteBlock }: { app: Appointment, onStatusUpdate: (id: string, s: Appointment['status']) => void, onDeleteBlock: (id: string) => void }) {
  const [ex, setEx] = useState(false);

  if (app.status === 'blocked') {
      const bTime = parseDate(app.start_time);
      return (
        <div className="bg-[#E3E3E8] rounded-2xl border border-slate-200 p-4 flex items-center justify-between opacity-80">
            <div className="flex items-center gap-4">
                <div className="font-bold text-lg w-12 text-center text-[#8E8E93]">{format(bTime, 'HH:mm')}</div>
                <div className="w-[1px] h-8 bg-slate-300" />
                <div className="flex items-center gap-2 text-[#8E8E93] font-bold"><Coffee size={18} /> Перерыв</div>
            </div>
            <button onClick={() => onDeleteBlock(app.id)} className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-[#FF3B30] shadow-sm active:scale-90 transition-transform"><Trash2 size={16} /></button>
        </div>
      );
  }

  const sInfo = Array.isArray(app.services) ? app.services[0] : app.services;
  const sTime = parseDate(app.start_time);
  const cfg: any = {
    pending: { bg: '#FFF4D6', text: '#855E00', lbl: 'НОВАЯ' },
    confirmed: { bg: '#E3F2FF', text: '#007AFF', lbl: 'ПРИНЯТА' },
    completed: { bg: '#E8F5E9', text: '#2E7D32', lbl: 'ГОТОВО' },
    canceled: { bg: '#FFEBEE', text: '#C62828', lbl: 'ОТМЕНА' }
  }[app.status];

  const cleanPhone = app.client_phone?.replace(/[^0-9+]/g, '') || '';

  let tgUsername = null;
  if (app.client_tg_user) {
    try {
        const u = typeof app.client_tg_user === 'string' ? JSON.parse(app.client_tg_user) : app.client_tg_user;
        tgUsername = u?.username;
    } catch(e) {}
  }
  const chatLink = tgUsername ? `https://t.me/${tgUsername}` : `https://wa.me/${cleanPhone}`;

  // ИЗМЕНЕНИЕ: Динамическое определение заголовка (Кличка животного или Имя клиента)
  const displayTitle = app.metadata?.petName || app.client_name || 'Без имени';
  const displaySubtitle = app.metadata?.petBreed ? app.metadata.petBreed : 'Клиент';

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-4 flex items-center justify-between" onClick={() => setEx(!ex)}>
        <div className="flex items-center gap-4">
          <div className="text-center shrink-0 w-12">
            <div className="font-bold text-lg">{format(sTime, 'HH:mm')}</div>
            <div className="text-[10px] uppercase text-slate-400">{format(sTime, 'd MMM', { locale: ru })}</div>
          </div>
          <div className="w-[1px] h-8 bg-slate-100" />
          <div>
            {/* ИЗМЕНЕНИЕ: Выводим динамический заголовок */}
            <div className="font-bold text-[15px] text-black">{displayTitle}</div>
            <div className="text-[13px] font-medium text-slate-400 mt-0.5">{sInfo?.title || 'Услуга'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.lbl}</span>
          <ChevronDown size={16} className={ex ? "rotate-180 text-[#007AFF]" : "text-[#8E8E93]"} />
        </div>
      </div>

      {ex && (
        <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-1">
          <div className="pt-3 border-t flex gap-4">
            <div className="w-16 h-16 rounded-[14px] bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
              {sInfo?.image_url ? <img src={sInfo.image_url} className="w-full h-full object-cover" /> : <User className="text-slate-300" size={28} />}
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="font-bold text-sm text-black">{displaySubtitle}</div>
              <div className="text-xs font-bold text-[#007AFF] bg-[#007AFF]/10 p-2 rounded-lg inline-block">{sInfo?.title} • {sInfo?.price} ₸</div>
              <div className="text-[13px] font-medium text-slate-500">Владелец: {app.client_name}</div>
            </div>
          </div>

          {app.client_phone && (
            <div className="flex gap-2">
               <button onClick={() => { navigator.clipboard.writeText(app.client_phone); toast.success("Скопировано"); window.location.href=`tel:${cleanPhone}`; }} className="flex-1 bg-slate-50 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm text-black active:scale-95 transition-transform"><Copy size={16} className="text-[#8E8E93]"/> {app.client_phone}</button>
               <a href={chatLink} target="_blank" className="w-14 flex items-center justify-center rounded-xl bg-[#E3F2FF] text-[#007AFF] active:scale-95 transition-transform"><MessageSquare size={20}/></a>
            </div>
          )}

          <div className="flex gap-2 border-t pt-3">
            {app.status === 'pending' && <><button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="flex-1 bg-[#007AFF] text-white py-3 rounded-xl font-bold active:scale-95 shadow-sm">Принять</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="flex-1 bg-[#FFEBEE] text-[#C62828] py-3 rounded-xl font-bold active:scale-95">Отмена</button></>}
            {app.status === 'confirmed' && <><button onClick={() => onStatusUpdate(app.id, 'completed')} className="flex-1 bg-[#34C759] text-white py-3 rounded-xl font-bold active:scale-95 shadow-sm flex items-center justify-center gap-2"><CheckCircle2 size={18}/> Готово</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="flex-1 bg-[#FFEBEE] text-[#C62828] py-3 rounded-xl font-bold active:scale-95">Отмена</button></>}
          </div>
        </div>
      )}
    </div>
  );
}