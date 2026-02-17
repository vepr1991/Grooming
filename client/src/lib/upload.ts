import { supabase } from "@/lib/supabase";

export async function uploadImage(file: File, bucket: string = 'images'): Promise<string> {
  // Генерируем уникальное имя файла: timestamp_random.расширение
  // Это позволяет не устанавливать лишние библиотеки типа uuid
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;

  // Загружаем
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, file);

  if (uploadError) {
    console.error("Upload error:", uploadError);
    throw new Error("Не удалось загрузить изображение");
  }

  // Получаем публичную ссылку
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return data.publicUrl;
}