import { $, getVal, setVal, show, hide, toggle } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { showToast } from '../../ui/toast';
import { renderCarousel, uploadPhoto } from '../../ui/carousel';
import { MasterProfile } from '../../types';

// Объявляем IMask (так как он подключен через CDN в admin.html)
declare const IMask: any;

let currentPhotos: string[] = [];
let originalData: Partial<MasterProfile> = {};
let isPremium = false;
// Храним инстансы масок, чтобы обновлять/удалять их
let phoneMaskProfile: any = null;
let phoneMaskReg: any = null;

export async function loadProfile() {
    try {
        const data = await apiFetch<{ user: any, profile: MasterProfile }>('/me');
        const p = data.profile;

        // 1. ПРОВЕРКА ОДОБРЕНИЯ (Приоритет №1)
        // Если регистрация пройдена (есть имя), но нет одобрения
        if (p.salon_name && !p.is_approved) {
            show('approval-screen');
            hide('onboarding-screen');
            // ВАЖНО: Останавливаем загрузку, чтобы не показывать интерфейс
            return;
        } else {
            hide('approval-screen');
        }

        // 2. ПРОВЕРКА РЕГИСТРАЦИИ (Приоритет №2)
        // Если нет имени салона - показываем онбординг
        if (!p.salon_name) {
            show('onboarding-screen');
            // Инициализируем маску для поля регистрации, если еще нет
            initRegMask();
            // ВАЖНО: Останавливаем загрузку, данные профиля не нужны
            return;
        }

        // Если мы здесь - значит мастер зарегистрирован и одобрен
        hide('onboarding-screen');
        hide('approval-screen');

        isPremium = p.is_premium || false;

        setVal('salon-name', p.salon_name || '');
        setVal('address', p.address || '');
        setVal('description', p.description || '');

        // Устанавливаем телефон и обновляем маску
        const phoneInput = $('phone') as HTMLInputElement;
        if (phoneInput) {
            phoneInput.value = p.phone || '';
            if (phoneMaskProfile) phoneMaskProfile.updateValue();
            else initProfileMask();
        }

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

function initRegMask() {
    const el = $('reg-phone') as HTMLInputElement;
    if (el && !phoneMaskReg) {
        phoneMaskReg = IMask(el, {
            mask: '+{7} (000) 000-00-00'
        });
    }
}

function initProfileMask() {
    const el = $('phone') as HTMLInputElement;
    if (el && !phoneMaskProfile) {
        phoneMaskProfile = IMask(el, {
            mask: '+{7} (000) 000-00-00'
        });
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
    // Инициализируем маску профиля сразу (на всякий случай)
    initProfileMask();
    // И маску регистрации
    initRegMask();

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
            // При входе в режим редактирования запоминаем данные
            // Для телефона берем "чистое" значение маски (unmaskedValue) или текущее value
            originalData = {
                salon_name: getVal('salon-name'),
                address: getVal('address'),
                phone: phoneMaskProfile ? phoneMaskProfile.value : getVal('phone'),
                description: getVal('description'),
                photos: [...currentPhotos]
            };
        }
    };

    $('btn-edit-mode')!.onclick = () => toggleEdit(true);

    $('btn-cancel')!.onclick = () => {
        if(originalData.salon_name !== undefined) setVal('salon-name', originalData.salon_name);
        if(originalData.address !== undefined) setVal('address', originalData.address);
        if(originalData.description !== undefined) setVal('description', originalData.description);

        // Восстанавливаем телефон через маску
        if(originalData.phone !== undefined && phoneMaskProfile) {
            phoneMaskProfile.value = originalData.phone;
        }

        currentPhotos = originalData.photos || [];
        toggleEdit(false);
    };

    $('btn-save-profile')!.onclick = async (e) => {
        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Сохранение...';

        try {
            // Берем телефон из маски (или обычного поля, если маска не сработала)
            const phoneVal = phoneMaskProfile ? phoneMaskProfile.value : getVal('phone');

            await apiFetch('/me/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    salon_name: getVal('salon-name'),
                    address: getVal('address'),
                    phone: phoneVal,
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

    // --- ЛОГИКА РЕГИСТРАЦИИ ---
    $('btn-finish-reg')!.onclick = async (e) => {
        const name = getVal('reg-name');
        const addr = getVal('reg-address');
        // Берем телефон из маски регистрации
        const phone = phoneMaskReg ? phoneMaskReg.value : getVal('reg-phone');

        if(!name.trim()) return showToast('Введите название салона', 'error');
        // Валидация телефона (простая)
        if(phone.length < 10) return showToast('Введите корректный номер', 'error');

        const btn = e.target as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = 'Создаем...';

        try {
            await apiFetch('/me/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    salon_name: name,
                    address: addr,
                    phone: phone
                })
            });

            // Обновляем UI (вдруг одобрение автоматическое)
            setVal('salon-name', name);
            setVal('address', addr);
            if (phoneMaskProfile) phoneMaskProfile.value = phone;

            hide('onboarding-screen');
            showToast('Заявка отправлена!');

            // Перезагрузка запустит loadProfile, который увидит is_approved=false
            // и покажет экран "Заявка на проверке"
            loadProfile();
        } catch {
            showToast('Ошибка при создании', 'error');
            btn.disabled = false;
            btn.textContent = 'Создать салон ->';
        }
    }

    // --- КНОПКА ПРОВЕРКИ СТАТУСА ---
    const checkBtn = $('btn-check-status');
    if (checkBtn) {
        checkBtn.onclick = async () => {
            const btn = checkBtn as HTMLButtonElement;
            const originalText = btn.textContent;
            btn.textContent = 'Проверяю...';
            btn.disabled = true;

            await loadProfile();

            // Если мы всё еще здесь, значит статус не поменялся (return сработал в loadProfile).
            // Возвращаем кнопку обратно.
            // Если статус стал true, loadProfile сам скроет экран одобрения.
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 500);
        };
    }
}