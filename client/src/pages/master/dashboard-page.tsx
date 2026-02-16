function AppointmentCard({ app, onStatusUpdate }: { app: Appointment, onStatusUpdate: (id: string, s: Appointment['status']) => void }) {
  const [expanded, setExpanded] = useState(false);

  let tgUsername = null;
  try {
    if (app.client_tg_user) {
      const userObj = typeof app.client_tg_user === 'string'
        ? JSON.parse(app.client_tg_user)
        : app.client_tg_user;
      tgUsername = userObj?.username;
    }
  } catch (e) {
    console.error("Failed to parse tg user", e);
  }

  // Очистка номера
  const cleanPhone = app.client_phone.replace(/[^0-9+]/g, '');

  const chatLink = tgUsername
    ? `https://t.me/${tgUsername}`
    : `https://wa.me/${cleanPhone}`;

  const isTelegram = !!tgUsername;

  const statusConfig: any = {
    pending: { bg: '#FFF4D6', text: '#855E00', label: 'ОЖИДАЕТ' },
    confirmed: { bg: '#E3F2FF', text: '#007AFF', label: 'ПРИНЯТА' },
    completed: { bg: '#E8F5E9', text: '#2E7D32', label: 'ГОТОВО' },
    canceled: { bg: '#FFEBEE', text: '#C62828', label: 'ОТМЕНА' },
  };
  const config = statusConfig[app.status] || statusConfig.pending;
  const sTime = new Date(app.start_time);
  const sInfo = Array.isArray(app.services) ? app.services[0] : app.services;

  return (
    <div className={`bg-white rounded-[16px] shadow-sm border border-slate-100 transition-all duration-300 overflow-hidden ${expanded ? 'shadow-md' : ''}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer active:bg-zinc-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex flex-col items-center justify-center shrink-0 w-[52px]">
            <span className="text-[17px] font-bold text-black">{format(sTime, 'HH:mm')}</span>
            <span className={`text-[10px] font-bold uppercase ${isToday(sTime) ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}>{isToday(sTime) ? 'Сегодня' : format(sTime, 'd MMM', { locale: ru })}</span>
          </div>
          <div className="w-[1px] h-10 bg-[#E5E5EA] shrink-0"></div>
          <div className="min-w-0 flex-1"><h3 className="text-[17px] font-bold text-black truncate">{app.pet_name}</h3><p className="text-[13px] text-[#8E8E93] truncate">{sInfo?.title || 'Услуга...'}</p></div>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0"><span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-tight text-center min-w-[70px]" style={{ backgroundColor: config.bg, color: config.text }}>{config.label}</span><ChevronDown size={18} className={`text-[#C7C7CC] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} /></div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 bg-white animate-in slide-in-from-top-2">
          <div className="flex gap-4 py-3 border-t border-[#F2F2F7]">
            <div className="w-20 h-20 rounded-2xl bg-[#F2F2F7] flex items-center justify-center shrink-0"><Scissors size={28} className="text-[#8E8E93] opacity-20" /></div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[15px] font-bold text-black truncate">{app.pet_breed || "Порода не указана"}</p>
              <div className="bg-[#F2F2F7] rounded-xl p-2.5"><p className="text-[13px] font-semibold text-black truncate">{sInfo?.title}</p><p className="text-[11px] text-[#8E8E93]">{sInfo?.duration_minutes || '30'} мин • {sInfo?.price || '0'} ₸</p></div>
              <p className="text-[13px] text-[#8E8E93] pt-1 font-medium">Владелец: {app.client_name}</p>

              <div className="flex items-center gap-2 mt-3 w-full">
                {/* 👇 1. КНОПКА ТЕЛЕФОНА (ЗАНИМАЕТ ВСЁ ОСТАЛЬНОЕ МЕСТО) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(app.client_phone);
                    toast.success("Номер скопирован");
                    window.location.href = `tel:${cleanPhone}`;
                  }}
                  className="flex-1 min-w-0 flex items-center justify-center gap-2 bg-[#F2F2F7] text-black py-3 px-3 rounded-2xl text-[14px] font-bold active:scale-95 transition-all"
                >
                  <Copy size={16} className="shrink-0 text-[#8E8E93]" />
                  <span className="truncate">{app.client_phone}</span>
                </button>

                {/* 👇 2. КНОПКА МЕССЕНДЖЕРА (ФИКСИРОВАННАЯ ШИРИНА) */}
                <a
                  href={chatLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`w-14 h-[44px] flex items-center justify-center rounded-2xl active:scale-95 transition-all shrink-0 ${isTelegram ? 'bg-[#E3F2FF] text-[#007AFF]' : 'bg-[#E8F5E9] text-[#2E7D32]'}`}
                >
                  {isTelegram ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg> : <MessageSquare size={20} />}
                </a>
              </div>

            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-[#F2F2F7]">
            {app.status === 'pending' ? (<><button onClick={() => onStatusUpdate(app.id, 'confirmed')} className="h-11 bg-[#007AFF] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all">Принять</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all">Отмена</button></>) : app.status === 'confirmed' ? (<><button onClick={() => onStatusUpdate(app.id, 'completed')} className="h-11 bg-[#2E7D32] text-white rounded-xl text-[15px] font-bold active:scale-95 transition-all">Завершить</button><button onClick={() => onStatusUpdate(app.id, 'canceled')} className="h-11 bg-[#F2F2F7] text-rose-500 rounded-xl text-[15px] font-bold active:scale-95 transition-all">Отмена</button></>) : null}
          </div>
        </div>
      )}
    </div>
  );
}