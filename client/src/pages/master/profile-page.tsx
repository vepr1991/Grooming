import { useEffect, useState } from "react";
import { Save, Share2, MapPin, Phone, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function MasterProfilePage() {
  const [loading, setLoading] = useState(false);
  const [salonId, setSalonId] = useState<string | null>(localStorage.getItem("salon_id"));

  // Данные формы
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    description: "",
    slug: "", // Уникальная ссылка (например: grooming_almaty)
  });

  // 1. Загрузка данных (если салон уже есть)
  useEffect(() => {
    if (salonId) {
      async function loadSalon() {
        const { data } = await supabase.from('salons').select('*').eq('id', salonId).single();
        if (data) {
          setFormData({
            name: data.name || "",
            address: data.address || "",
            phone: data.phone || "",
            description: data.description || "",
            slug: data.slug || "",
          });
        }
      }
      loadSalon();
    }
  }, [salonId]);

// 2. Сохранение (Создание или Обновление)
  const handleSave = async () => {
    setLoading(true);

    // Подготовка данных
    const payload = {
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      description: formData.description,
      slug: formData.slug || `salon_${Date.now()}`,
    };

    let error;

    // ВАЖНО: Убрали переменную newId, она путала TypeScript

    if (salonId) {
      // Обновляем существующий (тут у нас точно есть salonId)
      const res = await supabase.from('salons').update(payload).eq('id', salonId);
      error = res.error;
    } else {
      // Создаем новый
      const res = await supabase.from('salons').insert([payload]).select().single();
      error = res.error;

      if (res.data) {
        const createdId = res.data.id; // Берем ID напрямую из ответа базы
        setSalonId(createdId);
        localStorage.setItem("salon_id", createdId); // И сохраняем именно его
      }
    }

    setLoading(false);

    if (error) {
      alert("Ошибка: " + error.message);
    } else {
      alert("Профиль сохранен!");
    }
  };

  // Ссылка для клиента
  // В реальном Telegram это будет t.me/botname?startapp=salonId
  // Пока используем прямую ссылку на сайт
  const clientLink = salonId
    ? `${window.location.origin}/client/${salonId}`
    : "Сначала сохраните профиль";

  return (
    <div className="p-4 pb-24 space-y-6 min-h-screen bg-zinc-50">
      <h1 className="text-2xl font-bold">Профиль салона</h1>

      {/* Карточка со ссылкой */}
      {salonId && (
        <Card className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white border-none">
          <CardHeader>
            <CardTitle className="text-lg">Ваша ссылка для клиентов</CardTitle>
            <CardDescription className="text-zinc-400">
              Отправьте её клиенту или добавьте в описание бота
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-white/10 rounded mb-3 text-xs font-mono break-all">
              {clientLink}
            </div>
            <Button
              variant="secondary"
              className="w-full gap-2"
              onClick={() => {
                navigator.clipboard.writeText(clientLink);
                alert("Ссылка скопирована!");
              }}
            >
              <Share2 className="h-4 w-4" /> Скопировать ссылку
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Форма редактирования */}
      <Card>
        <CardContent className="space-y-4 pt-6">

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Store className="h-4 w-4"/> Название салона</Label>
            <Input
              placeholder="Grooming Studio Almaty"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label>Уникальный ID (Slug)</Label>
            <Input
              placeholder="best_grooming"
              value={formData.slug}
              onChange={e => setFormData({...formData, slug: e.target.value})}
            />
            <p className="text-xs text-gray-500">Латинскими буквами, без пробелов.</p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><MapPin className="h-4 w-4"/> Адрес</Label>
            <Input
              placeholder="ул. Абая 150, оф. 2"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Phone className="h-4 w-4"/> Телефон для связи</Label>
            <Input
              placeholder="+7 777 000 00 00"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label>Описание</Label>
            <Textarea
              placeholder="Лучшие стрижки для йорков и шпицев..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <Button onClick={handleSave} className="w-full bg-black text-white" disabled={loading}>
            {loading ? "Сохранение..." : "Сохранить изменения"}
            {!loading && <Save className="ml-2 h-4 w-4" />}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}