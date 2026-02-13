import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export function AuthCheck({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 1. Инициализация Telegram Mini App
    // @ts-ignore
    const tg = window.Telegram?.WebApp;

    if (tg) {
      tg.ready();
      tg.expand(); // Раскрываем на весь экран

      // Настраиваем цвета под тему Телеграма
      document.body.style.backgroundColor = tg.backgroundColor || "#ffffff";
    }

    async function checkUser() {
      // @ts-ignore
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

      // СЦЕНАРИЙ А: Открыли НЕ в Телеграме (например, в браузере для теста)
      if (!tgUser) {
        console.warn("Приложение открыто не в Telegram. ID не получен.");
        // Для удобства разработки, если мы локально - пускаем (или можно закомментировать)
        setIsChecking(false);
        return;
      }

      const tgId = tgUser.id; // Получаем реальный ID

      // СЦЕНАРИЙ Б: Ищем салон по этому ID
      const { data: salon } = await supabase
        .from('salons')
        .select('id')
        .eq('telegram_chat_id', tgId)
        .single();

      if (salon) {
        // ✅ Мастер найден!
        console.log("Мастер найден:", salon.id);
        localStorage.setItem('salon_id', salon.id); // Сохраняем в память

        // Если он случайно попал на регистрацию — кидаем в админку
        if (location.pathname === '/master/register') {
          navigate('/master');
        }
      } else {
        // ❌ Мастер НЕ найден (Новичок)
        console.log("Новый пользователь. Редирект на регистрацию.");

        // Если он пытается зайти в админку — кидаем на регистрацию
        // (Но не трогаем клиента, клиент идет по своей ссылке /client/...)
        if (location.pathname.startsWith('/master') && location.pathname !== '/master/register') {
          navigate('/master/register');
        }
      }

      setIsChecking(false);
    }

    checkUser();
  }, [navigate, location]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p>Вход в систему...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}