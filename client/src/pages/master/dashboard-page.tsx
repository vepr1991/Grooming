import React, { useEffect, useState } from "react";
import { format, addMonths, subMonths, isToday, isValid, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ChevronDown,
  Phone,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  PawPrint,
  RefreshCcw,
  Scissors
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";

type Appointment = {
  id: string;
  client_name: string;
  client_phone: string;
  pet_name: string;
  pet_breed: string;
  start_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'canceled';
  services: any;
};

export function MasterDashboardPage() {
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda');
  const [filter, setFilter] = useState<'pending' | 'history'>('pending');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const salonId = localStorage.getItem("salon_id");

  const fetchAppointments = async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`*, services (title, price, duration_minutes)`)
        .eq('salon_id', salonId)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err: any) {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [salonId]);

  const filteredApps = appointments.filter(app => {
    if (filter === 'pending') return app.status === 'pending';
    if (filter === 'history') return ['confirmed', 'completed', 'canceled'].includes(app.status);
    return true;
  });

  const calendarPendingApps = appointments.filter(app =>
    isSameDay(new Date(app.start_time), selectedDate) && app.status === 'pending'
  );

  const updateStatus = async (id: string, newStatus: Appointment['status']) => {
    const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
    if (error) {
      toast.error("Ошибка обновления");
    } else {
      toast.success("Статус изменен");
      fetchAppointments();
    }
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const days = [];

    for (let i = 0; i < offset; i++) days.push(<div key={`prev-${i}`} className="h-12"></div>);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const isSel = isSameDay(dateObj, selectedDate);
      const hasPending = appointments.some(a => isSameDay(new Date(a.start_time), dateObj) && a.status === 'pending');
      const isCurrToday = isToday(dateObj);

      days.push(
        <div
          key={d}
          className="relative flex items-center justify-center h-12 cursor-pointer"
          onClick={() => setSelectedDate(dateObj)}
        >
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
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen">
      <div className="px-5">
        <div className="flex justify-between items-end mb-4">
          <h1 className="text-[32px] font-extrabold tracking-tight text-black">Записи</h1>
          <button onClick={fetchAppointments} className="p-2 text-[#007AFF] active:opacity-50 transition-opacity">
            <RefreshCcw size={22} className={loading ? "animate-spin" : ""}/>
          </button>
        </div>

        {/* Главный переключатель (Список / Календарь) — ТЕПЕРЬ ТАКОЙ ЖЕ КАК НИЖНИЙ */}
        <div className="flex w-full bg-white/50 p-1 rounded-xl border border-slate-200 mb-6 shadow-sm">
          <button
            onClick={() => setView('agenda')}
            className={`flex-1 py-2 text-[15px] font-bold rounded-lg transition-all ${view === 'agenda' ? 'text-[#007AFF] bg-white shadow-sm' : 'text-[#8E8E93]'}`}
          >
            Список
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex-1 py-2 text-[15px] font-bold rounded-lg transition-all ${view === 'calendar' ? 'text-[#007AFF] bg-white shadow-sm' : 'text-[#8E8E93]'}`}
          >
            Календарь
          </button>
        </div>

        {view === 'agenda' && (
          /* Переключатель фильтров (Ожидают / История) */
          <div className="flex w-full bg-white/50 p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setFilter('pending')}
              className={`flex-1 py-2 text-[15px] font-bold rounded-lg transition-all ${filter === 'pending' ? 'text-[#007AFF] bg-white shadow-sm' : 'text-[#8E8E93]'}`}
            >
              Ожидают
            </button>
            <button
              onClick={() => setFilter('history')}
              className={`flex-1 py-2 text-[15px] font-bold rounded-lg transition-all ${filter === 'history' ? 'text-[#007AFF] bg-white shadow-sm' : 'text-[#8E8E93]'}`}
            >
              История
            </button>
          </div>
        )}
      </div>

      {view === 'agenda' ? (
        <div className="px-5 space-y-3">
          {loading ? (
            <div className="text-center py-20 text-[#8E8E93]">Загрузка...</div>
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-20 text-[#8E8E93] text-[17px]">Записей нет</div>
          ) : (
            filteredApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} />)
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {renderCalendar()}
          <div className="px-5 pt-2">
            <h2 className="text-[13px] font-bold text-[#8E8E93] uppercase mb-3 px-1">Ожидают на {format(selectedDate, 'd MMMM', { locale: ru })}</h2>
            <div className="space-y-3">
              {calendarPendingApps.length === 0 ? (
                <div className="bg-white/50 rounded-[16px] p-8 text-center text-[#8E8E93] text-[15px] border border-dashed">
                  На этот день новых записей нет
                </div>
              ) : (
                calendarPendingApps.map(app => <AppointmentCard key={app.id} app={app} onStatusUpdate={updateStatus} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Вспомогательный компонент карточки (оставил без изменений)
function AppointmentCard({ app, onStatusUpdate }: { app: Appointment, onStatusUpdate: (id: string, s: Appointment['status']) => void }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig: any = {
    pending: { bg: '#FFF4D6', text: '#855E00', label: 'ОЖИДАЕТ' },
    confirmed: { bg: '#E3F2FF', text: '#007AFF', label: 'ПРИНЯТА' },
    completed: { bg: '#E8F5E9', text: '#2E7D32', label: 'ГОТОВО' },
    canceled: { bg: '#FFEBEE', text: '#C62828', label: 'ОТМЕНА' },
  };

  const config = statusConfig[app.status] || statusConfig.pending;
  const startTime = new Date(app.start_time);
  const isDateValid = isValid(startTime);
  const formattedDate = isDateValid ? format(startTime, 'd MMM', { locale: ru }) : '---';
  const timeStr = isDateValid ? format(startTime, 'HH:mm') : '--:--';
  const serviceInfo = Array.isArray(app.services) ? app.services[0] : app.services;

  return (
    <div className={`bg-white rounded-[16px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden ${expanded ? 'shadow-md' : ''}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer active:bg-zinc-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex flex-col items-center justify-center shrink-0 w-[52px]">
            <span className="text-[17px] font-bold text-black">{timeStr}</span>
            <span className={`text-[10px] font-bold uppercase ${isDateValid && isToday(startTime) ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}>
              {isDateValid && isToday(startTime) ? 'Сегодня' : formattedDate}
            </span>
          </div>
          <div className="w-[1px] h-10 bg-[#E5E5EA] shrink-0"></div>

          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-bold text-black tracking-tight truncate">{app.pet_name}</h3>
            <p className="text-[13px] text-[#8E8E93] truncate">{serviceInfo?.title || 'Услуга...'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2 shrink-0">
           <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-tight text-center min-w-[70px]"
                 style={{ backgroundColor: config.bg, color: config.text }}>
             {config.label}
           </span>
           <ChevronDown size={18} className={`text-[#C7C7CC] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 bg-white">
          <div className="flex gap-4 py-3 border-t border-[#F2F2F7]">
            <div className="w-20 h-20 rounded-2xl bg-[#F2F2F7] flex items-center justify-center shrink-0">
                <Scissors size={28} className="text-[#8E8E93] opacity-20" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[15px] font-bold text-black truncate">{app.pet_breed || "Порода не указана"}</p>
              <div className="bg-[#F2F2F7] rounded-xl p-2.5">
                <p className="text-[13px] font-semibold text-black truncate">{serviceInfo?.title}</p>
                <p className="text-[11px] text-[#8E8E93]">{serviceInfo?.duration_minutes} мин • {serviceInfo?.price} ₸</p>
              </div>
              <p className="text-[13px] text-[#8E8E93] pt-1">Владелец: {app.client_name}</p>

              <div className="flex items-center gap-2 mt-3">
                <a href={`tel:${app.client_phone}`} className="flex-1 flex items-center justify-center gap-2 bg-[#E8F2FF] text-[#007AFF] py-2 rounded-full text-[13px] font-bold active:opacity-60">
                  <Phone size={14} /> Вызов
                </a>
                <button className="flex-1 flex items-center justify-center gap-2 bg-[#F2F2F7] text-[#8E8E93] py-2 rounded-full text-[13px] font-bold active:opacity-60">
                  <MessageSquare size={14} /> Чат
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[#F2F2F7]">
            {app.status === 'pending' ? (
                <>
                  <button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="h-11 bg-[#007AFF] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all">Принять</button>
                  <button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all">Отмена</button>
                </>
            ) : app.status === 'confirmed' ? (
                <>
                  <button onClick={() => onStatusUpdate(app.id, 'completed')} className="h-11 bg-[#2E7D32] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all">Завершить</button>
                  <button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all">Отмена</button>
                </>
            ) : (
                <div className="col-span-2 text-center py-2 text-[13px] text-[#8E8E93] font-medium italic">
                  Запись обработана (архив)
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}