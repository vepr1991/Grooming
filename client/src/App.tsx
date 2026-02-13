import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthCheck } from "@/components/auth-check";
import { Toaster } from "@/components/ui/sonner"; // Импорт уведомлений

import { MasterLayout } from "@/components/layout/master-layout";
import { ClientLayout } from "@/components/layout/client-layout";
import { MasterDashboardPage } from "@/pages/master/dashboard-page";
import { MasterServicesPage } from "@/pages/master/services-page";
import { MasterProfilePage } from "@/pages/master/profile-page";
import { MasterRegisterPage } from "@/pages/master/register-page";
import { ClientBookingPage } from "@/pages/client/booking-page";

function App() {
  return (
    <BrowserRouter>
      {/* Глобальный компонент уведомлений (всплывашки) */}
      <Toaster position="top-center" richColors />

      {/* Обертка для проверки авторизации */}
      <AuthCheck>
        <Routes>
          {/* 👇 Перенаправляем с корня "/" на "/master" */}
          <Route path="/" element={<Navigate to="/master" replace />} />

          {/* Регистрация */}
          <Route path="/master/register" element={<MasterRegisterPage />} />

          {/* Мастер */}
          <Route path="/master" element={<MasterLayout />}>
            <Route index element={<MasterDashboardPage />} />
            <Route path="services" element={<MasterServicesPage />} />
            <Route path="profile" element={<MasterProfilePage />} />
          </Route>

          {/* Клиент */}
          <Route path="/client/:salonId" element={<ClientLayout />}>
            <Route index element={<ClientBookingPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<div className="p-10 text-center text-white">404: Страница не найдена</div>} />
        </Routes>
      </AuthCheck>
    </BrowserRouter>
  );
}

export default App;