import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Globe,
  MapPin,
  Phone as PhoneIcon,
  ArrowRight,
  Sparkles,
  Timer,
  Scissors,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";

export function MasterRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Данные из твоего старого файла + новые настройки
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    telegramId: null as number | null,
    telegramName: "",
    slot_step: 30,
    firstService: { title: "Стрижка", price: 5000, duration: 60 }
  });

  useEffect(() => {
    // Получаем данные из Телеграма (твоя логика)
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser) {
      setFormData(prev => ({
        ...prev,
        telegramId: tgUser.id,
        telegramName: tgUser.first_name
      }));
    } else {
      // Для тестов в браузере можно раскомментировать:
      // setFormData(prev => ({ ...prev, telegramId: 12345, telegramName: "Тест" }));
    }
  }, []);

  const handleFinish = async () => {
    if (!formData.name || !formData.telegramId) {
      toast.error("Ошибка: Недостаточно данных для регистрации");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Создаем ваш салон...");

    try {
      // 1. Создаем салон (с твоими полями slug и telegram_chat_id)
      const { data: salon, error: salonError } = await supabase
        .from('salons')
        .insert([{
          name: formData.name,
          address: formData.address,
          phone: formData.phone,
          telegram_chat_id: formData.telegramId,
          slug: `salon_${formData.telegramId}_${Date.now()}`,
          slot_step: formData.slot_step,
          schedule: [
            { day: "Пн", isWorking: true, hours: { start: "10:00", end: "20:00" } },
            { day: "Вт", isWorking: true, hours: { start: "10:00", end: "20:00" } },
            { day: "Ср", isWorking: true, hours: { start: "10:00", end: "20:00" } },
            { day: "Чт", isWorking: true, hours: { start: "10:00", end: "20:00" } },
            { day: "Пт", isWorking: true, hours: { start: "10:00", end: "20:00" } },
            { day: "Сб", isWorking: false, hours: { start: "10:00", end: "18:00" } },
            { day: "Вс", isWorking: false, hours: { start: "10:00", end: "18:00" } }
          ]
        }])
        .select()
        .single();

      if (salonError) throw salonError;

      // 2. Добавляем первую услугу, чтобы мастер сразу мог работать
      const { error: serviceError } = await supabase
        .from('services')
        .insert([{
          salon_id: salon.id,
          title: formData.firstService.title,
          price: formData.firstService.price,
          duration_minutes: formData.firstService.duration
        }]);

      if (serviceError) throw serviceError;

      localStorage.setItem("salon_id", salon.id);
      toast.success("Салон успешно создан! 🚀", { id: toastId });
      navigate("/master");

    } catch (err: any) {
      toast.error("Ошибка: " + err.message, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setStep(prev => prev + 1);

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col font-sans overflow-hidden">
      {/* Прогресс-бар iOS */}
      <div className="px-6 pt-12 flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-700 ${step >= i ? 'bg-[#007AFF]' : 'bg-white shadow-inner'}`} />
        ))}
      </div>

      <div className="flex-1 px-6 pt-10 pb-10 flex flex-col">
        {/* ШАГ 1: БАЗОВЫЕ ДАННЫЕ */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div>
              <h1 className="text-[34px] font-extrabold tracking-tight text-black leading-tight">
                {formData.telegramName ? `Привет, ${formData.telegramName}!` : "Добро пожаловать!"}
              </h1>
              <p className="text-[17px] text-[#8E8E93] font-medium mt-2">Давайте создадим ваш первый салон в системе.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
                  <Globe size={14} className="text-[#5856D6]"/> Название
                </label>
                <div className="bg-white rounded-[16px] p-1 border border-slate-200 shadow-sm">
                  <input
                    placeholder="Grooming Star"
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
                  <PhoneIcon size={14} className="text-[#34C759]"/> Телефон для записи
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

            {!formData.telegramId ? (
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3">
                <div className="text-red-500 font-bold mt-0.5">⚠️</div>
                <p className="text-[13px] text-red-600 leading-snug">
                  <b>Ошибка доступа.</b> Пожалуйста, откройте это приложение через Telegram-бота, чтобы мы могли привязать ваш аккаунт.
                </p>
              </div>
            ) : (
              <button
                disabled={!formData.name || !formData.phone}
                onClick={nextStep}
                className="w-full py-4 bg-[#007AFF] text-white rounded-[18px] font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-200 active:scale-95 transition-all disabled:opacity-50 mt-4"
              >
                Продолжить <ArrowRight size={20} />
              </button>
            )}
          </div>
        )}

        {/* ШАГ 2: ШАГ ЗАПИСИ */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div>
              <h1 className="text-[34px] font-extrabold tracking-tight text-black leading-tight">Ваш график</h1>
              <p className="text-[17px] text-[#8E8E93] font-medium mt-2">Настройте частоту записей в календаре.</p>
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
                Мы установили стандартный график работы: <b>10:00 — 20:00</b>. Изменить часы работы для каждого дня можно будет в профиле.
              </p>
            </div>

            <button
              onClick={nextStep}
              className="w-full py-4 bg-[#007AFF] text-white rounded-[18px] font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-200 active:scale-95 transition-all"
            >
              Последний шаг <ArrowRight size={20} />
            </button>
          </div>
        )}

        {/* ШАГ 3: ПЕРВАЯ УСЛУГА */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
            <div>
              <h1 className="text-[34px] font-extrabold tracking-tight text-black leading-tight">Первая услуга</h1>
              <p className="text-[17px] text-[#8E8E93] font-medium mt-2">Добавьте то, на что клиенты смогут записаться сразу.</p>
            </div>

            <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1 flex items-center gap-1.5">
                   <Scissors size={14}/> Название услуги
                </label>
                <input
                  placeholder="Комплексный уход"
                  className="w-full px-4 py-3.5 bg-[#F2F2F7] rounded-xl text-[17px] outline-none caret-[#007AFF] font-medium"
                  value={formData.firstService.title}
                  onChange={e => setFormData({...formData, firstService: {...formData.firstService, title: e.target.value}})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Цена (₸)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full px-4 py-3.5 bg-[#F2F2F7] rounded-xl text-[17px] font-bold text-[#007AFF] outline-none"
                    value={formData.firstService.price}
                    onChange={e => setFormData({...formData, firstService: {...formData.firstService, price: Number(e.target.value)}})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-[#8E8E93] uppercase ml-1">Мин.</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full px-4 py-3.5 bg-[#F2F2F7] rounded-xl text-[17px] font-bold text-[#007AFF] outline-none"
                    value={formData.firstService.duration}
                    onChange={e => setFormData({...formData, firstService: {...formData.firstService, duration: Number(e.target.value)}})}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleFinish}
              disabled={loading || !formData.firstService.title}
              className="w-full py-4 bg-[#34C759] text-white rounded-[18px] font-extrabold text-[17px] flex items-center justify-center gap-2 shadow-xl shadow-green-100 active:scale-95 transition-all mt-4 disabled:opacity-50"
            >
              {loading ? "Запускаем..." : <><Sparkles size={20} /> Открыть салон</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}