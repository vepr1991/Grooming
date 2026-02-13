import React, { useEffect, useState } from "react";
import { Camera, MapPin, Phone, Share, Globe, Mail, Save, Scissors, Edit3 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";

export function MasterProfilePage() {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [salonId] = useState<string | null>(localStorage.getItem("salon_id"));

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    description: "",
    photo_url: ""
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
          setFormData({
            name: data.name || "",
            address: data.address || "",
            phone: data.phone || "",
            description: data.description || "",
            photo_url: data.photo_url || ""
          });
        }
      }
      loadSalon();
    }
  }, [salonId]);

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Название салона обязательно");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Сохранение...");

    const { error } = await supabase
      .from('salons')
      .update({
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        description: formData.description,
        photo_url: formData.photo_url
      })
      .eq('id', salonId);

    setLoading(false);
    toast.dismiss(toastId);

    if (error) {
      toast.error("Ошибка сохранения");
    } else {
      toast.success("Профиль обновлен! ✨");
      setIsEditing(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/client/${salonId}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована!");
  };

  const fieldContainerClass = (editing: boolean) => `
    rounded-[14px] bg-white border transition-all duration-200 shadow-sm p-1
    ${editing ? 'border-[#007AFF]/30 ring-1 ring-[#007AFF]/10' : 'border-slate-200'}
  `;

  return (
    <div className="space-y-6 pt-10 pb-32 bg-[#F2F2F7] min-h-screen">
      <div className="px-5">
        <h1 className="text-[34px] font-extrabold tracking-tight text-black">Профиль</h1>
      </div>

      <div className="flex flex-col items-center mb-4 px-5">
        <div className="relative">
          <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl bg-white flex items-center justify-center">
             {formData.photo_url ? (
               <img src={formData.photo_url} className="w-full h-full object-cover" alt="Salon" />
             ) : (
               <Scissors size={40} className="text-[#C7C7CC]" />
             )}
          </div>
          {isEditing && (
            <button className="absolute bottom-0 right-0 bg-white p-2.5 rounded-full shadow-lg text-[#007AFF] border border-slate-100 animate-in fade-in zoom-in">
              <Camera size={20} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {isEditing && (
          <input
            placeholder="URL логотипа"
            value={formData.photo_url}
            onChange={e => setFormData({ ...formData, photo_url: e.target.value })}
            className="mt-4 w-full text-center text-[13px] text-[#007AFF] bg-transparent outline-none caret-[#007AFF]"
          />
        )}
      </div>

      <div className="px-5 space-y-5">
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5 tracking-wide">
            <Globe size={14} className="text-[#5856D6]" /> Название салона
          </label>
          <div className={fieldContainerClass(isEditing)}>
            <input
              disabled={!isEditing}
              placeholder="Введите название"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-transparent text-[17px] font-medium outline-none caret-[#007AFF] disabled:text-black opacity-100"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5 tracking-wide">
            <MapPin size={14} className="text-[#FF9500]" /> Адрес
          </label>
          <div className={fieldContainerClass(isEditing)}>
            <input
              disabled={!isEditing}
              placeholder="Город, улица..."
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 bg-transparent text-[17px] font-medium outline-none caret-[#007AFF] disabled:text-black opacity-100"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5 tracking-wide">
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

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 tracking-wide">Описание для клиентов</label>
          <div className={fieldContainerClass(isEditing)}>
            <textarea
              disabled={!isEditing}
              placeholder="Расскажите о своих услугах..."
              rows={4}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 bg-transparent text-[17px] outline-none resize-none caret-[#007AFF] disabled:text-black opacity-100 font-medium"
            />
          </div>
        </div>

        <div className="pt-4 space-y-3">
          {isEditing ? (
            <button
              onClick={handleSave}
              disabled={loading}
              className="w-full py-4 bg-[#007AFF] text-white rounded-[16px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all"
            >
              <Save size={20} /> {loading ? "Сохранение..." : "Сохранить профиль"}
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="w-full py-4 bg-white text-black rounded-[16px] font-bold flex items-center justify-center gap-2 border border-slate-200 active:bg-slate-50 transition-all shadow-sm"
            >
              <Edit3 size={20} className="text-[#007AFF]" /> Редактировать профиль
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="w-full py-4 bg-white text-[#007AFF] rounded-[16px] font-bold flex items-center justify-center gap-3 border border-slate-200 active:bg-slate-50 transition-all"
          >
            <Share size={20} /> Ссылка для клиентов
          </button>
        </div>

        <div className="bg-white rounded-[16px] p-5 shadow-sm border border-slate-100 mt-4">
           <div className="flex items-center gap-3 mb-3">
              <div className="bg-black/5 p-2 rounded-lg text-black">
                <Mail size={18} />
              </div>
              <span className="text-[17px] font-bold">Поддержка</span>
           </div>
           <p className="text-[14px] text-[#8E8E93] leading-snug font-medium mb-4">
             Есть вопросы? Напишите нам в Telegram, мы поможем настроить ваш салон.
           </p>
           <button className="text-[#007AFF] text-[15px] font-bold active:opacity-50">
             Связаться с разработчиком →
           </button>
        </div>
      </div>
    </div>
  );
}