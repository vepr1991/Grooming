import { useEffect, useState } from "react";
import {
  Search,
  Calendar,
  MessageSquare,
  Scissors,
  Loader2,
  PawPrint,
  ChevronDown,
  Copy
} from "lucide-react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

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
  const [expanded, setExpanded] = useState(false);

  // Определяем линк для связи (ТГ или Ватсап)
  let tgUsername = null;
  if (client.tg_user) {
    const user = typeof client.tg_user === 'string' ? JSON.parse(client.tg_user) : client.tg_user;
    tgUsername = user?.username;
  }

  const cleanPhone = client.phone.replace(/[^0-9+]/g, '');
  const chatLink = tgUsername ? `https://t.me/${tgUsername}` : `https://wa.me/${cleanPhone}`;
  const isTelegram = !!tgUsername;

  return (
    <div
      className={`bg-white rounded-[20px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden ${expanded ? 'shadow-md' : ''}`}
    >
      {/* Шапка карточки (всегда видна) */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer active:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#007AFF] shrink-0 font-bold text-lg">
            {client.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h3 className="text-[17px] font-bold text-black truncate">{client.name}</h3>
            <div className="flex items-center gap-1.5 text-[#8E8E93] text-[13px]">
              <PawPrint size={14} className="text-orange-400 shrink-0" />
              <span className="truncate font-medium">{client.pet_name}</span>
            </div>
          </div>
        </div>

        <ChevronDown
          size={20}
          className={`text-[#C7C7CC] transition-transform duration-300 shrink-0 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Раскрывающийся контент */}
      {expanded && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          <div className="pt-3 border-t border-[#F2F2F7] space-y-4">

            {/* Детали питомца (полный текст) */}
            <div className="bg-[#F2F2F7] rounded-xl p-3">
              <div className="flex items-start gap-2 mb-1">
                <span className="text-[11px] font-bold text-[#8E8E93] uppercase mt-0.5">Питомец</span>
              </div>
              <p className="text-[15px] font-bold text-black break-words leading-tight">
                {client.pet_name}
              </p>
              {client.pet_breed && (
                <p className="text-[13px] text-[#48484A] mt-1 break-words">
                  {client.pet_breed}
                </p>
              )}
            </div>

            {/* Статистика */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-white border border-slate-100 p-2.5 rounded-xl shadow-sm">
                <Scissors size={16} className="text-[#007AFF]" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#8E8E93] font-bold uppercase">Визитов</span>
                  <span className="text-[14px] font-bold">{client.total_visits}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-100 p-2.5 rounded-xl shadow-sm">
                <Calendar size={16} className="text-[#007AFF]" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#8E8E93] font-bold uppercase">Последний</span>
                  <span className="text-[14px] font-bold">
                    {format(new Date(client.last_visit.substring(0,10)), 'd MMM', { locale: ru })}
                  </span>
                </div>
              </div>
            </div>

            {/* Кнопки связи */}
            <div className="flex gap-2 pt-1">
               <button
                  onClick={() => {
                    navigator.clipboard.writeText(client.phone);
                    toast.success("Номер скопирован");
                    window.location.href = `tel:${cleanPhone}`;
                  }}
                  className="flex-1 bg-[#F2F2F7] hover:bg-slate-200 text-black py-3 rounded-xl text-[14px] font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Copy size={16} className="text-[#8E8E93]" />
                  <span>{client.phone}</span>
                </button>

                <a
                  href={chatLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-14 flex items-center justify-center rounded-xl active:scale-95 transition-all shrink-0 hover:opacity-80 ${isTelegram ? 'bg-[#E3F2FF] text-[#007AFF]' : 'bg-[#E8F5E9] text-[#2E7D32]'}`}
                >
                  {isTelegram ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                  ) : (
                    <MessageSquare size={24} />
                  )}
                </a>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}