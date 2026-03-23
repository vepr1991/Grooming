import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Globe,
  MapPin,
  Phone as PhoneIcon,
  ArrowRight,
  Sparkles,
  Timer,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

import { PhoneInput } from "@/components/ui/phone-input";

// 👇 URL ТВОЕГО БЕКЕНДА
const BACKEND_URL = "https://grooming-tma.onrender.com";

export function MasterRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Данные формы
  const [formData, setFormData] = useState({
    niche: "", // <--- НОВОЕ ПОЛЕ НИШИ
    name: "",
    address: "",
    phone: "",
    telegramId: null as number | null,
    telegramName: "",
    slot_step: 30
  });

  useEffect(() => {
    // Получаем данные из Телеграма
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser) {
      setFormData(prev => ({
        ...prev,
        telegramId: tgUser.id,
        telegramName: tgUser.first_name
      }));
    }
  }, []);

  const handleFinish = async () => {
    if (!formData.name || !formData.telegramId || !formData.niche) {
      toast.error("Ошибка: Недостаточно данных для регистрации");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Создаем ваш профиль...");

    try {
      // 1. Создаем салон через БЕКЕНД
      const registerPayload = {
          telegram_chat_id: formData.telegramId,
          name: formData.name,
          niche: formData.niche, // <--- ОТПРАВЛЯЕМ НИШУ
          address: formData.address,
          phone: formData.phone,
          slot_step: formData.slot_step
      };

      const salonRes = await fetch(`${BACKEND_URL}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerPayload)
      });

      if (!salonRes.ok) throw new Error("Ошибка при регистрации");

      const salonData = await salonRes.json();
      const salon = salonData.data;

      localStorage.setItem("salon_id", salon.id);
      toast.success("Готово! 🚀", { id: toastId });

      // Перезагрузка для обновления AuthCheck
      setTimeout(() => {
          window.location.href = "/";
      }, 1000);

    } catch (err: any) {
      toast.error("Ошибка: " + err.message, { id: toastId });
      setLoading(false);
    }
  };

  const nextStep = () => setStep(prev => prev + 1);

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans overflow-hidden">
      <div className="px-6 pt-12 flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-700 ${step >= i ? 'bg-[#007AFF]' : 'bg-white shadow-inner'}`} />
        ))}
      </div>

      <div className="flex-1 px-6 pt-10 pb-10 flex flex-col">

        {/* ШАГ 1: ВЫБОР НИШИ */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div>
              <h1 className="text-[34px] font-extrabold tracking-tight text-black leading-tight">
                Выберите сферу
              </h1>
              <p className="text-[17px] text-[#8E8E93] font-medium mt-2">Мы автоматически настроим приложение под ваш бизнес.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setFormData({...formData, niche: 'beauty'}); nextStep(); }}
                className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex flex-col items-center gap-4 active:scale-95 transition-all"
              >
                <span className="text-[48px]">💅</span>
                <span className="font-bold text-[15px] text-center">Маникюр & Бьюти</span>
              </button>

              <button
                onClick={() => { setFormData({...formData, niche: 'grooming'}); nextStep(); }}
                className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex flex-col items-center gap-4 active:scale-95 transition-all"
              >
                <span className="text-[48px]">🐶</span>
                <span className="font-bold text-[15px] text-center">Груминг</span>
              </button>
            </div>
          </div>
        )}

        {/* ШАГ 2: БАЗОВЫЕ ДАННЫЕ */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div>
              <h1 className="text-[34px] font-extrabold tracking-tight text-black leading-tight">
                {formData.niche === 'beauty' ? 'Ваш салон' : 'Ваш груминг'}
              </h1>
              <p className="text-[17px] text-[#8E8E93] font-medium mt-2">Как клиенты будут вас видеть?</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
                  <Globe size={14} className="text-[#5856D6]"/> Название
                </label>
                <div className="bg-white rounded-[16px] p-1 border border-slate-200 shadow-sm">
                  <input
                    placeholder={formData.niche === 'beauty' ? "Nail Studio" : "Grooming Star"}
                    className="w-full px-4 py-3.5 bg-transparent text-[17px] outline-none caret-[#007AFF]"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
                  <MapPin size={14} className="text-[#FF9500]"/> Адрес
                </label>
                <div className="bg-white rounded-[16px] p-1 border border-slate-200 shadow-sm">
                  <input
                    placeholder="Алматы, пр. Абая 10"
                    className="w-full px-4 py-3.5 bg-transparent text-[17px] outline-none caret-[#007AFF]"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
                  <PhoneIcon size={14} className="text-[#34C759]"/> Телефон для связи
                </label>
                <div className="bg-white rounded-[16px] p-4 border border-slate-200 shadow-sm">
                  <PhoneInput
                    value={formData.phone}
                    onChange={val => setFormData({...formData, phone: val})}
                    className="border-none shadow-none h-auto p-0 text-[17px] caret-[#007AFF]"
                  />
                </div>
              </div>
            </div>

            <button
              disabled={!formData.name || !formData.phone}
              onClick={nextStep}
              className="w-full py-4 bg-[#007AFF] text-white rounded-[18px] font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-200 active:scale-95 transition-all disabled:opacity-50 mt-4"
            >
              Продолжить <ArrowRight size={20} />
            </button>
          </div>
        )}

        {/* ШАГ 3: ГРАФИК И ФИНИШ */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div>
              <h1 className="text-[34px] font-extrabold tracking-tight text-black leading-tight">График</h1>
              <p className="text-[17px] text-[#8E8E93] font-medium mt-2">Настройте частоту записей.</p>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 space-y-6">
              <div className="flex items-center gap-3">
                <div className="bg-[#007AFF]/10 p-2 rounded-xl text-[#007AFF]"><Timer size={24}/></div>
                <div>
                  <h3 className="text-[17px] font-bold">Интервал (Шаг)</h3>
                  <p className="text-[13px] text-[#8E8E93]">Размер одного окна для записи</p>
                </div>
              </div>

              <div className="flex bg-[#F2F2F7] p-1 rounded-xl">
                {[15, 30, 60].map(val => (
                  <button
                    key={val}
                    onClick={() => setFormData({...formData, slot_step: val})}
                    className={`flex-1 py-3 text-[15px] font-bold rounded-lg transition-all ${formData.slot_step === val ? 'bg-white shadow-sm text-[#007AFF]' : 'text-[#8E8E93]'}`}
                  >
                    {val} мин
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#E3F2FF] rounded-[24px] p-5 border border-blue-100 flex items-start gap-3">
              <CheckCircle2 className="text-[#007AFF] shrink-0 mt-0.5" size={20} />
              <p className="text-[14px] text-[#48484A] leading-relaxed">
                Базовый график: <b>10:00 — 20:00</b>. Изменить часы работы можно в профиле. Мы также создали базовые услуги, чтобы вы могли начать сразу!
              </p>
            </div>

            <button
              onClick={handleFinish}
              disabled={loading}
              className="w-full py-4 bg-[#34C759] text-white rounded-[18px] font-extrabold text-[17px] flex items-center justify-center gap-2 shadow-xl shadow-green-100 active:scale-95 transition-all mt-4 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <><Sparkles size={20} /> Завершить настройку</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}