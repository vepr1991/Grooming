import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

// ЗАМЕНИ НА СВОЙ URL БЕКЕНДА С RENDER
const BACKEND_URL = "https://grooming-backend-up4v.onrender.com";

export function AuthCheck({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 1. Инициализация Telegram
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      document.body.style.backgroundColor = tg.backgroundColor || "#ffffff";
    }

    async function checkUser() {
      // @ts-ignore
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      // @ts-ignore
      const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;

      // === СЦЕНАРИЙ 1: КЛИЕНТ ПЕРЕШЕЛ ПО ССЫЛКЕ ===
      if (startParam && startParam.startsWith('salon_')) {
        const salonId = startParam.replace('salon_', '');
        console.log("Deep link в салон:", salonId);

        // Запоминаем этот салон как "любимый"
        localStorage.setItem('last_visited_salon', salonId);

        if (!location.pathname.includes(`/client/${salonId}`)) {
           navigate(`/client/${salonId}`);
        }
        setIsChecking(false);
        return;
      }

      // === СЦЕНАРИЙ 2: ПРОВЕРКА НА МАСТЕРА ===
      if (tgUser?.id) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/user-status/${tgUser.id}`);
          const data = await res.json();

          if (data.isMaster && data.salonId) {
            // ✅ ЭТО МАСТЕР
            localStorage.setItem('salon_id', data.salonId);

            // Если он не на странице клиента, отправляем в админку
            if (!location.pathname.startsWith('/client/')) {
               navigate('/master/dashboard');
            }
          } else {
            // ❌ ЭТО НОВЫЧОК
            // Если он на главной -> отправляем выбирать роль
            if (location.pathname === '/') {
               navigate('/select-role');
            }
          }
        } catch (e) {
          console.error("Ошибка API:", e);
        }
      } else {
        console.warn("Запущено вне Telegram");
        // navigate('/select-role'); // Раскомментировать для продакшена
      }

      setIsChecking(false);
    }

    checkUser();
  }, [navigate, location]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F2F2F7]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-[#007AFF]" size={40} />
          <p className="text-[#8E8E93] text-sm font-medium">Загрузка...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}