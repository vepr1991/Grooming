import React, { useEffect, useState } from 'react';
import { useBookingStore } from '../store/useBookingStore';
import { getAvailability } from '../lib/api';
import { format, addDays, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, ChevronLeft } from 'lucide-react';

export const DateTimeSelector: React.FC = () => {
  const { masterId, selectedService, setDateTime, setStep } = useBookingStore();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Генерируем список дней (сегодня + 13 дней)
  const days = Array.from({ length: 14 }).map((_, i) => addDays(new Date(), i));

  useEffect(() => {
    if (!selectedService || !masterId) return;

    const fetchSlots = async () => {
      setLoading(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const data = await getAvailability(masterId, selectedService.id, dateStr);
        setSlots(data);
      } catch (err) {
        console.error("Ошибка загрузки слотов:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [selectedDate, selectedService, masterId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => setStep('service')} className="p-2 -ml-2 opacity-60 hover:opacity-100">
            <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-bold">Дата и время</h2>
      </div>

      {/* Выбор даты (лента) */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={`flex flex-col items-center min-w-[65px] p-3 rounded-2xl border transition-all ${
                isSelected
                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                : 'bg-surface-dark border-border-dark text-text-secondary hover:border-primary/50'
              }`}
            >
              <span className="text-[10px] uppercase font-bold opacity-70">{format(day, 'EEE', { locale: ru })}</span>
              <span className="text-lg font-bold">{format(day, 'd')}</span>
            </button>
          );
        })}
      </div>

      {/* Выбор времени (сетка) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary ml-1">
            <Clock size={16} /> <span>Доступные слоты</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 bg-surface-dark rounded-xl animate-pulse"></div>)}
          </div>
        ) : slots.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <button
                key={slot}
                onClick={() => setDateTime(format(selectedDate, 'yyyy-MM-dd'), slot)}
                className="py-3 px-2 bg-surface-dark border border-border-dark rounded-xl font-bold hover:border-primary hover:text-primary transition-all active:scale-95 text-center text-sm"
              >
                {format(new Date(slot), 'HH:mm')}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-surface-dark/30 rounded-3xl border border-dashed border-border-dark">
            <p className="opacity-40 text-sm">На этот день нет свободных окошек</p>
          </div>
        )}
      </div>
    </div>
  );
};