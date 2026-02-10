import { $, setText, show, hide } from '../../core/dom';
import { apiFetch } from '../../core/api';
import { renderCarousel } from '../../ui/carousel';
import { getClientServiceSkeleton } from '../../ui/skeletons';
import { Service, MasterProfile } from '../../types';

// Хелпер для создания элементов
function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

export async function loadMasterInfo(masterId: string) {
    try {
        const data = await apiFetch<MasterProfile>(`/masters/${masterId}`);

        setText('hero-title', data.salon_name || 'Мастер');

        // [LOGIC] Отображение адреса (Авто-поиск в 2GIS по тексту)
        // Удаляем старый адрес если был
        const oldAddr = document.getElementById('dynamic-address');
        if (oldAddr) oldAddr.remove();

        if (data.address) {
            const heroTitle = $('hero-title');
            
            const addrLink = createEl('a', 'flex items-center justify-center gap-1.5 text-secondary text-sm font-medium mt-1 mb-3 hover:text-white transition-colors');
            addrLink.id = 'dynamic-address';
            
            // Просто ищем адрес в 2GIS
            addrLink.href = `https://2gis.kz/search/${encodeURIComponent(data.address)}`;
            addrLink.target = '_blank';
            
            const icon = createEl('span', 'material-symbols-rounded text-base text-primary', 'location_on');
            const text = createEl('span', 'underline decoration-dotted decoration-secondary/50', data.address);
            
            addrLink.appendChild(icon);
            addrLink.appendChild(text);
            
            // Вставляем ПОСЛЕ заголовка
            if (heroTitle && heroTitle.parentNode) {
                heroTitle.parentNode.insertBefore(addrLink, heroTitle.nextSibling);
            }
        }

        if (data.phone) {
            const phoneLink = $('hero-phone') as HTMLAnchorElement;
            if (phoneLink) {
                show(phoneLink);
                phoneLink.href = `tel:${data.phone}`;
                phoneLink.classList.add('flex');
                setText('hero-phone-text', data.phone);
            }
        }

        const descEl = $('hero-desc');
        if (descEl) {
            setText('hero-desc', data.description || 'Нет описания');
            // Логика "Читать далее"
            if (descEl.scrollHeight > descEl.clientHeight) {
                show('btn-expand-desc');
                const btn = $('btn-expand-desc');
                if (btn) {
                    btn.onclick = function() {
                        descEl.classList.remove('desc-clamp');
                        descEl.classList.add('desc-expanded');
                        hide(this as HTMLElement);
                    };
                }
            }
        }

        let photos = data.photos || [];
        if (photos.length === 0 && data.avatar_url) photos = [data.avatar_url];

        renderCarousel('client-carousel-track', 'client-carousel-indicators', photos);

        if (data.timezone) checkOpenStatus(data.timezone);

        return data;
    } catch (e) {
        setText('hero-title', 'Мастер не найден');
        setText('hero-status', 'Ошибка');
        console.error(e);
        return null;
    }
}

function checkOpenStatus(timezone: string) {
    try {
        const now = new Date().toLocaleTimeString('en-US', { timeZone: timezone, hour12: false });
        const [h, m] = now.split(':').map(Number);
        const currentMinutes = h * 60 + m;
        const start = 9 * 60;
        const end = 21 * 60;

        const statusEl = $('hero-status');
        const dotEl = $('status-text-dot');

        if (currentMinutes >= start && currentMinutes < end) {
            if(statusEl) {
                statusEl.textContent = "Открыто сейчас";
                statusEl.className = "text-[#31b545] text-xs font-bold uppercase tracking-wider";
            }
            if(dotEl) {
                dotEl.className = "text-[#31b545] text-[10px]";
            }
        } else {
            if(statusEl) {
                statusEl.textContent = "Закрыто";
                statusEl.className = "text-gray-400 text-xs font-bold uppercase tracking-wider";
            }
            if(dotEl) {
                dotEl.className = "text-gray-500 text-[10px]";
            }
        }
    } catch (e) { console.error(e); }
}

export async function loadServices(masterId: string, onSelect: (s: Service) => void) {
    const list = $('services-list');
    if (!list) return;

    list.innerHTML = getClientServiceSkeleton(4);

    try {
        const services = await apiFetch<Service[]>(`/masters/${masterId}/services`);
        list.innerHTML = '';

        if (services.length === 0) {
            const empty = createEl('div', 'text-center text-secondary py-4', 'Нет услуг');
            list.appendChild(empty);
            return;
        }

        services.forEach(srv => {
            const card = createEl('div', 'w-full bg-surface border border-border rounded-xl overflow-hidden shadow-sm transition-all mb-3');

            const header = createEl('div', 'p-4 flex justify-between items-center cursor-pointer active:bg-bg/50 transition-colors min-h-[72px]');

            const leftCol = createEl('div', 'flex flex-col gap-1 flex-1 min-w-0 pr-4');
            const nameEl = createEl('span', 'text-white font-bold text-base leading-tight', srv.name);
            const timeEl = createEl('span', 'text-secondary text-xs', `${srv.duration_min} мин`);
            leftCol.appendChild(nameEl);
            leftCol.appendChild(timeEl);

            const rightCol = createEl('div', 'flex items-center gap-3');
            const priceEl = createEl('span', 'text-primary font-bold text-base whitespace-nowrap', `${srv.price} ₸`);
            const chevron = createEl('span', 'material-symbols-rounded text-secondary/50 text-xl transition-transform duration-300 chevron', 'expand_more');
            rightCol.appendChild(priceEl);
            rightCol.appendChild(chevron);

            header.appendChild(leftCol);
            header.appendChild(rightCol);

            const body = createEl('div', 'hidden px-4 pb-4 pt-0 border-t border-border/30 bg-bg/20');

            const descP = createEl('p', 'text-sm text-secondary py-3 leading-relaxed');
            descP.textContent = srv.description || '';
            if (!srv.description) descP.className = 'h-2';

            const btn = createEl('button', 'w-full bg-primary text-white font-bold py-3 rounded-xl active:scale-[0.98] transition-all shadow-lg shadow-primary/20 mt-2', 'Записаться');
            btn.onclick = (e) => {
                e.stopPropagation();
                onSelect(srv);
            };

            body.appendChild(descP);
            body.appendChild(btn);

            header.onclick = () => {
                const isHidden = body.classList.toggle('hidden');
                chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            };

            card.appendChild(header);
            card.appendChild(body);
            list.appendChild(card);
        });
    } catch (e) {
        list.innerHTML = '';
        list.appendChild(createEl('div', 'text-center text-error', 'Ошибка загрузки'));
    }
}
