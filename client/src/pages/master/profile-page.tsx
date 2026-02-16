import { useEffect, useState } from "react";
import { Camera, MapPin, Phone, Share, Globe, Save, Scissors, Edit3, Timer, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";

// 👇 URL ТВОЕГО БЕКЕНДА
const BACKEND_URL = "https://grooming-tma.onrender.com";

// 👇 ТВОИ ДАННЫЕ (Убедись, что они верные)
const BOT_USERNAME = "pet_groom_bot";
const APP_NAME = "app";

type ScheduleDay = {
  day: string;
  isWorking: boolean;
  hours: { start: string; end: string };
};

export function MasterProfilePage() {
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [salonId] = useState<string | null>(localStorage.getItem("salon_id"));

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    description: "",
    photo_url: "",
    schedule: [] as ScheduleDay[],
    slot_step: 30
  });

  useEffect(() => {
    if (salonId) {
      async function loadSalon() {
        // Чтение оставляем через Supabase (это безопасно и быстро)
        const { data } = await supabase
          .from('salons')
          .select('*')
          .eq('id', salonId)
          .single();

        if (data) {
          // Парсим расписание, если оно пришло строкой (бывает в старых записях)
          let parsedSchedule = [];
          if (typeof data.schedule === 'string') {
              try { parsedSchedule = JSON.parse(data.schedule); } catch(e) { parsedSchedule = []; }
          } else {
              parsedSchedule = data.schedule || [];
          }

          setFormData({
            name: data.name || "",
            address: data.address || "",
            phone: data.phone || "",
            description: data.description || "",
            photo_url: data.photo_url || "",
            schedule: parsedSchedule,
            slot_step: data.slot_step || 30
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
    // const toastId = toast.loading("Сохранение...");

    try {
      // 👇 ИСПРАВЛЕНИЕ: Используем Python API для сохранения
      const payload = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        description: formData.description,
        // photo_url: formData.photo_url, // Пока закомментируем, если на беке нет поддержки, или раскомментируй если добавил поле в Pydantic
        schedule: JSON.stringify(formData.schedule), // Важно: API ждет строку JSON для расписания
        // slot_step: formData.slot_step // Если добавил в Pydantic на беке - раскомментируй
      };

      const response = await fetch(`${BACKEND_URL}/api/salons/${salonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Ошибка сохранения на сервере");

      toast.success("Профиль обновлен! ✨");
      setIsEditing(false);

    } catch (e) {
      console.error(e);
      toast.error("Ошибка сохранения");
    } finally {
      setLoading(false);
      // toast.dismiss(toastId);
    }
  };

  const toggleDay = (dayName: string) => {
    // if (!isEditing) return; // Разрешаем кликать всегда или только при редактировании? У тебя было только при редактировании.
    if (!isEditing) return;

    setFormData(prev => ({
      ...prev,
      schedule: prev.schedule.map(d =>
        d.day === dayName ? { ...d, isWorking: !d.isWorking } : d
      )
    }));
  };

  const updateHours = (dayName: string, type: 'start' | 'end', value: string) => {
    if (!isEditing) return;
    setFormData(prev => ({
      ...prev,
      schedule: prev.schedule.map(d =>
        d.day === dayName ? { ...d, hours: { ...d.hours, [type]: value } } : d
      )
    }));
  };

  const handleCopyLink = () => {
    if (!salonId) return;

    // ✅ ГЕНЕРИРУЕМ ПРАВИЛЬНУЮ ССЫЛКУ T.ME
    const url = `https://t.me/${BOT_USERNAME}/${APP_NAME}?startapp=salon_${salonId}`;

    navigator.clipboard.writeText(url);
    toast.success("Ссылка для Telegram скопирована!");
  };

  const fieldContainerClass = (editing: boolean) => `
    rounded-[14px] bg-white border transition-all duration-200 shadow-sm p-1
    ${editing ? 'border-[#007AFF]/30 ring-1 ring-[#007AFF]/10' : 'border-slate-200'}
  `;

  return (
    <div className="space-y-6 pt-10 pb-32 bg-[#F2F2F7] min-h-screen font-sans">
      <div className="px-5 flex justify-between items-end">
         <h1 className="text-[34px] font-extrabold tracking-tight text-black">Профиль</h1>
         {/* Кнопка "Сохранить" в заголовке, если редактируем */}
         {isEditing && (
             <button onClick={handleSave} disabled={loading} className="text-[#007AFF] font-bold text-[17px]">
                 {loading ? <Loader2 className="animate-spin" /> : "Готово"}
             </button>
         )}
      </div>

      {/* Аватарка */}
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

      <div className="px-5 space-y-7">

        {/* Контактная информация */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
              <Globe size={14} className="text-[#5856D6]" /> Название салона
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

                  {/* Переключатель (Toggle) */}
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

        {/* Описание */}
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
                disabled={loading}
                className="w-full py-4 bg-[#007AFF] text-white rounded-[16px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all"
            >
                <Save size={20} /> {loading ? "Сохранение..." : "Сохранить изменения"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}