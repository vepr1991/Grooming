import { useEffect } from 'react';
import { useBookingStore } from './store/useBookingStore';
import { ServiceSelector } from './components/ServiceSelector';
import { PhotoUploader } from './components/PhotoUploader';

function App() {
  const { step, setStep, masterId, setMasterId } = useBookingStore();

  useEffect(() => {
    // Пытаемся достать ID мастера из ссылки Telegram
    const params = new URLSearchParams(window.location.search);
    const mId = params.get('startapp') || '579214945'; // Твой ID для теста
    setMasterId(mId);
  }, []);

  return (
    <div className="min-h-screen bg-background text-white font-sans selection:bg-primary/30">
      <div className="max-w-md mx-auto p-4 pb-24">

        {/* Шаг 1: Выбор услуги */}
        {step === 'service' && <ServiceSelector />}

        {/* Шаг 2: Выбор даты (сделаем в следующем шаге) */}
        {step === 'datetime' && (
          <div className="text-center py-10">
            <h2 className="text-xl font-bold mb-4">Услуга выбрана!</h2>
            <p className="mb-6 opacity-60">Тут будет календарь. Нажми кнопку ниже для теста формы.</p>
            <button
              onClick={() => setStep('form')}
              className="bg-primary px-6 py-3 rounded-xl font-bold"
            >
              Перейти к форме
            </button>
          </div>
        )}

        {/* Шаг 3: Форма данных + Твой PhotoUploader */}
        {step === 'form' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <h2 className="text-xl font-bold">Осталось совсем чуть-чуть</h2>
            <div className="bg-surface-dark p-4 rounded-3xl border border-border-dark space-y-4">
              <input type="text" placeholder="Ваше имя" className="w-full bg-background p-4 rounded-xl outline-none border border-border-dark focus:border-primary" />
              <input type="tel" placeholder="Номер телефона" className="w-full bg-background p-4 rounded-xl outline-none border border-border-dark focus:border-primary" />
              <input type="text" placeholder="Имя питомца" className="w-full bg-background p-4 rounded-xl outline-none border border-border-dark focus:border-primary" />

              <div className="pt-2">
                <p className="text-sm font-semibold mb-3 ml-1 text-text-secondary">Добавьте фото</p>
                <PhotoUploader />
              </div>
            </div>

            <button className="w-full bg-primary py-4 rounded-2xl font-bold text-lg shadow-lg shadow-primary/20">
              Записаться
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;