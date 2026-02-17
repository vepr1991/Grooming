import React, { useEffect, useState } from "react";
import { Plus, Trash2, ChevronDown, Scissors, Image as ImageIcon, Camera, Loader2, Edit2 } from "lucide-react";
import { toast } from "sonner";
import imageCompression from 'browser-image-compression'; // 👈 НОВАЯ БИБЛИОТЕКА

import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { uploadImage } from "@/lib/upload";

type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
  description?: string;
  image_url?: string;
  is_active?: boolean;
};

export function MasterServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Service>>({
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
      .eq("is_active", true)
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

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ title: "", price: undefined, duration_minutes: 60, description: "", image_url: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(service.id);
    setFormData({
      title: service.title,
      price: service.price,
      duration_minutes: service.duration_minutes,
      description: service.description || "",
      image_url: service.image_url || ""
    });
    setIsModalOpen(true);
  };

  // 👇 НОВАЯ ФУНКЦИЯ: Сжатие и загрузка
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploading(true);

    try {
      // 1. Настройки сжатия
      const options = {
        maxSizeMB: 1,           // Цель: меньше 1 МБ
        maxWidthOrHeight: 1920, // Макс. ширина/высота (HD)
        useWebWorker: true,     // Используем потоки для скорости
        fileType: "image/jpeg"  // Конвертируем все в JPEG (легче)
      };

      // 2. Сжимаем
      const compressedFile = await imageCompression(file, options);

      // 3. Загружаем уже сжатый файл
      // (uploadImage ожидает File, а compressedFile это File/Blob, так что все ок)
      const url = await uploadImage(compressedFile);

      setFormData(prev => ({ ...prev, image_url: url }));
      toast.success("Фото загружено!");

    } catch (error) {
      console.error(error);
      toast.error("Ошибка при обработке фото");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.price) {
      toast.error("Название и цена обязательны");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        title: formData.title,
        price: Number(formData.price),
        duration_minutes: Number(formData.duration_minutes),
        description: formData.description,
        image_url: formData.image_url,
        salon_id: salonId,
      };

      if (editingId) {
        await api.updateService(editingId, payload);
      } else {
        await api.createService(payload);
      }

      toast.success(editingId ? "Услуга обновлена" : "Услуга добавлена");
      setIsModalOpen(false);
      fetchServices();

    } catch (e: any) {
      toast.error(e.message || "Ошибка при сохранении");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Удалить эту услугу из прайса?")) return;

    try {
      await api.deleteService(id);
      toast.success("Услуга удалена");
      setServices(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      toast.error(e.message || "Не удалось удалить услугу");
    }
  };

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen font-sans">
      <div className="px-5 flex justify-between items-end">
        <div>
          <h1 className="text-[34px] font-extrabold tracking-tight text-black mb-1">Услуги</h1>
          <p className="text-[15px] text-[#8E8E93] font-medium leading-tight">Ваш прейскурант</p>
        </div>
        <button
          onClick={openCreateModal}
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
            <ServiceCard
              key={s.id}
              service={s}
              onDelete={(e) => handleDelete(s.id, e)}
              onEdit={(e) => openEditModal(s, e)}
            />
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-end justify-center p-0">
          <div className="bg-[#F2F2F7] w-full max-w-md rounded-t-[24px] pb-10 overflow-hidden animate-in slide-in-from-bottom duration-300 shadow-2xl h-[92vh] flex flex-col">
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-200 bg-white/80 sticky top-0 z-10">
              <button onClick={() => setIsModalOpen(false)} className="text-[17px] text-[#007AFF]">Отмена</button>
              <h2 className="text-[17px] font-bold">{editingId ? "Редактирование" : "Новая услуга"}</h2>
              <button onClick={handleSave} disabled={submitting || uploading} className="text-[17px] font-bold text-[#007AFF] disabled:opacity-50">
                {submitting ? <Loader2 className="animate-spin" /> : "Готово"}
              </button>
            </div>

            <div className="px-5 mt-6 space-y-5 flex-1 overflow-y-auto no-scrollbar pb-10">
              {/* Блок загрузки фото */}
              <div className="flex flex-col items-center gap-3 mb-2">
                {/* 👇 ИСПРАВЛЕННЫЙ CSS: relative + overflow-hidden */}
                <div className="w-32 h-32 rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden flex items-center justify-center relative group shrink-0">
                  {formData.image_url ? (
                    // 👇 ИСПРАВЛЕННЫЙ CSS: absolute + inset-0 + object-cover
                    <img src={formData.image_url} className="absolute inset-0 w-full h-full object-cover" alt="Service" />
                  ) : (
                    <ImageIcon size={48} className="text-[#C7C7CC]" />
                  )}

                  {uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                      <Loader2 className="animate-spin text-white" size={32} />
                    </div>
                  )}

                  <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors cursor-pointer z-10">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                    {!uploading && (
                      <div className="absolute bottom-2 right-2 bg-[#007AFF] text-white p-2 rounded-full shadow-lg">
                        <Camera size={16} />
                      </div>
                    )}
                  </label>
                </div>
                {uploading ? (
                  <p className="text-[12px] text-[#8E8E93]">Сжатие и загрузка...</p>
                ) : (
                  <p className="text-[12px] text-[#8E8E93] text-center max-w-[200px]">Нажмите, чтобы загрузить фото</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Название услуги</label>
                <div className="bg-white rounded-[12px] p-3 border border-slate-100 shadow-sm">
                  <input
                    placeholder="Например: Полный комплекс"
                    className="w-full text-[17px] outline-none caret-[#007AFF] bg-transparent"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
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
                      value={formData.price ?? ""}
                      onChange={e => setFormData({...formData, price: e.target.value === '' ? undefined : Number(e.target.value)})}
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
                      value={formData.duration_minutes ?? ""}
                      onChange={e => setFormData({...formData, duration_minutes: e.target.value === '' ? undefined : Number(e.target.value)})}
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
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
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

function ServiceCard({ service, onDelete, onEdit }: { service: Service; onDelete: (e: React.MouseEvent) => void; onEdit: (e: React.MouseEvent) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="bg-white rounded-[16px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden active:bg-slate-50 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4 flex gap-4 items-center">
        {/* 👇 ИСПРАВЛЕННЫЙ CSS КАРТОЧКИ */}
        <div className="w-14 h-14 rounded-xl bg-[#F2F2F7] flex items-center justify-center shrink-0 shadow-inner overflow-hidden relative">
          {service.image_url ? (
            <img src={service.image_url} className="absolute inset-0 w-full h-full object-cover" alt={service.title} />
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
            <span className="text-[15px] font-bold text-[#007AFF] shrink-0 whitespace-nowrap">{service.price} ₸</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[13px] text-[#8E8E93]">{service.duration_minutes} мин</span>
            <ChevronDown size={14} className={`text-[#C7C7CC] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
           <button onClick={onEdit} className="p-2 text-[#007AFF] active:opacity-40 transition-opacity">
            <Edit2 size={20} />
          </button>
          <button onClick={onDelete} className="p-2 text-[#FF3B30] active:opacity-40 transition-opacity">
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      {expanded && service.description && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          <div className="pt-3 border-t border-[#F2F2F7] overflow-hidden">
            <p className="text-[14px] text-[#48484A] leading-relaxed font-medium break-words whitespace-pre-wrap">
              {service.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}