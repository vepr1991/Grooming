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

        // [FIX] Логика одобрения
        if (p.salon_name && !p.is_approved) {
            show('approval-screen');
            hide('onboarding-screen');
            // Блокируем показ основного интерфейса, пока нет одобрения
            return;
        } else {
            hide('approval-screen');
        }

        // Если нет имени салона - регистрация
        if (!p.salon_name) {
            show('onboarding-screen');
            return; // Тоже выходим, чтобы не грузить данные в поля
        }

        // Если все ок - скрываем экраны блокировки
        hide('onboarding-screen');
        hide('approval-screen');

        isPremium = p.is_premium || false;

        setVal('salon-name', p.salon_name || '');
        setVal('address', p.address || '');
        setVal('phone', p.phone || '');
        setVal('description', p.description || '');

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
    // ... (код загрузки фото и togglEdit остается без изменений) ...
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
            photoInput.value = '';
        };
    }

    const toggleEdit = (enable: boolean) => {
        const inputs = ['salon-name', 'address', 'phone', 'description'];
        inputs.forEach(id => $(id)?.toggleAttribute('readonly', !enable));
        toggle('edit-actions', enable);
        toggle('btn-edit-mode', !enable);
        updateCarousel(enable);
        if (enable) {
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
        if(originalData.salon_name !== undefined) setVal('salon-name', originalData.salon_name);
        if(originalData.address !== undefined) setVal('address', originalData.address);
        if(originalData.phone !== undefined) setVal('phone', originalData.phone);
        if(originalData.description !== undefined) setVal('description', originalData.description);
        currentPhotos = originalData.photos || [];
        toggleEdit(false);
    };

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

    // [UPDATED] Регистрация с телефоном
    $('btn-finish-reg')!.onclick = async (e) => {
        const name = getVal('reg-name');
        const addr = getVal('reg-address');
        const phone = getVal('reg-phone'); // [NEW] Берем телефон

        if(!name.trim()) return showToast('Введите название салона', 'error');
        // Можно добавить проверку телефона, если нужно

        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = 'Создаем...';

        try {
            // [NEW] Отправляем телефон тоже
            await apiFetch('/me/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    salon_name: name,
                    address: addr,
                    phone: phone
                })
            });

            // Обновляем поля в профиле (визуально)
            setVal('salon-name', name);
            setVal('address', addr);
            setVal('phone', phone);

            hide('onboarding-screen');
            showToast('Заявка отправлена!');

            // Перезагружаем профиль, чтобы сработала проверка is_approved
            loadProfile();
        } catch {
            showToast('Ошибка при создании', 'error');
            btn.disabled = false;
            btn.textContent = 'Создать салон ->';
        }
    }

    // [NEW] Кнопка проверки статуса без перезагрузки
    const checkBtn = $('btn-check-status');
    if (checkBtn) {
        checkBtn.onclick = async () => {
            const btn = checkBtn as HTMLButtonElement;
            const originalText = btn.textContent;
            btn.textContent = 'Проверяю...';
            btn.disabled = true;

            await loadProfile(); // Просто вызываем загрузку данных

            // Если мы все еще здесь (значит is_approved = false), возвращаем кнопку
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 500);
        };
    }
}