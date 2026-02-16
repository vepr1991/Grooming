import { useEffect, useState } from "react";
import { Save, Loader2, Plus, Trash2, Clock, Check, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

// 👇 URL ТВОЕГО БЕКЕНДА
const BACKEND_URL = "https://grooming-tma.onrender.com";

export function MasterProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salon, setSalon] = useState<any>(null);

  // Форма
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    phone: "",
    address: "",
  });

  // Расписание
  const [schedule, setSchedule] = useState<any[]>([]);

  const salonId = localStorage.getItem("salon_id");

  useEffect(() => {
    fetchProfile();
  }, [salonId]);

  const fetchProfile = async () => {
    if (!salonId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("salons")
      .select("*")
      .eq("id", salonId)
      .single();

    if (error) {
      toast.error("Ошибка загрузки профиля");
    } else if (data) {
      setSalon(data);
      setFormData({
        name: data.name || "",
        description: data.description || "",
        phone: data.phone || "",
        address: data.address || "",
      });

      try {
        setSchedule(JSON.parse(data.schedule || "[]"));
      } catch (e) {
        setSchedule([]);
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!salonId) return;
    setSaving(true);

    try {
      const payload = {
        ...formData,
        schedule: JSON.stringify(schedule)
      };

      // 👇 ИСПРАВЛЕНИЕ: Используем Python API
      const response = await fetch(`${BACKEND_URL}/api/salons/${salonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Ошибка сохранения");

      toast.success("Профиль обновлен!");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (idx: number) => {
    const newSchedule = [...schedule];
    newSchedule[idx].isWorking = !newSchedule[idx].isWorking;
    setSchedule(newSchedule);
  };

  const updateTime = (idx: number, type: 'start' | 'end', val: string) => {
    const newSchedule = [...schedule];
    newSchedule[idx].hours[type] = val;
    setSchedule(newSchedule);
  };

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-[#007AFF]"/></div>;

  return (
    <div className="pt-6 pb-24 px-5 space-y-8 bg-[#F2F2F7] min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-[32px] font-extrabold text-black">Профиль</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#007AFF] text-white px-5 py-2 rounded-full font-bold text-[15px] flex items-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
          Сохранить
        </button>
      </div>

      {/* Основная инфо */}
      <div className="space-y-2">
        <h3 className="text-[13px] uppercase font-bold text-[#8E8E93] ml-1">Основная информация</h3>
        <div className="bg-white rounded-[16px] p-4 shadow-sm space-y-4 border border-slate-100">
          <div>
            <label className="text-[13px] font-semibold text-black mb-1 block">Название салона</label>
            <input
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full bg-[#F2F2F7] rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-[#007AFF]/20 transition-all"
              placeholder="Мой Груминг"
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold text-black mb-1 block">Адрес</label>
            <input
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              className="w-full bg-[#F2F2F7] rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-[#007AFF]/20 transition-all"
              placeholder="ул. Пушкина, д. 10"
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold text-black mb-1 block">Телефон</label>
            <input
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              className="w-full bg-[#F2F2F7] rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-[#007AFF]/20 transition-all"
              placeholder="+7 (999) 000-00-00"
            />
          </div>
          <div>
            <label className="text-[13px] font-semibold text-black mb-1 block">Описание</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="w-full bg-[#F2F2F7] rounded-xl px-4 py-3 text-[17px] outline-none focus:ring-2 ring-[#007AFF]/20 transition-all min-h-[80px]"
              placeholder="Пару слов о вашем салоне..."
            />
          </div>
        </div>
      </div>

      {/* График работы */}
      <div className="space-y-2">
        <h3 className="text-[13px] uppercase font-bold text-[#8E8E93] ml-1 flex items-center gap-2">
          <Clock size={14}/> График работы
        </h3>
        <div className="bg-white rounded-[16px] overflow-hidden shadow-sm border border-slate-100">
          {schedule.map((day, idx) => (
            <div key={day.day} className={`p-4 border-b border-[#F2F2F7] last:border-0 flex items-center justify-between transition-colors ${!day.isWorking ? 'bg-zinc-50' : ''}`}>
              <div className="flex items-center gap-3">
                <div
                  onClick={() => toggleDay(idx)}
                  className={`w-6 h-6 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all ${day.isWorking ? 'bg-[#007AFF] border-[#007AFF]' : 'border-[#C7C7CC]'}`}
                >
                  {day.isWorking && <Check size={14} className="text-white" strokeWidth={4}/>}
                </div>
                <span className={`text-[17px] font-semibold ${day.isWorking ? 'text-black' : 'text-[#8E8E93]'}`}>{day.day}</span>
              </div>

              {day.isWorking ? (
                <div className="flex items-center gap-2">
                  <input type="time" value={day.hours.start} onChange={e => updateTime(idx, 'start', e.target.value)} className="bg-[#F2F2F7] rounded-lg px-2 py-1 text-[15px] font-bold text-center outline-none w-20"/>
                  <span className="text-[#8E8E93]">-</span>
                  <input type="time" value={day.hours.end} onChange={e => updateTime(idx, 'end', e.target.value)} className="bg-[#F2F2F7] rounded-lg px-2 py-1 text-[15px] font-bold text-center outline-none w-20"/>
                </div>
              ) : (
                <span className="text-[15px] text-[#8E8E93] font-medium px-4">Выходной</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-xl flex gap-3 items-start">
        <Info className="text-[#007AFF] shrink-0 mt-0.5" size={20}/>
        <p className="text-[#007AFF] text-[13px] leading-snug">
          Изменения в графике повлияют только на <b>новые</b> записи. Старые записи останутся без изменений.
        </p>
      </div>
    </div>
  );
}