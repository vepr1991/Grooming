import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  User,
  Phone,
  MapPin,
  Clock,
  LogOut,
  Share2,
  Copy,
  CheckCircle2,
  Settings
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { PhoneInput } from "@/components/ui/phone-input";

// 👇 ТВОИ ДАННЫЕ ИЗ BOTFATHER
const BOT_USERNAME = "pet_groom_bot";
const APP_NAME = "app";

type Salon = {
  id: string;
  name: string;
  address: string;
  phone: string;
  telegram_chat_id: number;
};

export function MasterProfilePage() {
  const navigate = useNavigate();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const salonId = localStorage.getItem("salon_id");
    if (!salonId) {
      navigate('/master/register');
      return;
    }

    async function loadProfile() {
      const { data, error } = await supabase
        .from('salons')
        .select('*')
        .eq('id', salonId)
        .single();

      if (error) {
        console.error(error);
        toast.error("Не удалось загрузить профиль");
      } else {
        setSalon(data);
      }
      setLoading(false);
    }

    loadProfile();
  }, [navigate]);

  const copyLink = () => {
    if (!salon) return;

    // ✅ ПРАВИЛЬНАЯ ССЫЛКА (открывает приложение внутри Telegram)
    const link = `https://t.me/${BOT_USERNAME}/${APP_NAME}?startapp=salon_${salon.id}`;

    navigator.clipboard.writeText(link);
    toast.success("Ссылка скопирована! Отправьте её клиенту.");
  };

  const handleLogout = () => {
    if (confirm("Выйти из аккаунта?")) {
      localStorage.removeItem("salon_id");
      navigate("/select-role");
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-[#8E8E93]">Загрузка профиля...</div>;
  }

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="px-5 pt-8 flex justify-between items-end">
        <h1 className="text-[32px] font-black tracking-tight text-black">Профиль</h1>
        <button onClick={handleLogout} className="w-10 h-10 rounded-full bg-slate-100 text-[#FF3B30] flex items-center justify-center active:scale-95 transition-all">
          <LogOut size={20} />
        </button>
      </div>

      <div className="px-5">
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-[#007AFF]/10 to-transparent"></div>
          <div className="w-24 h-24 bg-white rounded-full mx-auto relative z-10 border-4 border-white shadow-lg flex items-center justify-center">
             <User size={40} className="text-[#007AFF]" />
          </div>
          <h2 className="text-2xl font-black text-black mt-4">{salon?.name}</h2>
          <p className="text-[#8E8E93] font-medium mt-1">{salon?.address}</p>

          <div className="mt-6 flex gap-3">
             <button
               onClick={copyLink}
               className="flex-1 bg-[#007AFF] text-white py-3 rounded-[16px] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100"
             >
               <Share2 size={18} />
               Поделиться ссылкой
             </button>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        <h3 className="text-[13px] font-bold text-[#8E8E93] uppercase ml-2 tracking-wider">Информация</h3>

        <div className="bg-white rounded-[20px] overflow-hidden border border-slate-100 shadow-sm">
           <div className="p-4 flex items-center gap-4 border-b border-slate-50">
             <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
               <Phone size={20} />
             </div>
             <div>
               <p className="text-[11px] font-bold text-[#8E8E93] uppercase">Телефон</p>
               <p className="text-[17px] font-bold text-black">{salon?.phone}</p>
             </div>
           </div>

           <div className="p-4 flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
               <Settings size={20} />
             </div>
             <div>
               <p className="text-[11px] font-bold text-[#8E8E93] uppercase">ID Салона</p>
               <p className="text-[15px] font-mono font-medium text-black">{salon?.id}</p>
             </div>
           </div>
        </div>
      </div>

      <div className="px-8 text-center">
        <p className="text-[13px] text-[#8E8E93] leading-relaxed">
          Это приложение для управления записями.
          Отправьте ссылку клиенту, чтобы он мог записаться онлайн.
        </p>
      </div>
    </div>
  );
}