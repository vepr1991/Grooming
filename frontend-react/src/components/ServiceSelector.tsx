import React, { useEffect, useState } from 'react';
import { useBookingStore } from '../store/useBookingStore';
import { getServices } from '../lib/api';
import { Clock, Tag, ChevronRight } from 'lucide-react';

export const ServiceSelector: React.FC = () => {
  const { masterId, setService } = useBookingStore();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // В реальности masterId придет из ссылки Telegram (startapp)
    // Для теста используем твой ID или любой существующий в базе
    const id = masterId || '579214945';

    getServices(id)
      .then(setServices)
      .finally(() => setLoading(false));
  }, [masterId]);

  if (loading) return <div className="p-10 text-center animate-pulse">Загрузка услуг...</div>;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold mb-4">Выберите услугу</h2>
      {services.map((service: any) => (
        <button
          key={service.id}
          onClick={() => setService(service)}
          className="w-full flex items-center justify-between p-4 bg-surface-dark border border-border-dark rounded-2xl hover:border-primary transition-all active:scale-[0.98] text-left"
        >
          <div className="space-y-1">
            <div className="font-bold text-lg">{service.name}</div>
            <div className="flex gap-4 text-xs text-text-secondary">
              <span className="flex items-center gap-1"><Clock size={12}/> {service.duration} мин</span>
              <span className="flex items-center gap-1"><Tag size={12}/> {service.price} ₸</span>
            </div>
          </div>
          <ChevronRight className="text-text-secondary" />
        </button>
      ))}
    </div>
  );
};