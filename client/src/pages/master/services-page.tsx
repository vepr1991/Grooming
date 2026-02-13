import { useEffect, useState } from "react";
import { Plus, Trash2, Clock, Banknote } from "lucide-react";
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
  DialogFooter,
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
  const [newService, setNewService] = useState({ title: "", price: "", duration: "60" });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setServices(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleAddService = async () => {
    if (!newService.title || !newService.price) return;

    // Временное решение без salon_id
    const { error } = await supabase.from('services').insert([
      {
        title: newService.title,
        price: Number(newService.price),
        duration_minutes: Number(newService.duration),
      }
    ]);

    if (error) {
      alert("Ошибка: " + error.message);
    } else {
      setIsDialogOpen(false);
      setNewService({ title: "", price: "", duration: "60" });
      fetchServices();
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm("Удалить эту услугу?")) return;

    const { error } = await supabase.from('services').delete().eq('id', id);

    if (error) {
      alert("Не удалось удалить");
    } else {
      setServices(services.filter(s => s.id !== id));
    }
  };

  return (
    <div className="p-4 pb-24 space-y-4 min-h-screen bg-zinc-50">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Услуги</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full h-10 w-10 shadow-lg bg-black text-white">
              <Plus className="h-6 w-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новая услуга</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  placeholder="Например: Стрижка Шпица"
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
                    value={newService.duration}
                    onChange={e => setNewService({...newService, duration: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddService} className="w-full">Создать услугу</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 mt-10">Загрузка...</div>
      ) : services.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          Список пуст. Нажми «+» чтобы добавить.
        </div>
      ) : (
        <div className="grid gap-3">
          {services.map((service) => (
            <Card key={service.id} className="overflow-hidden border-none shadow-sm">
              <CardContent className="p-0 flex">
                <div className="flex-1 p-4 bg-white">
                  <h3 className="font-bold text-lg">{service.title}</h3>
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Banknote className="h-4 w-4" /> {service.price} ₸
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" /> {service.duration_minutes} мин
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteService(service.id)}
                  className="w-16 bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors border-l"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}