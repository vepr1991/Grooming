import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Scissors, User, Users } from "lucide-react";

export function MasterLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.includes(path);

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7]">
      {/* Основной контент */}
      {/* 👇 ИСПРАВЛЕНИЕ: overflow-y-auto вместо overflow-hidden */}
      <div className="flex-1 overflow-y-auto relative no-scrollbar">
        <Outlet />
      </div>

      {/* Нижняя навигация */}
      <nav className="bg-white border-t border-slate-200 pb-safe pt-3 px-6 h-[88px] shrink-0 z-50">
        <div className="flex justify-between items-start max-w-md mx-auto">

          <button
            onClick={() => navigate('/master/dashboard')}
            className={`flex flex-col items-center gap-1 w-16 active:scale-95 transition-all ${isActive('/dashboard') ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
          >
            <LayoutDashboard size={26} strokeWidth={isActive('/dashboard') ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Записи</span>
          </button>

          <button
            onClick={() => navigate('/master/services')}
            className={`flex flex-col items-center gap-1 w-16 active:scale-95 transition-all ${isActive('/services') ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
          >
            <Scissors size={26} strokeWidth={isActive('/services') ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Услуги</span>
          </button>

          <button
            onClick={() => navigate('/master/clients')}
            className={`flex flex-col items-center gap-1 w-16 active:scale-95 transition-all ${isActive('/clients') ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
          >
            <Users size={26} strokeWidth={isActive('/clients') ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Клиенты</span>
          </button>

          <button
            onClick={() => navigate('/master/profile')}
            className={`flex flex-col items-center gap-1 w-16 active:scale-95 transition-all ${isActive('/profile') ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
          >
            <User size={26} strokeWidth={isActive('/profile') ? 2.5 : 2} />
            <span className="text-[10px] font-bold">Профиль</span>
          </button>

        </div>
      </nav>
    </div>
  );
}