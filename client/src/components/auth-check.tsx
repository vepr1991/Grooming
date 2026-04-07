import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";

// Твой URL бекенда
const BACKEND_URL = "https://grooming-tma.onrender.com";

// Выносим лоадер в отдельную константу, чтобы переиспользовать
const LoadingScreen = () => (
  <div className="flex h-screen items-center justify-center bg-[#F2F2F7]">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="animate-spin text-[#007AFF]" size={40} />
      <p className="text-[#8E8E93] text-sm font-medium">Загрузка...</p>
    </div>
  </div>
);

export function AuthCheck({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'approved' | 'pending_approval' | 'guest'>('loading');

  useEffect(() => {
    // 1. Инициализация Telegram
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        // Устанавливаем цвет фона (белый для чистоты)
        tg.setBackgroundColor("#ffffff");
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      } catch (e) {
        console.error("Ошибка настройки TG", e);
      }
    }

    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkUser() {
    setStatus('loading');

    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    // @ts-ignore
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;

    try {
      // === СЦЕНАРИЙ 1: ЭТО КЛИЕНТ ПО ССЫЛКЕ ===
      // Если есть start_param (salon_123), то это точно клиент, идущий по ссылке
      if (startParam && startParam.startsWith('salon_')) {
        const salonId = startParam.replace('salon_', '');
        localStorage.setItem('last_visited_salon', salonId);

        // Сразу редиректим на страницу бронирования с replace: true
        if (!location.pathname.includes(`/client/${salonId}`)) {
           navigate(`/client/${salonId}`, { replace: true });
        }
        setStatus('guest'); // Разрешаем рендеринг
        return;
      }

      // === СЦЕНАРИЙ 2: ПРОВЕРКА МАСТЕРА ===
      if (tgUser?.id) {
        const res = await fetch(`${BACKEND_URL}/api/user-status/${tgUser.id}`);
        if (!res.ok) throw new Error("Ошибка сервера");

        const data = await res.json();

        if (data.isMaster && data.salonId) {
            // Это мастер. Сохраняем ID
            localStorage.setItem('salon_id', data.salonId);

            // 👇 ПРОВЕРКА НА ОДОБРЕНИЕ
            if (data.isApproved) {
                // ✅ ОДОБРЕН (Сразу меняем статус, чтобы избежать гонки)
                setStatus('approved');
                // Если он на главной или странице выбора роли — кидаем в дашборд (replace: true)
                if (location.pathname === '/' || location.pathname === '/select-role') {
                    navigate('/master/dashboard', { replace: true });
                }
            } else {
                // ⏳ НЕ ОДОБРЕН (ЖДЕТ)
                setStatus('pending_approval');
            }
        } else {
            // ❌ НОВИЧОК (Или клиент без ссылки)
            setStatus('guest');
            if (location.pathname === '/') navigate('/select-role', { replace: true });
        }
      } else {
        // ЗАПУСК В БРАУЗЕРЕ (Без Telegram)
        console.warn("Запущено вне Telegram");
        setStatus('guest');
        if (location.pathname === '/') navigate('/select-role', { replace: true });
      }

    } catch (e) {
      console.error("Ошибка проверки:", e);
      setStatus('guest');
      if (location.pathname === '/') navigate('/select-role', { replace: true });
    }
  }

  // 1. ЗАГРУЗКА
  if (status === 'loading') {
    return <LoadingScreen />;
  }

  // 2. ОЖИДАНИЕ ПРОВЕРКИ (ЗАГЛУШКА)
  if (status === 'pending_approval') {
      return (
        <div className="flex h-screen flex-col items-center justify-center bg-white p-6 text-center animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-orange-50">
                <ShieldAlert size={40} />
            </div>
            <h1 className="text-[24px] font-black text-black mb-2 leading-tight">Ваш аккаунт на проверке</h1>
            <p className="text-[16px] text-[#8E8E93] leading-relaxed mb-8 max-w-[280px]">
                Администратор уже получил вашу заявку. Обычно проверка занимает <b>15-30 минут</b>.
            </p>

            <button
                onClick={checkUser}
                className="w-full max-w-xs bg-[#007AFF] text-white py-4 rounded-[20px] font-bold text-[17px] shadow-xl shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <RefreshCw size={20} /> Проверить статус
            </button>

            <p className="mt-6 text-[12px] text-[#C7C7CC]">
                Вам придет уведомление в этот чат,<br/>когда доступ будет открыт.
            </p>
        </div>
      );
  }

  // 👇 ИСПРАВЛЕНИЕ МИГАНИЯ ЭКРАНА 👇
  // Блокируем рендер экрана "Я Мастер/Я Клиент", пока роутер переключается на Дашборд
  if (status === 'approved' && (location.pathname === '/' || location.pathname === '/select-role')) {
      return <LoadingScreen />;
  }

  // 3. ВСЁ ОК (Рендерим приложение)
  return <>{children}</>;
}