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
  Trash2
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

  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<'booking' | 'block'>('booking');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleManualAdd = async () => {
    if (!salonId) return;
    setIsSubmitting(true);

    try {
        if (addMode === 'booking') {
             if (!newApp.client_name || !newApp.service_id || !newApp.client_phone) {
                 toast.error("Заполните поля"); setIsSubmitting(false); return;
             }
             const selectedS = services.find(s => s.id === newApp.service_id);
             if (!selectedS) return;

             await api.createBooking({
                salonId,
                service: { id: selectedS.id, title: selectedS.title, duration_minutes: selectedS.duration_minutes },
                date: newApp.date,
                time: newApp.time,
                client: { name: newApp.client_name, phone: newApp.client_phone },
                pet: { name: newApp.pet_name, petBreed: newApp.pet_breed }
              });
              toast.success("Записано!");
        } else {
            await api.blockSlot({
                salonId,
                date: newApp.date,
                time: newApp.time,
                duration_minutes: Number(newApp.duration_minutes),
                reason: "Перерыв"
            });
            toast.success("Время заблокировано ☕️");
        }

      setIsAdding(false);
      fetchAppointments();
    } catch (e: any) {
        if (e.message && e.message.includes("400")) toast.error("Нерабочее время! ⚠️");
        else if (e.message && e.message.includes("409")) toast.error("Время занято! ⚠️");
        else toast.error("Ошибка");
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

  const confirmDeleteBlock = async () => {
      if (!blockToDelete) return;
      try {
          await api.updateAppointmentStatus(blockToDelete, 'canceled');
          toast.success("Перерыв удален");
          fetchAppointments();
      } catch(e) { toast.error("Ошибка удаления"); }
      finally { setBlockToDelete(null); }
  };

  const filteredApps = appointments.filter(app => {
      if (filter === 'pending') {
          return ['pending', 'confirmed', 'blocked'].includes(app.status);
      } else {
          return ['completed', 'canceled'].includes(app.status);
      }
  }).sort((a, b) => {
      const tA = parseDate(a.start_time).getTime();
      const tB = parseDate(b.start_time).getTime();
      return filter === 'pending' ? tA - tB : tB - tA;
  });

  const calendarPendingApps = appointments.filter(app => isSameDay(parseDate(app.start_time), selectedDate) && app.status !== 'canceled');

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen">
      <div className="px-5 flex justify-between items-end mb-4">
        <h1 className="text-[32px] font-extrabold">{view === 'stats' ? 'Финансы' : 'Записи'}</h1>
        <div className="flex gap-2">
          {view !== 'stats' && <button onClick={() => setIsAdding(true)} className="w-10 h-10 bg-[#007AFF] text-white rounded-full flex items-center justify-center shadow-lg"><Plus /></button>}
          <button onClick={loadAllData} className="w-10 h-10 bg-white border rounded-full flex items-center justify-center shadow-sm"><RefreshCcw className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

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
            {loading ? <p className="text-center py-10">Загрузка...</p> : filteredApps.map(app => (
              <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} onDeleteBlock={(id) => setBlockToDelete(id)} />
            ))}
          </div>
        </div>
      )}

      {/* Модалки и остальное (дизайн не меняем) */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-[#F2F2F7] w-full max-w-md rounded-t-[24px] h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            <div className="p-4 border-b flex justify-between items-center bg-white">
              <button onClick={() => setIsAdding(false)} className="text-[#007AFF]">Отмена</button>
              <span className="font-bold">{addMode === 'booking' ? 'Новая запись' : 'Перерыв'}</span>
              <button onClick={handleManualAdd} className="font-bold text-[#007AFF]">{isSubmitting ? "..." : "Готово"}</button>
            </div>
            <div className="px-5 pt-4 pb-2">
                <div className="flex bg-[#E3E3E8] p-1 rounded-xl">
                    <button onClick={() => setAddMode('booking')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg transition-all ${addMode === 'booking' ? 'bg-white shadow-sm text-black' : 'text-[#8E8E93]'}`}>Клиент</button>
                    <button onClick={() => setAddMode('block')} className={`flex-1 py-1.5 text-[13px] font-bold rounded-lg transition-all ${addMode === 'block' ? 'bg-white shadow-sm text-black' : 'text-[#8E8E93]'}`}>Перерыв</button>
                </div>
            </div>
            <div className="px-5 mt-2 space-y-4 overflow-y-auto">
              {addMode === 'booking' ? (
                  <>
                    <div className="bg-white p-4 rounded-xl space-y-3"><input placeholder="Имя" className="w-full text-lg outline-none" value={newApp.client_name} onChange={e => setNewApp({...newApp, client_name: e.target.value})} /><PhoneInput value={newApp.client_phone} onChange={val => setNewApp({...newApp, client_phone: val})} /></div>
                    <div className="grid grid-cols-2 gap-3"><div className="bg-white p-3 rounded-xl"><input placeholder="Кличка" className="w-full outline-none" value={newApp.pet_name} onChange={e => setNewApp({...newApp, pet_name: e.target.value})} /></div><div className="bg-white p-3 rounded-xl"><input placeholder="Порода" className="w-full outline-none" value={newApp.pet_breed} onChange={e => setNewApp({...newApp, pet_breed: e.target.value})} /></div></div>
                    <div className="bg-white p-3 rounded-xl"><select className="w-full outline-none" value={newApp.service_id} onChange={e => setNewApp({...newApp, service_id: e.target.value})}><option value="">Выбрать услугу</option>{services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
                  </>
              ) : (
                  <div className="bg-white p-4 rounded-xl space-y-3">
                      <label className="text-xs font-bold text-gray-400 uppercase">Длительность</label>
                      <div className="flex gap-2">
                          {[30, 60, 90, 120].map(min => (
                              <button key={min} onClick={() => setNewApp({...newApp, duration_minutes: min})} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${newApp.duration_minutes === min ? 'bg-[#007AFF] text-white border-[#007AFF]' : 'border-slate-100 text-black'}`}>{min} мин</button>
                          ))}
                      </div>
                  </div>
              )}
              <div className="grid grid-cols-2 gap-3"><input type="date" className="p-3 rounded-xl outline-none text-center bg-white" value={newApp.date} onChange={e => setNewApp({...newApp, date: e.target.value})} /><input type="time" className="p-3 rounded-xl outline-none text-center bg-white" value={newApp.time} onChange={e => setNewApp({...newApp, time: e.target.value})} /></div>
            </div>
          </div>
        </div>
      )}

      {blockToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm p-6 rounded-[24px] shadow-2xl">
                <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={24} /></div>
                <h3 className="text-xl font-bold text-center mb-2">Удалить перерыв?</h3>
                <p className="text-center text-[#8E8E93] mb-6">Это время снова станет доступным для записи.</p>
                <div className="flex gap-3">
                    <button onClick={() => setBlockToDelete(null)} className="flex-1 py-3.5 bg-[#F2F2F7] text-black font-bold rounded-[16px]">Отмена</button>
                    <button onClick={confirmDeleteBlock} className="flex-1 py-3.5 bg-[#FF3B30] text-white font-bold rounded-[16px]">Удалить</button>
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
            <button onClick={() => onDeleteBlock(app.id)} className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-[#FF3B30] shadow-sm"><Trash2 size={16} /></button>
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

  // 👇 ЗАЩИТА: Добавляем ?.replace, чтобы не падать на null
  let tgUsername = null;
  if (app.client_tg_user) {
    try {
        const u = typeof app.client_tg_user === 'string' ? JSON.parse(app.client_tg_user) : app.client_tg_user;
        tgUsername = u?.username;
    } catch(e) {}
  }

  const cleanPhone = app.client_phone?.replace(/[^0-9+]/g, '') || '';
  const chatLink = tgUsername ? `https://t.me/${tgUsername}` : `https://wa.me/${cleanPhone}`;
  const isTelegram = !!tgUsername;

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
            <div className="font-bold">{app.pet_name || 'Без имени'}</div>
            <div className="text-xs text-slate-400">{sInfo?.title || 'Услуга'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.lbl}</span>
          <ChevronDown size={16} className={ex ? "rotate-180" : ""} />
        </div>
      </div>
      {ex && (
        <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-1">
          <div className="pt-3 border-t flex gap-4">
            <div className="w-16 h-16 rounded-xl bg-slate-50 overflow-hidden shrink-0">
              {sInfo?.image_url ? <img src={sInfo.image_url} className="w-full h-full object-cover" /> : <Scissors className="m-auto mt-4 opacity-10" />}
            </div>
            <div className="space-y-1">
              <div className="font-bold text-sm">{app.pet_breed || 'Порода не указана'}</div>
              <div className="text-xs bg-slate-50 p-2 rounded-lg">{sInfo?.title} • {sInfo?.price} ₸</div>
              <div className="text-xs text-slate-400">Владелец: {app.client_name}</div>
            </div>
          </div>

          {app.client_phone && (
            <div className="flex gap-2">
               <button onClick={() => { navigator.clipboard.writeText(app.client_phone); toast.success("Скопировано"); window.location.href=`tel:${cleanPhone}`; }} className="flex-1 bg-slate-50 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm active:scale-95"><Copy size={14}/> {app.client_phone}</button>
               <a href={chatLink} target="_blank" className={`w-14 flex items-center justify-center rounded-xl active:scale-95 ${isTelegram ? 'bg-[#E3F2FF] text-[#007AFF]' : 'bg-[#E8F5E9] text-[#2E7D32]'}`}><MessageSquare size={20}/></a>
            </div>
          )}

          <div className="flex gap-2 border-t pt-3">
            {app.status === 'pending' && (
              <><button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="flex-1 bg-[#007AFF] text-white py-2 rounded-xl font-bold">Принять</button>
              <button onClick={() => onStatusUpdate(app.id, 'canceled')} className="flex-1 bg-slate-50 text-red-500 py-2 rounded-xl font-bold">Отмена</button></>
            )}
            {app.status === 'confirmed' && (
              <><button onClick={() => onStatusUpdate(app.id, 'completed')} className="flex-1 bg-green-600 text-white py-2 rounded-xl font-bold">Готово</button>
              <button onClick={() => onStatusUpdate(app.id, 'canceled')} className="flex-1 bg-slate-50 text-red-500 py-2 rounded-xl font-bold">Отмена</button></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}