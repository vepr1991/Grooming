import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthCheck } from "@/components/auth-check";
import { Toaster } from "@/components/ui/sonner";
import { Scissors, User } from "lucide-react";

import { MasterLayout } from "@/components/layout/master-layout";
import { ClientLayout } from "@/components/layout/client-layout";
import { MasterDashboardPage } from "@/pages/master/dashboard-page";
import { MasterServicesPage } from "@/pages/master/services-page";
import { MasterProfilePage } from "@/pages/master/profile-page";
import { MasterRegisterPage } from "@/pages/master/register-page";
import { ClientBookingPage } from "@/pages/client/booking-page";

// Простая страница выбора роли для новых пользователей
function SelectRolePage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#F2F2F7] p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-black">Добро пожаловать!</h1>
        <p className="text-[#8E8E93]">Выберите, как вы хотите продолжить</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => navigate('/master/register')}
          className="w-full bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 active:scale-95 transition-all"
        >
          <div className="w-12 h-12 bg-[#007AFF]/10 rounded-full flex items-center justify-center text-[#007AFF]">
            <Scissors size={24} />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-lg text-black">Я Грумер</h3>
            <p className="text-sm text-[#8E8E93]">Хочу управлять записями</p>
          </div>
        </button>

        <button
          onClick={() => alert("Чтобы записаться, перейдите по ссылке, которую вам отправил мастер.")}
          className="w-full bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-4 active:scale-95 transition-all"
        >
          <div className="w-12 h-12 bg-[#34C759]/10 rounded-full flex items-center justify-center text-[#34C759]">
            <User size={24} />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-lg text-black">Я Клиент</h3>
            <p className="text-sm text-[#8E8E93]">Хочу записать питомца</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />

      <AuthCheck>
        <Routes>
          {/* Главная - теперь роутер сам решит, куда перенаправить (через AuthCheck) */}
          <Route path="/" element={<div />} />

          <Route path="/select-role" element={<SelectRolePage />} />

          {/* Регистрация мастера */}
          <Route path="/master/register" element={<MasterRegisterPage />} />

          {/* Панель мастера */}
          <Route path="/master" element={<MasterLayout />}>
            <Route path="dashboard" element={<MasterDashboardPage />} />
            <Route path="services" element={<MasterServicesPage />} />
            <Route path="profile" element={<MasterProfilePage />} />
          </Route>

          {/* Запись клиента */}
          <Route path="/client/:salonId" element={<ClientLayout />}>
            <Route index element={<ClientBookingPage />} />
          </Route>

          <Route path="*" element={<div className="p-10 text-center text-[#8E8E93]">404: Страница не найдена</div>} />
        </Routes>
      </AuthCheck>
    </BrowserRouter>
  );
}

export default App;