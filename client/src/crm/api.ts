export type Organization = {
  id: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  currency: string;
  slot_step: number;
};
export type Member = {
  id: string;
  name: string;
  role: "owner" | "admin" | "groomer";
  active: boolean;
  bookable: boolean;
};
export type Service = {
  id: string;
  title: string;
  price_minor: number;
  duration_minutes: number;
  member_ids: string[];
  active?: boolean;
};
export type Subscription = {
  active: boolean;
  status: string;
  ends_at: string;
  price_minor: number;
  currency: string;
  payment_instructions: string;
};
export type Appointment = {
  id: string;
  member_id: string;
  client_id: string;
  pet_id: string;
  start_time: string;
  end_time: string;
  status: string;
  version: number;
  total_minor: number;
  paid_minor: number;
  client_name: string;
  client_phone: string;
  pet_name: string;
  breed: string;
  pet_notes: string;
  member_name: string;
  reason: string;
  notifications_enabled: boolean;
  services: string[];
};
export type Client = {
  id: string;
  name: string;
  phone: string;
  notes: string;
  visits: number;
  last_visit: string | null;
};
export type Pet = { id: string; name: string; breed: string; notes: string };
export type Storefront = {
  organization: Organization;
  members: Member[];
  services: Service[];
  booking_enabled: boolean;
};
type Telegram = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready: () => void;
  expand: () => void;
  openTelegramLink: (url: string) => void;
};
declare global {
  interface Window {
    Telegram?: { WebApp?: Telegram };
  }
}
export const tg = () => window.Telegram?.WebApp;
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(BASE + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": tg()?.initData || "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d: { msg: string }) => d.msg).join("; ")
          : "Не удалось выполнить запрос",
    );
  return data;
}
export const money = (minor: number, currency = "KZT") =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const localDate = (value: string, zone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export const localTime = (value: string, zone: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const dateTime = (value: string, zone: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function zonedISO(date: string, time: string, zone: string): string {
  const desired = Date.parse(`${date}T${time}:00Z`);
  let result = desired;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(result));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const shown = Date.parse(
      `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}Z`,
    );
    result += desired - shown;
  }
  const iso = new Date(result).toISOString();
  if (localDate(iso, zone) !== date || localTime(iso, zone) !== time)
    throw new Error("Это местное время не существует. Выберите другое.");
  return iso;
}
export const statusNames: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждена",
  completed: "Завершена",
  canceled: "Отменена",
  no_show: "Неявка",
  blocked: "Перерыв",
};
