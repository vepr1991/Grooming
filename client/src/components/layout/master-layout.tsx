import { Outlet, Link, useLocation } from "react-router-dom";
import { CalendarDays, Scissors, UserCircle } from "lucide-react";

export function MasterLayout() {
  const location = useLocation();

  // Функция для подсветки активной кнопки
  const isActive = (path: string) => location.pathname === path ? "text-primary" : "text-muted-foreground";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Основной контент (скроллится) */}
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>

      {/* Нижнее меню навигации (фиксировано) */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex justify-around items-center h-16">
          <Link to="/master" className={`flex flex-col items-center gap-1 ${isActive("/master")}`}>
            <CalendarDays className="h-5 w-5" />
            <span className="text-xs">Записи</span>
          </Link>

          <Link to="/master/services" className={`flex flex-col items-center gap-1 ${isActive("/master/services")}`}>
            <Scissors className="h-5 w-5" />
            <span className="text-xs">Услуги</span>
          </Link>

          <Link to="/master/profile" className={`flex flex-col items-center gap-1 ${isActive("/master/profile")}`}>
            <UserCircle className="h-5 w-5" />
            <span className="text-xs">Профиль</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}