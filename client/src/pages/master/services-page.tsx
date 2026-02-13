import { useEffect, useState } from "react";
import { Trash2, Plus, Scissors } from "lucide-react";
import { toast } from "sonner"; // <--- Импорт уведомлений

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Service = {
  id: string;
  title: string;
  price: number;
  duration_minutes: number;
};

export function MasterServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false); // Для закрытия модалки

  // Форма новой услуги
  const [newService, setNewService] = useState({ title: "", price: "", duration: "60" });

  const salonId = localStorage.getItem("salon_id");

  // 1. Загрузка услуг
  useEffect(() => {
    if (salonId) fetchServices();
  }, [salonId]);

  async function fetchServices() {
    const { data, error } = await supabase.from('services').select('*').eq('salon_id', salonId);
    if (error) {
        toast.error("Не удалось загрузить услуги");
    } else {
        setServices(data || []);
    }
    setLoading(false);
  }

  // 2. Создание услуги
  const handleAddService = async () => {
    if (!newService.title || !newService.price) {
        toast.warning("Заполните название и цену");
        return;
    }

    const { error } = await supabase.from('services').insert([
      {
        salon_id: salonId,
        title: newService.title,
        price: Number(newService.price),
        duration_minutes: Number(newService.duration),
      }
    ]);

    if (error) {
      toast.error("Ошибка: " + error.message);
    } else {
      toast.success("Услуга добавлена! 🎉");
      setNewService({ title: "", price: "", duration: "60" }); // Сброс формы
      setIsDialogOpen(false); // Закрываем окно
      fetchServices(); // Обновляем список
    }
  };

  // 3. Удаление услуги
  const handleDelete = async (id: string) => {
    // В вебе мы не можем кастомизировать window.confirm,
    // но для начала сойдет. В будущем заменим на красивый Dialog.
    if (!confirm("Вы уверены, что хотите удалить эту услугу?")) return;

    const { error } = await supabase.from('services').delete().eq('id', id);

    if (error) {
      toast.error("Ошибка удаления");
    } else {
      toast.success("Услуга удалена");
      fetchServices();
    }
  };

  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мои услуги</h1>

        {/* Модальное окно добавления */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full h-10 w-10 bg-black text-white shadow-lg">
              <Plus className="h-6 w-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Новая услуга</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  placeholder="Стрижка йорка"
                  value={newService.title}
                  onChange={e => setNewService({...newService, title: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена (₸)</Label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={newService.price}
                    onChange={e => setNewService({...newService, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Время (мин)</Label>
                  <Input
                    type="number"
                    placeholder="60"
                    value={newService.duration}
                    onChange={e => setNewService({...newService, duration: e.target.value})}
                  />
                </div>
              </div>
              <Button onClick={handleAddService} className="w-full bg-black text-white">
                Добавить
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 mt-10">Загрузка...</div>
      ) : services.length === 0 ? (
        <div className="text-center text-gray-400 mt-10 p-10 border-2 border-dashed rounded-xl">
            <Scissors className="h-10 w-10 mx-auto mb-2 opacity-50"/>
            <p>Услуг пока нет</p>
            <p className="text-sm">Нажмите +, чтобы добавить</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {services.map((s) => (
            <Card key={s.id} className="shadow-sm">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{s.title}</h3>
                  <div className="text-sm text-gray-500 flex gap-3">
                    <span>{s.duration_minutes} мин</span>
                    <span className="font-medium text-black">{s.price} ₸</span>
                  </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(s.id)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}