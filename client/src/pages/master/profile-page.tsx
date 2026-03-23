import { useEffect, useState } from "react";
import { Camera, MapPin, Phone, Share, Globe, Save, Scissors, Edit3, Timer, Loader2, Plus, X, Instagram } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";
import { api } from "@/lib/api";
import { uploadImage } from "@/lib/upload";

const BOT_USERNAME = "pet_groom_bot";
const APP_NAME = "app";

type ScheduleDay = {
  day: string;
  isWorking: boolean;
  hours: { start: string; end: string };
};

export function MasterProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [salonId] = useState<string | null>(localStorage.getItem("salon_id"));

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    description: "",
    photo_url: "",
    instagram_url: "", // <--- Добавили поле
    gallery: [] as string[],
    schedule: [] as ScheduleDay[],
    slot_step: 30
  });

  useEffect(() => {
    if (salonId) {
      async function loadSalon() {
        const { data } = await supabase
          .from('salons')
          .select('*')
          .eq('id', salonId)
          .single();

        if (data) {
          let parsedSchedule = [];
          try {
            parsedSchedule = typeof data.schedule === 'string' ? JSON.parse(data.schedule) : data.schedule || [];
          } catch(e) { parsedSchedule = []; }

          let parsedGallery = [];
          try {
             parsedGallery = typeof data.gallery === 'string' ? JSON.parse(data.gallery) : data.gallery || [];
          } catch(e) { parsedGallery = []; }

          setFormData({
            name: data.name || "",
            address: data.address || "",
            phone: data.phone || "",
            description: data.description || "",
            photo_url: data.photo_url || "",
            instagram_url: data.instagram_url || "", // <--- Читаем из БД
            gallery: Array.isArray(parsedGallery) ? parsedGallery : [],
            schedule: parsedSchedule,
            slot_step: data.slot_step || 30
          });
        }
        setLoading(false);
      }
      loadSalon();
    }
  }, [salonId]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    try {
      const file = e.target.files[0];
      const url = await uploadImage(file);
      setFormData(prev => ({ ...prev, photo_url: url }));
      toast.success("Аватар обновлен!");
    } catch (error) {
      console.error(error);
      toast.error("Ошибка загрузки фото");
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setGalleryUploading(true);
    try {
      const file = e.target.files[0];
      const url = await uploadImage(file);
      setFormData(prev => ({ ...prev, gallery: [...prev.gallery, url] }));
      toast.success("Фото добавлено в портфолио");
    } catch (error) {
      console.error(error);
      toast.error("Ошибка загрузки");
    } finally {
      setGalleryUploading(false);
    }
  };

  const removeGalleryPhoto = (index: number) => {
      setFormData(prev => ({
          ...prev,
          gallery: prev.gallery.filter((_, i) => i !== index)
      }));
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Название салона обязательно");
      return;
    }
    if (!salonId) return;

    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        description: formData.description,
        photo_url: formData.photo_url,
        instagram_url: formData.instagram_url, // <--- Отправляем на бэкенд
        gallery: formData.gallery,
        schedule: JSON.stringify(formData.schedule),
        slot_step: formData.slot_step
      };

      await api.updateSalon(salonId, payload);

      toast.success("Профиль обновлен! ✨");
      setIsEditing(false);

    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (dayName: string) => {
    if (!isEditing) return;
    setFormData(prev => ({ ...prev, schedule: prev.schedule.map(d => d.day === dayName ? { ...d, isWorking: !d.isWorking } : d) }));
  };

  const updateHours = (dayName: string, type: 'start' | 'end', value: string) => {
    if (!isEditing) return;
    setFormData(prev => ({ ...prev, schedule: prev.schedule.map(d => d.day === dayName ? { ...d, hours: { ...d.hours, [type]: value } } : d) }));
  };

  const handleCopyLink = () => {
    if (!salonId) return;
    const url = `https://t.me/${BOT_USERNAME}/${APP_NAME}?startapp=salon_${salonId}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка для Telegram скопирована!");
  };

  const fieldContainerClass = (editing: boolean) => `
    rounded-[14px] bg-white border transition-all duration-200 shadow-sm p-1
    ${editing ? 'border-[#007AFF]/30 ring-1 ring-[#007AFF]/10' : 'border-slate-200'}
  `;

  if (loading) return <div className="text-center py-20"><Loader2 className="animate-spin mx-auto text-[#007AFF]"/></div>;

  return (
    <div className="space-y-6 pt-10 pb-32 bg-[#F2F2F7] min-h-screen font-sans">
      <div className="px-5 flex justify-between items-end">
         <h1 className="text-[34px] font-extrabold tracking-tight text-black">Профиль</h1>
         {isEditing && (
             <button onClick={handleSave} disabled={saving || uploading} className="text-[#007AFF] font-bold text-[17px]">
                 {saving ? <Loader2 className="animate-spin" /> : "Готово"}
             </button>
         )}
      </div>

      {/* АВАТАР (ОСНОВНОЕ ФОТО) */}
      <div className="flex flex-col items-center mb-4 px-5">
        <div className="relative group">
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl bg-white flex items-center justify-center relative">
             {formData.photo_url ? (
               <img src={formData.photo_url} className="w-full h-full object-cover" alt="Salon" />
             ) : (
               <Scissors size={40} className="text-[#C7C7CC]" />
             )}

             {uploading && (
               <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                 <Loader2 className="animate-spin text-white" />
               </div>
             )}
          </div>

          {isEditing && (
            <label className="absolute bottom-0 right-0 bg-white p-2.5 rounded-full shadow-lg text-[#007AFF] border border-slate-100 cursor-pointer active:scale-90 transition-all z-20">
              <Camera size={20} strokeWidth={2.5} />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={uploading}
              />
            </label>
          )}
        </div>

        {isEditing && (
            <p className="text-[12px] text-[#8E8E93] mt-3 font-medium">Главное фото профиля</p>
        )}
      </div>

      <div className="px-5 space-y-7">

        {/* СЕКЦИЯ: ПОРТФОЛИО */}
        <section className="space-y-2">
            <h2 className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">Портфолио работ</h2>
            <div className="bg-white rounded-[16px] p-4 shadow-sm border border-slate-100">
                {formData.gallery.length === 0 && !isEditing && (
                    <div className="text-center text-slate-400 py-4 text-[13px]">Нет загруженных работ</div>
                )}

                <div className="grid grid-cols-3 gap-2">
                    {/* Список фото */}
                    {formData.gallery.map((url, idx) => (
                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                            <img src={url} className="w-full h-full object-cover" alt="Work" />
                            {isEditing && (
                                <button
                                    onClick={() => removeGalleryPhoto(idx)}
                                    className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full active:scale-90 transition-transform"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Кнопка добавления */}
                    {isEditing && (
                        <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-[#007AFF] cursor-pointer hover:bg-slate-50 transition-colors active:scale-95">
                            {galleryUploading ? <Loader2 className="animate-spin" size={24}/> : <Plus size={24}/>}
                            <span className="text-[10px] font-bold uppercase">Добавить</span>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleGalleryUpload}
                                disabled={galleryUploading}
                            />
                        </label>
                    )}
                </div>
            </div>
        </section>

        {/* Форма с данными */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
              <Globe size={14} className="text-[#5856D6]" /> Название бизнеса
            </label>
            <div className={fieldContainerClass(isEditing)}>
              <input
                disabled={!isEditing}
                placeholder="Введите название"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-transparent text-[17px] font-medium outline-none caret-[#007AFF] disabled:text-black opacity-100 placeholder:text-[#C7C7CC]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
              <MapPin size={14} className="text-[#FF9500]" /> Адрес
            </label>
            <div className={fieldContainerClass(isEditing)}>
              <input
                disabled={!isEditing}
                placeholder="Город, улица..."
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 bg-transparent text-[17px] font-medium outline-none caret-[#007AFF] disabled:text-black opacity-100 placeholder:text-[#C7C7CC]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
              <Phone size={14} className="text-[#34C759]" /> Телефон
            </label>
            <div className={`${fieldContainerClass(isEditing)} p-3.5`}>
              <PhoneInput
                disabled={!isEditing}
                value={formData.phone}
                onChange={val => setFormData({ ...formData, phone: val })}
                className="border-none shadow-none h-auto p-0 text-[17px] font-medium focus-visible:ring-0 caret-[#007AFF] disabled:text-black opacity-100"
              />
            </div>
          </div>

          {/* 👇 ПОЛЕ INSTAGRAM */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
              <Instagram size={14} className="text-[#E1306C]" /> Instagram
            </label>
            <div className={fieldContainerClass(isEditing)}>
              <input
                disabled={!isEditing}
                placeholder="Ссылка или @username"
                value={formData.instagram_url}
                onChange={e => setFormData({ ...formData, instagram_url: e.target.value })}
                className="w-full px-4 py-3 bg-transparent text-[17px] font-medium outline-none caret-[#E1306C] disabled:text-black opacity-100 placeholder:text-[#C7C7CC]"
              />
            </div>
          </div>
        </div>

        {/* График работы */}
        <section className="space-y-2">
          <h2 className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">График работы</h2>
          <div className="bg-white rounded-[16px] overflow-hidden shadow-sm border border-slate-100 divide-y divide-[#F2F2F7]">
            {formData.schedule.map((day) => (
              <div key={day.day} className={`flex flex-col transition-all duration-300 ${!day.isWorking && 'bg-zinc-50'}`}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-[16px] font-bold w-6 ${day.isWorking ? 'text-black' : 'text-[#C7C7CC]'}`}>
                      {day.day}
                    </span>
                    {day.isWorking ? (
                      <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#007AFF] animate-in fade-in duration-300">
                        <input
                          type="time"
                          disabled={!isEditing}
                          value={day.hours.start}
                          onChange={(e) => updateHours(day.day, 'start', e.target.value)}
                          className="bg-transparent outline-none w-[48px] p-0 text-center disabled:text-[#007AFF]"
                        />
                        <span className="text-[#C7C7CC] font-normal">—</span>
                        <input
                          type="time"
                          disabled={!isEditing}
                          value={day.hours.end}
                          onChange={(e) => updateHours(day.day, 'end', e.target.value)}
                          className="bg-transparent outline-none w-[48px] p-0 text-center disabled:text-[#007AFF]"
                        />
                      </div>
                    ) : (
                      <span className="text-[13px] font-medium text-[#C7C7CC]">Выходной</span>
                    )}
                  </div>
                  <button
                    disabled={!isEditing}
                    onClick={() => toggleDay(day.day)}
                    className={`
                        w-[50px] h-[30px] rounded-full transition-all duration-300 relative shrink-0
                        ${day.isWorking ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}
                        ${!isEditing && 'opacity-80'}
                    `}
                  >
                    <div className={`
                        absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-all duration-300
                        ${day.isWorking ? 'translate-x-[22px]' : 'translate-x-[2px]'}
                    `}></div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Параметры записи */}
        <section className="space-y-2">
          <h2 className="text-[12px] font-bold text-[#8E8E93] uppercase tracking-wider ml-1">Параметры записи</h2>
          <div className="bg-white rounded-[16px] p-4 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="bg-[#007AFF]/10 p-1.5 rounded-[6px] text-[#007AFF]">
                  <Timer size={16} />
                </div>
                <span className="text-[15px] font-bold text-black">Шаг записи</span>
              </div>
              <span className="text-[13px] text-[#8E8E93] font-medium">{formData.slot_step} мин</span>
            </div>

            <div className="flex bg-[#F2F2F7] p-1 rounded-[10px]">
              {[15, 30, 60].map(step => (
                <button
                  key={step}
                  disabled={!isEditing}
                  onClick={() => setFormData({ ...formData, slot_step: step })}
                  className={`flex-1 py-1.5 text-[14px] font-bold rounded-[8px] transition-all ${
                    formData.slot_step === step ? 'bg-white shadow-sm text-[#007AFF]' : 'text-[#8E8E93]'
                  } ${!isEditing && formData.slot_step !== step && 'opacity-40'}`}
                >
                  {step} м
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 tracking-wide">Описание для клиентов</label>
          <div className={fieldContainerClass(isEditing)}>
            <textarea
              disabled={!isEditing}
              placeholder="Расскажите о своих услугах..."
              rows={4}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-transparent text-[17px] outline-none resize-none caret-[#007AFF] disabled:text-black opacity-100 font-medium placeholder:text-[#C7C7CC]"
            />
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="pt-4 space-y-3">
          {!isEditing && (
             <>
                <button
                onClick={() => setIsEditing(true)}
                className="w-full py-4 bg-white text-black rounded-[16px] font-bold flex items-center justify-center gap-2 border border-slate-200 active:bg-slate-50 transition-all shadow-sm"
                >
                <Edit3 size={20} className="text-[#007AFF]" /> Редактировать профиль
                </button>

                <button
                    onClick={handleCopyLink}
                    className="w-full py-4 bg-white text-[#007AFF] rounded-[16px] font-bold flex items-center justify-center gap-3 border border-slate-200 active:bg-slate-50 transition-all"
                >
                    <Share size={20} /> Ссылка для клиентов
                </button>
             </>
          )}

          {isEditing && (
            <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="w-full py-4 bg-[#007AFF] text-white rounded-[16px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all"
            >
                <Save size={20} /> {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}