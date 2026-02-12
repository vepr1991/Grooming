import { useEffect, useState } from 'react';
import { useBookingStore } from './store/useBookingStore';
import { ServiceSelector } from './components/ServiceSelector';
import { PhotoUploader } from './components/PhotoUploader';
import { DateTimeSelector } from './components/DateTimeSelector';
import { api } from './lib/api'; // Импортируем наш настроенный axios

function App() {
  const { step, setStep, masterId, setMasterId, selectedService, selectedSlot, uploadedPhotos, reset } = useBookingStore();

  // Локальное состояние для полей формы
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '',
    pet_name: '',
    pet_breed: '',
    comment: ''
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mId = params.get('startapp') || '579214945';
    setMasterId(mId);
  }, []);

  // Функция отправки записи на бэкенд
  const handleBooking = async () => {
    if (!formData.client_name || !formData.client_phone || !formData.pet_name) {
      alert('Пожалуйста, заполните обязательные поля');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        master_telegram_id: Number(masterId),
        service_id: selectedService?.id,
        starts_at: selectedSlot, // Это уже ISO строка из DateTimeSelector
        ...formData,
        pet_photos: uploadedPhotos // Наши ссылки из Supabase
      };

      await api.post('/client/appointments', payload);
      setStep('success');
    } catch (error) {
      console.error("Booking error:", error);
      alert('Ошибка при создании записи. Попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-white font-sans selection:bg-primary/30">
      <div className="max-w-md mx-auto p-4 pb-24">

        {/* Шаг 1: Выбор услуги */}
        {step === 'service' && <ServiceSelector />}

        {/* Шаг 2: Календарь (DateTimeSelector сам переключит на 'form' при выборе времени) */}
        {step === 'datetime' && <DateTimeSelector />}

        {/* Шаг 3: Форма данных */}
        {step === 'form' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <h2 className="text-xl font-bold">Осталось совсем чуть-чуть</h2>
            <div className="bg-surface-dark p-4 rounded-3xl border border-border-dark space-y-4">
              <input
                type="text"
                placeholder="Ваше имя *"
                className="w-full bg-background p-4 rounded-xl outline-none border border-border-dark focus:border-primary"
                onChange={(e) => setFormData({...formData, client_name: e.target.value})}
              />
              <input
                type="tel"
                placeholder="Номер телефона *"
                className="w-full bg-background p-4 rounded-xl outline-none border border-border-dark focus:border-primary"
                onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
              />
              <input
                type="text"
                placeholder="Имя питомца *"
                className="w-full bg-background p-4 rounded-xl outline-none border border-border-dark focus:border-primary"
                onChange={(e) => setFormData({...formData, pet_name: e.target.value})}
              />

              <div className="pt-2">
                <p className="text-sm font-semibold mb-3 ml-1 text-text-secondary">Добавьте фото (необязательно)</p>
                <PhotoUploader />
              </div>
            </div>

            <button
              onClick={handleBooking}
              disabled={loading}
              className={`w-full bg-primary py-4 rounded-2xl font-bold text-lg shadow-lg shadow-primary/20 ${loading ? 'opacity-50' : 'active:scale-95 transition-all'}`}
            >
              {loading ? 'Отправка...' : 'Записаться'}
            </button>
          </div>
        )}

        {/* Шаг 4: Успех */}
        {step === 'success' && (
          <div className="text-center py-20 space-y-6 animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto">
              <svg size={40} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} className="w-10 h-10">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Вы записаны!</h2>
            <p className="opacity-60 text-sm px-10">Мастер получил уведомление и свяжется с вами при необходимости.</p>
            <button onClick={reset} className="text-primary font-bold">Вернуться в начало</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;