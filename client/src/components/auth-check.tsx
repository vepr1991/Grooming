import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";

// ЗАМЕНИ НА СВОЙ URL БЕКЕНДА (Python API)
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

      // --- СЦЕНАРИЙ 1: КЛИЕНТ (Перешел по ссылке с ID салона) ---
      // Пример ссылки: t.me/bot?startapp=salon_55
      if (startParam && startParam.startsWith('salon_')) {
        const salonId = startParam.replace('salon_', '');
        console.log("Клиент перешел по ссылке в салон:", salonId);

        // Сразу перенаправляем на запись, не проверяя, мастер он или нет
        if (!location.pathname.includes(`/client/${salonId}`)) {
           navigate(`/client/${salonId}`);
        }
        setIsChecking(false);
        return;
      }

      // --- СЦЕНАРИЙ 2: МАСТЕР (Открыл приложение сам) ---
      if (tgUser?.id) {
        try {
          // Спрашиваем у бекенда, есть ли у этого юзера салон
          const res = await fetch(`${BACKEND_URL}/api/user-status/${tgUser.id}`);
          const data = await res.json();

          if (data.isMaster && data.salonId) {
            // ✅ ЭТО МАСТЕР
            console.log("Авторизован как Мастер, ID салона:", data.salonId);
            localStorage.setItem('salon_id', data.salonId);

            // Если он на главной или странице регистрации -> в Админку
            if (location.pathname === '/' || location.pathname === '/register' || location.pathname === '/select-role') {
               navigate('/master/dashboard');
            }
          } else {
            // ❌ ЭТО НОВИЧОК (Или клиент без ссылки)
            console.log("Новый пользователь");
            // Если он пытается попасть в админку без прав -> на выбор роли
            if (location.pathname.startsWith('/master')) {
               navigate('/select-role');
            }
            // Если он просто открыл приложение -> на выбор роли
            if (location.pathname === '/') {
               navigate('/select-role');
            }
          }
        } catch (e) {
          console.error("Ошибка проверки юзера:", e);
        }
      } else {
        // --- СЦЕНАРИЙ 3: БРАУЗЕР (Отладка) ---
        console.warn("Запущено не в Telegram");
        // navigate('/select-role'); // Раскомментируй для продакшена
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