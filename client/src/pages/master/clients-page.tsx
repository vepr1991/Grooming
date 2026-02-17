import { useEffect, useState } from "react";
import {
  Search,
  User,
  Phone,
  Calendar,
  MessageSquare,
  Scissors,
  ChevronRight,
  Loader2,
  PawPrint
} from "lucide-react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function MasterClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const salonId = localStorage.getItem("salon_id");

  useEffect(() => {
    async function load() {
      if (!salonId) return;
      try {
        const data = await api.getClients(salonId);
        setClients(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [salonId]);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.pet_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pt-10 pb-28 bg-[#F2F2F7] min-h-screen font-sans">
      <div className="px-5">
        <h1 className="text-[32px] font-extrabold tracking-tight text-black mb-4">Клиенты</h1>

        {/* Поиск */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E93]" size={18} />
          <input
            type="text"
            placeholder="Имя, телефон или кличка..."
            className="w-full bg-white border-none rounded-2xl py-3.5 pl-12 pr-4 text-[17px] outline-none shadow-sm focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-5 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#007AFF]" /></div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-20 text-[#8E8E93] bg-white rounded-3xl border border-dashed">
            Никого не нашли
          </div>
        ) : (
          filteredClients.map((client, i) => (
            <ClientCard key={i} client={client} />
          ))
        )}
      </div>
    </div>
  );
}

function ClientCard({ client }: { client: any }) {
  // Определяем линк для связи (ТГ или Ватсап)
  let tgUsername = null;
  if (client.tg_user) {
    const user = typeof client.tg_user === 'string' ? JSON.parse(client.tg_user) : client.tg_user;
    tgUsername = user?.username;
  }
  const chatLink = tgUsername ? `https://t.me/${tgUsername}` : `https://wa.me/${client.phone.replace(/\D/g,'')}`;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 active:scale-[0.98] transition-all">
      <div className="w-14 h-14 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#007AFF] shrink-0">
        <User size={28} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <h3 className="text-[17px] font-bold text-black truncate">{client.name}</h3>
          <a href={chatLink} target="_blank" className="text-[#007AFF] bg-[#007AFF]/5 p-2 rounded-full">
            <MessageSquare size={18} />
          </a>
        </div>

        <div className="flex items-center gap-2 text-[#8E8E93] text-[13px] mt-0.5">
          <PawPrint size={14} className="text-orange-400" />
          <span className="font-medium">{client.pet_name}</span>
          {client.pet_breed && <span className="opacity-60">• {client.pet_breed}</span>}
        </div>

        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-50">
          <div className="flex items-center gap-1 text-[11px] font-bold text-[#8E8E93] uppercase">
            <Scissors size={12} /> {client.total_visits} визитов
          </div>
          <div className="flex items-center gap-1 text-[11px] font-bold text-[#8E8E93] uppercase">
            <Calendar size={12} /> Был {format(new Date(client.last_visit.substring(0,10)), 'd MMM', { locale: ru })}
          </div>
        </div>
      </div>
    </div>
  );
}