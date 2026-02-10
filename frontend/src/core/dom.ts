export function $(selector: string, parent: Document | HTMLElement = document): HTMLElement | null {
    // Если селектор не начинается с . или #, считаем его ID (для совместимости со старым кодом getElementById)
    if (!selector.startsWith('.') && !selector.startsWith('#') && !selector.includes('[')) {
        return document.getElementById(selector);
    }
    return parent.querySelector(selector);
}

export function $$(selector: string, parent: Document | HTMLElement = document): NodeListOf<HTMLElement> {
    return parent.querySelectorAll(selector);
}

export function show(idOrEl: string | HTMLElement | null) {
    const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (el) el.classList.remove('hidden');
}

export function hide(idOrEl: string | HTMLElement | null) {
    const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (el) el.classList.add('hidden');
}

export function toggle(idOrEl: string | HTMLElement | null, condition?: boolean) {
    const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (!el) return;

    if (condition === undefined) {
        el.classList.toggle('hidden');
    } else {
        condition ? show(el) : hide(el);
    }
}

export function setText(id: string, text: string) {
    const el = $(id);
    if (el) el.textContent = text;
}

export function getVal(id: string): string {
    const el = $(id) as HTMLInputElement | HTMLTextAreaElement;
    return el ? el.value : '';
}

export function setVal(id: string, val: string) {
    const el = $(id) as HTMLInputElement | HTMLTextAreaElement;
    if (el) el.value = val;
}