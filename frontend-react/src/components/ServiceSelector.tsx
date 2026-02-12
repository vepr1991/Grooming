import React, { useEffect, useState } from 'react';
import { useBookingStore } from '../store/useBookingStore';
import { getServices } from '../lib/api';
import { Clock, Tag, ChevronRight } from 'lucide-react';

export const ServiceSelector: React.FC = () => {
  const { masterId, setService } = useBookingStore();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Если ID мастера нет в сторе, используем твой по умолчанию
    const id = masterId || '579214945';

    getServices(id)
      .then((data) => {
        console.log("Услуги получены:", data);
        setServices(data);
      })
      .catch((err) => console.error("Ошибка при загрузке услуг:", err))
      .finally(() => setLoading(false));
  }, [masterId]);

  if (loading) return (
    <div className="flex flex-col gap-4 p-4 animate-pulse">
        {[1,2,3].map(i => <div key={i} className="h-20 bg-surface-dark rounded-2xl w-full"></div>)}
    </div>
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <h2 className="text-xl font-bold mb-4 ml-1">Выберите услугу</h2>
      {services.length === 0 ? (
          <p className="text-center py-10 opacity-50">Услуги не найдены</p>
      ) : (
        services.map((service: any) => (
            <button
              key={service.id}
              onClick={() => setService(service)}
              className="w-full flex items-center justify-between p-4 bg-surface-dark border border-border-dark rounded-2xl hover:border-primary transition-all active:scale-[0.98] text-left group"
            >
              <div className="space-y-1">
                <div className="font-bold text-lg group-hover:text-primary transition-colors">{service.name}</div>
                <div className="flex gap-4 text-xs text-text-secondary">
                  {/* ИСПОЛЬЗУЕМ duration_min ИЗ ТВОЕЙ БАЗЫ */}
                  <span className="flex items-center gap-1"><Clock size={12}/> {service.duration_min} мин</span>
                  <span className="flex items-center gap-1"><Tag size={12}/> {service.price} ₸</span>
                </div>
              </div>
              <ChevronRight className="text-text-secondary group-hover:translate-x-1 transition-transform" />
            </button>
          ))
      )}
    </div>
  );
};