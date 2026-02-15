import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react"; // Добавил иконку обновления

// Твой URL бекенда
const BACKEND_URL = "https://grooming-backend-up4v.onrender.com";

export function AuthCheck({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null); // Для отображения ошибки

  useEffect(() => {
    // 1. Инициализация Telegram
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      document.body.style.backgroundColor = tg.backgroundColor || "#ffffff";
    }

    checkUser();
  }, [navigate, location]);

  async function checkUser() {
    setIsChecking(true);
    setError(null);

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

      // === СЦЕНАРИЙ 2: ПРОВЕРКА РОЛИ (Только если есть user) ===
      if (tgUser?.id) {
        // Ставим таймаут 10 секунд (чтобы долго не висеть)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const res = await fetch(`${BACKEND_URL}/api/user-status/${tgUser.id}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error("Сервер не отвечает");

            const data = await res.json();

            if (data.isMaster && data.salonId) {
                localStorage.setItem('salon_id', data.salonId);
                if (!location.pathname.startsWith('/client/')) {
                    navigate('/master/dashboard');
                }
            } else {
                if (location.pathname === '/') {
                    navigate('/select-role');
                }
            }
        } catch (fetchError) {
            console.error("Ошибка сети или таймаут:", fetchError);
            // ФОЛЛБЭК: Если сервер упал, всё равно пускаем пользователя выбрать роль
            // (он не сможет записаться, но приложение откроется)
            if (location.pathname === '/') {
                navigate('/select-role');
            }
        }
      } else {
        // Если открыли в браузере
        if (location.pathname === '/') {
             navigate('/select-role');
        }
      }
    } catch (e) {
      console.error("Общая ошибка:", e);
      setError("Произошла ошибка при запуске.");
    } finally {
      setIsChecking(false);
    }
  }

  if (isChecking) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#F2F2F7] p-6 text-center">
        <Loader2 className="animate-spin text-[#007AFF] mb-4" size={48} />
        <h3 className="text-lg font-bold text-black">Запускаем Grooming App...</h3>
        <p className="text-sm text-[#8E8E93] mt-2">
            Первый запуск может занять до 30 секунд (сервер просыпается 😴)
        </p>
      </div>
    );
  }

  if (error) {
      return (
        <div className="flex flex-col h-screen items-center justify-center bg-white p-6 text-center">
            <h3 className="text-xl font-bold text-red-500 mb-2">Ошибка запуска</h3>
            <p className="text-gray-600 mb-6">{error}</p>
            <button onClick={() => window.location.reload()} className="bg-[#007AFF] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2">
                <RefreshCw size={20}/> Попробовать снова
            </button>
        </div>
      )
  }

  return <>{children}</>;
}