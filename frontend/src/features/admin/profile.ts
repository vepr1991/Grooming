import { $, getVal, setVal, show, hide, toggle } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { showToast } from '../../ui/toast';
import { renderCarousel, uploadPhoto } from '../../ui/carousel';
import { MasterProfile } from '../../types';

let currentPhotos: string[] = [];
let originalData: Partial<MasterProfile> = {};
let isPremium = false;

export async function loadProfile() {
    try {
        const data = await apiFetch<{ user: any, profile: MasterProfile }>('/me');
        const p = data.profile;

        // Если нет имени салона, показываем онбординг
        if (!p.salon_name) show('onboarding-screen');

        isPremium = p.is_premium || false;

        setVal('salon-name', p.salon_name || '');
        setVal('address', p.address || '');
        setVal('phone', p.phone || '');
        setVal('description', p.description || '');

        // Собираем фото. Если массив пуст, но есть аватарка (legacy), используем её.
        currentPhotos = p.photos || [];
        if (currentPhotos.length === 0 && p.avatar_url) {
            currentPhotos.push(p.avatar_url);
        }

        updateCarousel(false);
    } catch (e) {
        console.error("Profile load error:", e);
        showToast("Не удалось загрузить профиль", "error");
    }
}

function updateCarousel(editMode: boolean) {
    // Лимиты: 10 для Pro, 3 для Basic
    const limit = isPremium ? 10 : 3;
    const canAdd = currentPhotos.length < limit;

    const addHandler = canAdd
        ? () => $('photo-input')?.click()
        : undefined;

    renderCarousel(
        'carousel-track',
        'carousel-indicators',
        currentPhotos,
        editMode,
        addHandler,
        (idx) => {
            currentPhotos.splice(idx, 1);
            updateCarousel(true);
        }
    );
}

export function initProfileHandlers() {
    // 1. Загрузка фото
    const photoInput = $('photo-input') as HTMLInputElement;
    if (photoInput) {
        photoInput.onchange = async () => {
            if (!photoInput.files?.[0]) return;

            showToast('Загрузка...');
            try {
                const url = await uploadPhoto(photoInput.files[0]);
                currentPhotos.push(url);
                updateCarousel(true);
                showToast('Фото загружено');
            } catch (e: any) {
                showToast(e.message || 'Ошибка загрузки', 'error');
            }
            photoInput.value = ''; // Сброс, чтобы можно было загрузить то же фото
        };
    }

    // 2. Режим редактирования
    const toggleEdit = (enable: boolean) => {
        const inputs = ['salon-name', 'address', 'phone', 'description'];
        inputs.forEach(id => $(id)?.toggleAttribute('readonly', !enable));

        toggle('edit-actions', enable);
        toggle('btn-edit-mode', !enable);

        updateCarousel(enable);

        if (enable) {
            // Сохраняем состояние для отмены
            originalData = {
                salon_name: getVal('salon-name'),
                address: getVal('address'),
                phone: getVal('phone'),
                description: getVal('description'),
                photos: [...currentPhotos]
            };
        }
    };

    $('btn-edit-mode')!.onclick = () => toggleEdit(true);

    $('btn-cancel')!.onclick = () => {
        // Восстанавливаем данные
        if(originalData.salon_name !== undefined) setVal('salon-name', originalData.salon_name);
        if(originalData.address !== undefined) setVal('address', originalData.address);
        if(originalData.phone !== undefined) setVal('phone', originalData.phone);
        if(originalData.description !== undefined) setVal('description', originalData.description);

        currentPhotos = originalData.photos || [];
        toggleEdit(false);
    };

    // 3. Сохранение профиля
    $('btn-save-profile')!.onclick = async (e) => {
        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Сохранение...';

        try {
            await apiFetch('/me/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    salon_name: getVal('salon-name'),
                    address: getVal('address'),
                    phone: getVal('phone'),
                    description: getVal('description'),
                    photos: currentPhotos
                })
            });
            showToast('Профиль сохранен');
            toggleEdit(false);
        } catch {
            showToast('Ошибка сохранения', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    // 4. Onboarding (Первичная настройка)
    $('btn-finish-reg')!.onclick = async (e) => {
        const name = getVal('reg-name');
        const addr = getVal('reg-address');

        if(!name.trim()) return showToast('Введите название салона', 'error');

        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = 'Создаем...';

        try {
            await apiFetch('/me/profile', {
                method: 'PATCH',
                body: JSON.stringify({ salon_name: name, address: addr })
            });

            // Обновляем UI
            setVal('salon-name', name);
            setVal('address', addr);

            hide('onboarding-screen');
            showToast('Салон создан!');
            loadProfile(); // Перезагружаем, чтобы обновить состояние
        } catch {
            showToast('Ошибка при создании', 'error');
            btn.disabled = false;
            btn.textContent = 'Создать салон ->';
        }
    }
}
