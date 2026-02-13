import { useEffect, useState } from "react";
import { Save, Share2, MapPin, Phone, Store, Clock } from "lucide-react";
import { toast } from "sonner"; // <--- Импортируем тостер

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input"; // <--- Используем наш красивый инпут

export function MasterProfilePage() {
  const [loading, setLoading] = useState(false);
  const [salonId, setSalonId] = useState<string | null>(localStorage.getItem("salon_id"));

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    description: "",
    slug: "",
    work_start: "10:00",
    work_end: "20:00",
  });

  // 1. Загрузка
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
            work_start: data.work_start || "10:00",
            work_end: data.work_end || "20:00",
          });
        }
      }
      loadSalon();
    }
  }, [salonId]);

  // 2. Сохранение
  const handleSave = async () => {
    setLoading(true);
    // Запускаем красивый лоадер
    const toastId = toast.loading("Сохраняем изменения...");

    const payload = {
      name: formData.name,
      address: formData.address,
      phone: formData.phone,
      description: formData.description,
      slug: formData.slug,
      work_start: formData.work_start,
      work_end: formData.work_end,
    };

    const { error } = await supabase.from('salons').update(payload).eq('id', salonId);
    setLoading(false);

    // Убираем лоадер и показываем результат
    toast.dismiss(toastId);

    if (error) {
      toast.error("Ошибка сохранения: " + error.message);
    } else {
      toast.success("Профиль успешно обновлен!");
    }
  };

  // Копирование ссылки
  const copyLink = () => {
    if (salonId) {
      const link = `${window.location.origin}/client/${salonId}`;
      navigator.clipboard.writeText(link);
      toast.success("Ссылка скопирована в буфер обмена!");
    }
  };

  const clientLink = salonId ? `${window.location.origin}/client/${salonId}` : "";

  return (
    <div className="p-4 pb-24 space-y-6 bg-zinc-50 min-h-screen">
      <h1 className="text-2xl font-bold">Настройки салона</h1>

      {/* ССЫЛКА */}
      <Card className="bg-zinc-900 text-white border-none shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Ссылка для записи</CardTitle>
          <CardDescription className="text-zinc-400">Отправьте её клиентам</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-white/10 rounded mb-3 text-xs font-mono break-all text-zinc-300">
            {clientLink}
          </div>
          <Button
            variant="secondary"
            className="w-full gap-2 hover:bg-zinc-200 transition-colors"
            onClick={copyLink}
          >
            <Share2 className="h-4 w-4" /> Скопировать
          </Button>
        </CardContent>
      </Card>

      {/* ФОРМА */}
      <Card>
        <CardContent className="space-y-4 pt-6">

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Store className="h-4 w-4 text-zinc-500"/> Название</Label>
            <Input
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Clock className="h-4 w-4 text-zinc-500"/> График работы</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-500">Начало</Label>
                <Input
                  type="time"
                  value={formData.work_start}
                  onChange={e => setFormData({...formData, work_start: e.target.value})}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Конец</Label>
                <Input
                  type="time"
                  value={formData.work_end}
                  onChange={e => setFormData({...formData, work_end: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><MapPin className="h-4 w-4 text-zinc-500"/> Адрес</Label>
            <Input
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Phone className="h-4 w-4 text-zinc-500"/> Телефон</Label>
            <PhoneInput
              value={formData.phone}
              onChange={(val) => setFormData({...formData, phone: val})}
            />
          </div>

          <div className="space-y-2">
            <Label>Описание</Label>
            <Textarea
              className="h-24"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <Button onClick={handleSave} className="w-full bg-green-600 hover:bg-green-700 text-white h-12 shadow-md">
            {loading ? "Сохраняем..." : "Сохранить изменения"}
            {!loading && <Save className="ml-2 h-4 w-4" />}
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}