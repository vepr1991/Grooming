import { create } from 'zustand';

interface Service {
  id: number;
  name: string;
  price: number;
  duration: number;
}

interface BookingState {
  // Состояние экрана
  step: 'service' | 'datetime' | 'form' | 'success';

  // Данные записи
  masterId: string | null;
  selectedService: Service | null;
  selectedDate: string | null;
  selectedSlot: string | null;
  uploadedPhotos: string[]; // Ссылки на фото

  // Методы
  setMasterId: (id: string) => void;
  setService: (service: Service) => void;
  setDateTime: (date: string, slot: string) => void;
  addPhoto: (url: string) => void;
  removePhoto: (url: string) => void;
  setStep: (step: BookingState['step']) => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  step: 'service',
  masterId: null,
  selectedService: null,
  selectedDate: null,
  selectedSlot: null,
  uploadedPhotos: [],

  setMasterId: (masterId) => set({ masterId }),
  setService: (service) => set({ selectedService: service, step: 'datetime' }),
  setDateTime: (date, slot) => set({ selectedDate: date, selectedSlot: slot, step: 'form' }),
  addPhoto: (url) => set((state) => ({ uploadedPhotos: [...state.uploadedPhotos, url] })),
  removePhoto: (url) => set((state) => ({
    uploadedPhotos: state.uploadedPhotos.filter(p => p !== url)
  })),
  setStep: (step) => set({ step }),
  reset: () => set({
    step: 'service',
    selectedService: null,
    selectedDate: null,
    selectedSlot: null,
    uploadedPhotos: []
  }),
}));