import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MasterLayout } from "@/components/layout/master-layout";
import { ClientLayout } from "@/components/layout/client-layout";
import { MasterServicesPage } from "@/pages/master/services-page";
import { MasterProfilePage } from "@/pages/master/profile-page";
import { ClientBookingPage } from "@/pages/client/booking-page";
import { MasterDashboardPage } from "@/pages/master/dashboard-page";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Роуты Мастера */}
        <Route path="/master" element={<MasterLayout />}>
          <Route index element={<MasterDashboardPage />} />
          <Route path="services" element={<MasterServicesPage />} />
          <Route path="profile" element={<MasterProfilePage />} />
        </Route>

        {/* Роуты Клиента */}
        <Route path="/client/:salonId" element={<ClientLayout />}>
          <Route index element={<ClientBookingPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<div className="p-4 text-center mt-10">404: Страница не найдена</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;