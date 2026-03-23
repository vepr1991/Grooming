import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Scissors, User, ChevronRight } from "lucide-react";

// 👇 ИСПРАВЛЕНИЕ: Вернули правильный импорт твоего файла
import { AuthCheck } from "@/components/auth-check";

import { MasterLayout } from "@/components/layout/master-layout";
import { ClientLayout } from "@/components/layout/client-layout";
import { MasterDashboardPage } from "@/pages/master/dashboard-page";
import { MasterServicesPage } from "@/pages/master/services-page";
import { MasterProfilePage } from "@/pages/master/profile-page";
import { MasterRegisterPage } from "@/pages/master/register-page";
import { MasterClientsPage } from "@/pages/master/clients-page";
import { ClientBookingPage } from "@/pages/client/booking-page";

// Создаем клиент для React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function SelectRolePage() {
  const navigate = useNavigate();
  const [visitedSalons, setVisitedSalons] = useState<any[]>([]);

  // При загрузке страницы достаем историю салонов из памяти
  useEffect(() => {
    try {
      const history = JSON.parse(localStorage.getItem('visited_salons') || '[]');
      setVisitedSalons(history);
    } catch (e) {
      setVisitedSalons([]);
    }
  }, []);

  // === СЦЕНАРИЙ 1: ПОЛЬЗОВАТЕЛЬ УЖЕ БЫЛ В САЛОНАХ ===
  if (visitedSalons.length > 0) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F2F2F7] p-5 font-sans animate-in fade-in duration-500">
        <h1 className="text-[28px] font-extrabold text-black mb-6 mt-8 tracking-tight">Мои салоны</h1>

        <div className="space-y-3 flex-1">
          {visitedSalons.map((salon: any) => (
            <button
              key={salon.id}
              onClick={() => navigate(`/client/${salon.id}`)}
              className="w-full bg-white p-4 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 active:scale-95 transition-all group"
            >
              <div className="w-16 h-16 rounded-[18px] bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
                {salon.photo_url ? (
                  <img src={salon.photo_url} className="w-full h-full object-cover" alt={salon.name} />
                ) : (
                  <span className="text-[28px]">
                    {salon.niche === 'beauty' ? '💅' : salon.niche === 'grooming' ? '🐶' : '✨'}
                  </span>
                )}
              </div>
              <div className="text-left flex-1">
                <h3 className="font-bold text-[18px] text-black leading-tight">{salon.name}</h3>
                <p className="text-[14px] text-[#007AFF] font-bold mt-1">Записаться снова</p>
              </div>
              <ChevronRight className="text-[#C7C7CC] mr-2" size={20} />
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/master/register')}
          className="mt-8 py-4 text-[#8E8E93] text-[15px] font-medium w-full active:opacity-50"
        >
          Вы мастер? Открыть свой бизнес
        </button>
      </div>
    );
  }

  // === СЦЕНАРИЙ 2: АБСОЛЮТНО НОВЫЙ ПОЛЬЗОВАТЕЛЬ ===
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#F2F2F7] p-6 space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-black text-black tracking-tight">Grooming App</h1>
        <p className="text-[#8E8E93] font-medium px-4">Удобная запись для клиентов и управление для мастеров</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => navigate('/master/register')}
          className="w-full bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-5 active:scale-95 transition-all group"
        >
          <div className="w-14 h-14 bg-[#007AFF]/10 rounded-2xl flex items-center justify-center text-[#007AFF] group-active:scale-110 transition-transform">
            <Scissors size={28} />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-xl text-black">Я Мастер</h3>
            <p className="text-[13px] text-[#8E8E93] font-medium mt-0.5">Создать салон и расписание</p>
          </div>
        </button>

        <button
          onClick={() => {
            toast.info("Перейдите по ссылке от вашего мастера, чтобы записаться", {
              position: 'bottom-center'
            });
          }}
          className="w-full bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-5 active:scale-95 transition-all group"
        >
          <div className="w-14 h-14 bg-[#34C759]/10 rounded-2xl flex items-center justify-center text-[#34C759] group-active:scale-110 transition-transform">
            <User size={28} />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-xl text-black">Я Клиент</h3>
            <p className="text-[13px] text-[#8E8E93] font-medium mt-0.5">У меня есть ссылка</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-center" richColors />

        {/* 👇 ИСПРАВЛЕНИЕ: Используем AuthCheck */}
        <AuthCheck>
          <Routes>
            <Route path="/" element={<SelectRolePage />} />
            <Route path="/select-role" element={<SelectRolePage />} />
            <Route path="/master/register" element={<MasterRegisterPage />} />

            <Route path="/master" element={<MasterLayout />}>
              <Route index element={<MasterDashboardPage />} />
              <Route path="dashboard" element={<MasterDashboardPage />} />
              <Route path="services" element={<MasterServicesPage />} />
              <Route path="profile" element={<MasterProfilePage />} />
              <Route path="clients" element={<MasterClientsPage />} />
            </Route>

            <Route path="/client/:salonId" element={<ClientLayout />}>
              <Route index element={<ClientBookingPage />} />
            </Route>

            <Route path="*" element={<div className="p-10 text-center text-[#8E8E93]">404: Страница не найдена</div>} />
          </Routes>
        </AuthCheck>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;