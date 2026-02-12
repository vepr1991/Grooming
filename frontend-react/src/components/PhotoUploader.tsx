import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useBookingStore } from '../store/useBookingStore';
import { Camera, X, Loader2 } from 'lucide-react';

export const PhotoUploader: React.FC = () => {
  const { uploadedPhotos, addPhoto, removePhoto } = useBookingStore();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        // Формируем уникальное имя файла: папка-мастера/uuid-название
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `public/${fileName}`;

        // Загрузка напрямую в Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('pet-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Получаем публичную ссылку
        const { data: { publicUrl } } = supabase.storage
          .from('pet-photos')
          .getPublicUrl(filePath);

        addPhoto(publicUrl);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Ошибка при загрузке фото');
    } finally {
      setUploading(false);
      e.target.value = ''; // Сброс инпута
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {uploadedPhotos.map((url) => (
          <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-surface">
            <img src={url} alt="Pet" className="w-full h-full object-cover" />
            <button
              onClick={() => removePhoto(url)}
              className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {uploadedPhotos.length < 5 && (
          <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-border-dark bg-surface-dark/40 cursor-pointer hover:border-primary transition-colors">
            {uploading ? (
              <Loader2 className="animate-spin text-primary" />
            ) : (
              <>
                <Camera className="text-text-secondary" />
                <span className="text-[10px] mt-1 text-text-secondary">Добавить</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
      </div>
      <p className="text-[10px] text-text-secondary text-center italic">
        До 5 фотографий. Это поможет мастеру лучше подготовиться.
      </p>
    </div>
  );
};