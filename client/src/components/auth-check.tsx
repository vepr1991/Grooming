import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

// Твой URL бекенда
const BACKEND_URL = "https://grooming-tma.onrender.com";

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

      try {
        // === СЦЕНАРИЙ 1: КЛИЕНТ ПО ССЫЛКЕ ===
        if (startParam && startParam.startsWith('salon_')) {
            const salonId = startParam.replace('salon_', '');
            localStorage.setItem('last_visited_salon', salonId);

            if (!location.pathname.includes(`/client/${salonId}`)) {
               navigate(`/client/${salonId}`);
            }
            setIsChecking(false);
            return;
        }

        // === СЦЕНАРИЙ 2: ПРОВЕРКА МАСТЕРА ===
        if (tgUser?.id) {
            // Запрос к API
            const res = await fetch(`${BACKEND_URL}/api/user-status/${tgUser.id}`);

            if (!res.ok) {
                throw new Error("Ошибка сервера");
            }

            const data = await res.json();

            if (data.isMaster && data.salonId) {
                // ✅ ЭТО МАСТЕР
                localStorage.setItem('salon_id', data.salonId);
                if (!location.pathname.startsWith('/client/')) {
                   navigate('/master/dashboard');
                }
            } else {
                // ❌ НОВИЧОК
                if (location.pathname === '/') navigate('/select-role');
            }
        } else {
            // ЗАПУСК В БРАУЗЕРЕ (Без Telegram)
            console.warn("Запущено вне Telegram");
            if (location.pathname === '/') navigate('/select-role');
        }

      } catch (e) {
          console.error("Ошибка при проверке пользователя:", e);
          // СПАСАТЕЛЬНЫЙ КРУГ: Если ошибка, всё равно пускаем на выбор роли
          if (location.pathname === '/') navigate('/select-role');
      } finally {
          setIsChecking(false);
      }
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