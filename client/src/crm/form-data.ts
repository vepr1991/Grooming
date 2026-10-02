export const str = (d: FormData, k: string) => String(d.get(k) || "");
export const num = (d: FormData, k: string) => Number(d.get(k));
export const minor = (d: FormData, k: string) => Math.round(num(d, k) * 100);
