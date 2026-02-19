import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // 👈 НОВОЕ
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Scissors, User } from "lucide-react";

import { AuthProvider } from "@/providers/auth-provider"; // 👈 НОВОЕ (вместо AuthCheck)
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
      refetchOnWindowFocus: false, // Не перезапрашивать при смене вкладки
      retry: 1,
      staleTime: 1000 * 60 * 5, // Кэшировать данные на 5 минут
    },
  },
});

function SelectRolePage() {
  const navigate = useNavigate();

  const handleClientClick = () => {
    const lastSalon = localStorage.getItem('last_visited_salon');
    if (lastSalon) {
      navigate(`/client/${lastSalon}`);
    } else {
      toast.info("Чтобы записаться, перейдите по ссылке от мастера", {
        position: 'bottom-center'
      });
    }
  };

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
          onClick={handleClientClick}
          className="w-full bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-5 active:scale-95 transition-all group"
        >
          <div className="w-14 h-14 bg-[#34C759]/10 rounded-2xl flex items-center justify-center text-[#34C759] group-active:scale-110 transition-transform">
            <User size={28} />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-xl text-black">Я Клиент</h3>
            <p className="text-[13px] text-[#8E8E93] font-medium mt-0.5">
              {localStorage.getItem('last_visited_salon') ? 'Открыть последнюю запись' : 'У меня есть ссылка'}
            </p>
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

        <AuthProvider>
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
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;