import React, { useEffect, useState } from "react";
import { Plus, Trash2, ChevronDown, Scissors, Image as ImageIcon, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";

// 👇 URL ТВОЕГО БЕКЕНДА
const BACKEND_URL = "https://grooming-tma.onrender.com";

type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
  description?: string;
  image_url?: string;
};

export function MasterServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false); // Лоадер при отправке

  const [newService, setNewService] = useState<Partial<Service>>({
    title: "",
    price: undefined,
    duration_minutes: 60,
    description: "",
    image_url: ""
  });

  const salonId = localStorage.getItem("salon_id");

  const fetchServices = async () => {
    if (!salonId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Ошибка загрузки прайса");
    } else {
      setServices(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchServices();
  }, [salonId]);

  const handleAdd = async () => {
    if (!newService.title || !newService.price) {
      toast.error("Название и цена обязательны");
      return;
    }

    setSubmitting(true);
    // const toastId = toast.loading("Создаем услугу...");

    try {
      const payload = {
        salon_id: salonId,
        title: newService.title,
        price: Number(newService.price),
        duration_minutes: Number(newService.duration_minutes),
        description: newService.description,
        image_url: newService.image_url // Если бекенд поддерживает, добавь это поле в Pydantic модель
      };

      // 👇 ИСПРАВЛЕНИЕ: Используем Python API
      const response = await fetch(`${BACKEND_URL}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Ошибка создания");

      toast.success("Услуга добавлена");
      setIsAdding(false);
      setNewService({ title: "", price: undefined, duration_minutes: 60, description: "" });
      fetchServices();

    } catch (e) {
      toast.error("Ошибка при создании услуги");
      console.error(e);
    } finally {
      // toast.dismiss(toastId);
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Удалить эту услугу из прайса?")) return;

    try {
      // 👇 ИСПРАВЛЕНИЕ: Используем Python API
      const response = await fetch(`${BACKEND_URL}/api/services/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error("Ошибка удаления");

      toast.success("Услуга удалена");
      // Оптимистичное обновление
      setServices(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      toast.error("Не удалось удалить услугу");
    }
  };

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen">
      <div className="px-5 flex justify-between items-end">
        <div>
          <h1 className="text-[34px] font-extrabold tracking-tight text-black mb-1">Услуги</h1>
          <p className="text-[15px] text-[#8E8E93] font-medium leading-tight">Ваш прейскурант</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="bg-[#007AFF] text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="px-5 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-[#8E8E93]">Загрузка...</div>
        ) : services.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[20px] border border-dashed border-slate-300">
            <Scissors className="h-10 w-10 mx-auto mb-2 text-slate-200" />
            <p className="text-[#8E8E93]">Ваш прайс пуст</p>
          </div>
        ) : (
          services.map((s) => (
            <ServiceCard key={s.id} service={s} onDelete={(e) => handleDelete(s.id, e)} />
          ))
        )}
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-end justify-center p-0">
          <div className="bg-[#F2F2F7] w-full max-w-md rounded-t-[24px] pb-10 overflow-hidden animate-in slide-in-from-bottom duration-300 shadow-2xl h-[92vh] flex flex-col">
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-200 bg-white/80 sticky top-0 z-10">
              <button onClick={() => setIsAdding(false)} className="text-[17px] text-[#007AFF]">Отмена</button>
              <h2 className="text-[17px] font-bold">Новая услуга</h2>
              <button onClick={handleAdd} disabled={submitting} className="text-[17px] font-bold text-[#007AFF]">
                {submitting ? <Loader2 className="animate-spin" /> : "Готово"}
              </button>
            </div>

            <div className="px-5 mt-6 space-y-5 flex-1 overflow-y-auto no-scrollbar pb-10">
              <div className="flex flex-col items-center gap-3 mb-2">
                <div className="w-32 h-32 rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden flex items-center justify-center relative">
                  {newService.image_url ? (
                    <img src={newService.image_url} className="w-full h-full object-cover" alt="Service" />
                  ) : (
                    <ImageIcon size={48} className="text-[#C7C7CC]" />
                  )}
                  {/* <div className="absolute bottom-2 right-2 bg-[#007AFF] text-white p-2 rounded-full shadow-lg">
                    <Camera size={16} />
                  </div> */}
                </div>
                {/* Временно скрыл загрузку фото, пока на бекенде нет поддержки файлов */}
                {/* <input
                  placeholder="URL фотографии"
                  className="w-full text-center text-[13px] text-[#007AFF] bg-transparent outline-none"
                  value={newService.image_url || ''}
                  onChange={e => setNewService({...newService, image_url: e.target.value})}
                /> */}
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Название услуги</label>
                <div className="bg-white rounded-[12px] p-3 border border-slate-100 shadow-sm">
                  <input
                    placeholder="Например: Полный комплекс"
                    className="w-full text-[17px] outline-none caret-[#007AFF] bg-transparent"
                    value={newService.title}
                    onChange={e => setNewService({...newService, title: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Цена (₸)</label>
                  <div className="bg-white rounded-[12px] p-3 border border-slate-100 shadow-sm">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      className="w-full text-[17px] font-bold text-[#007AFF] outline-none caret-[#007AFF] bg-transparent"
                      value={newService.price ?? ""}
                      onChange={e => setNewService({...newService, price: e.target.value === '' ? undefined : Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Время (мин)</label>
                  <div className="bg-white rounded-[12px] p-3 border border-slate-100 shadow-sm">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="60"
                      className="w-full text-[17px] font-bold text-[#007AFF] outline-none caret-[#007AFF] bg-transparent"
                      value={newService.duration_minutes ?? ""}
                      onChange={e => setNewService({...newService, duration_minutes: e.target.value === '' ? undefined : Number(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Описание</label>
                <div className="bg-white rounded-[12px] p-3 border border-slate-100 shadow-sm">
                  <textarea
                    placeholder="Что входит в услугу..."
                    rows={4}
                    className="w-full text-[17px] outline-none resize-none caret-[#007AFF] bg-transparent"
                    value={newService.description}
                    onChange={e => setNewService({...newService, description: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ service, onDelete }: { service: Service; onDelete: (e: React.MouseEvent) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-white rounded-[16px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden active:bg-slate-50 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4 flex gap-4 items-center">
        <div className="w-14 h-14 rounded-xl bg-[#F2F2F7] flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
          {service.image_url ? (
            <img src={service.image_url} className="w-full h-full object-cover" alt={service.title} />
          ) : (
            <Scissors size={24} className="text-[#8E8E93] opacity-40" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px] font-bold text-black tracking-tight leading-tight line-clamp-2 break-all overflow-hidden">
                {service.title}
              </h3>
            </div>
            {/* Обернул цену в span для контроля переноса */}
            <span className="text-[15px] font-bold text-[#007AFF] shrink-0 whitespace-nowrap">{service.price} ₸</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[13px] text-[#8E8E93]">{service.duration_minutes} мин</span>
            <ChevronDown size={14} className={`text-[#C7C7CC] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <button
          onClick={onDelete}
          className="p-2 text-[#FF3B30] active:opacity-40 transition-opacity"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {expanded && service.description && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          <div className="pt-3 border-t border-[#F2F2F7] overflow-hidden">
            <p className="text-[14px] text-[#48484A] leading-relaxed font-medium break-all whitespace-pre-wrap">
              {service.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}