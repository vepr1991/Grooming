import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";

// Типизация контекста
type AuthContextType = {
  isMaster: boolean;
  salonId: string | null;
  isApproved: boolean;
  user: any;
  isLoading: boolean;
  checkUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BACKEND_URL = "https://grooming-tma.onrender.com";

// Явно определяем тип статуса
type AuthStatus = 'loading' | 'approved' | 'pending_approval' | 'guest';

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Используем явный тип
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [salonId, setSalonId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try { tg.setBackgroundColor("#ffffff"); if (tg.enableClosingConfirmation) tg.enableClosingConfirmation(); } catch (e) {}
      // @ts-ignore
      setUser(tg.initDataUnsafe?.user);
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
      // 1. Клиент по ссылке
      if (startParam && startParam.startsWith('salon_')) {
        const sid = startParam.replace('salon_', '');
        localStorage.setItem('last_visited_salon', sid);
        if (!location.pathname.includes(`/client/${sid}`)) navigate(`/client/${sid}`);
        setStatus('guest');
        return;
      }

      // 2. Проверка мастера
      if (tgUser?.id) {
        const res = await fetch(`${BACKEND_URL}/api/user-status/${tgUser.id}`);
        if (!res.ok) throw new Error("Ошибка сервера");
        const data = await res.json();

        if (data.isMaster && data.salonId) {
            setSalonId(data.salonId);
            localStorage.setItem('salon_id', data.salonId);

            if (data.isApproved) {
                setStatus('approved');
                if (['/', '/select-role'].includes(location.pathname)) navigate('/master/dashboard');
            } else {
                setStatus('pending_approval');
            }
        } else {
            setStatus('guest');
            if (location.pathname === '/') navigate('/select-role');
        }
      } else {
        setStatus('guest');
        if (location.pathname === '/') navigate('/select-role');
      }
    } catch (e) {
      console.error("Auth error:", e);
      setStatus('guest');
    }
  }

  // РЕНДЕР: 1. ЗАГРУЗКА
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F2F2F7]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-[#007AFF]" size={40} />
          <p className="text-[#8E8E93] text-sm font-medium">Загрузка...</p>
        </div>
      </div>
    );
  }

  // РЕНДЕР: 2. ОЖИДАНИЕ ПРОВЕРКИ
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
        </div>
      );
  }

  // РЕНДЕР: 3. ПРИЛОЖЕНИЕ (Status точно не 'loading' и не 'pending_approval')
  return (
    <AuthContext.Provider value={{
        isMaster: status === 'approved',
        isApproved: status === 'approved',
        salonId,
        user,
        isLoading: false, // 👈 ИСПРАВЛЕНО: тут мы точно знаем, что не loading
        checkUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};