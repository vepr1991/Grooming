import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Store, MapPin, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function MasterRegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", address: "", phone: "" });
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [telegramName, setTelegramName] = useState<string>("");

  useEffect(() => {
    // Получаем данные из Телеграма
    // @ts-ignore
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

    if (tgUser) {
      setTelegramId(tgUser.id);
      setTelegramName(tgUser.first_name);
    } else {
      // Фейк данные для теста в браузере (чтобы ты мог верстать без телефона)
      // setTelegramId(123456);
      // setTelegramName("TestUser");
    }
  }, []);

  const handleRegister = async () => {
    if (!formData.name || !telegramId) return;
    setLoading(true);

    // 1. Создаем салон
    const { data, error } = await supabase.from('salons').insert([
      {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        telegram_chat_id: telegramId, // <--- Привязываем навсегда
        slug: `salon_${telegramId}_${Date.now()}` // Генерируем уникальный slug
      }
    ]).select().single();

    if (error) {
      alert("Ошибка: " + error.message);
    } else if (data) {
      // 2. Успех!
      localStorage.setItem('salon_id', data.id);
      navigate('/master'); // Пускаем в админку
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl border-none">
        <CardHeader className="bg-zinc-900 text-white rounded-t-xl">
          <CardTitle>Добро пожаловать!</CardTitle>
          <CardDescription className="text-zinc-400">
            {telegramName ? `Привет, ${telegramName}!` : "Привет!"} <br/>
            Давайте создадим ваш салон.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Store className="h-4 w-4"/> Название салона
            </Label>
            <Input
              placeholder="Grooming Star"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Phone className="h-4 w-4"/> Телефон для клиентов
            </Label>
            <Input
              placeholder="+7 700 000 00 00"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4"/> Адрес
            </Label>
            <Input
              placeholder="Алматы, Абая 10"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>

          {telegramId ? (
             <Button onClick={handleRegister} className="w-full bg-black hover:bg-zinc-800 text-white mt-4" disabled={loading}>
               {loading ? "Создаем..." : "Создать салон и Войти"}
             </Button>
          ) : (
            <div className="text-red-500 text-sm text-center mt-4 bg-red-50 p-2 rounded">
              Ошибка: Не удалось получить Telegram ID. Откройте приложение через бота.
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}