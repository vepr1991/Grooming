import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { api, dateTime, localDate, localTime, money, tg } from "./api";
import type { Storefront } from "./api";
import { Field, Form, Load } from "./ui";
import { useLoad } from "./hooks";
import { str } from "./form-data";

export function Booking({
  orgId,
  internal = false,
  onDone,
}: {
  orgId: string;
  internal?: boolean;
  onDone?: () => void;
}) {
  const store = useLoad(() => api<Storefront>(`/public/${orgId}`), [orgId]);
  if (!store.data) return <Load {...store} />;
  return (
    <BookingForm
      key={orgId}
      store={store.data}
      internal={internal}
      onDone={onDone}
    />
  );
}
function BookingForm({
  store,
  internal,
  onDone,
}: {
  store: Storefront;
  internal: boolean;
  onDone?: () => void;
}) {
  const { organization: org, services, members } = store;
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]),
    [member, setMember] = useState(""),
    [day, setDay] = useState(localDate(new Date().toISOString(), org.timezone)),
    [slot, setSlot] = useState("");
  const [result, setResult] = useState<{
    id: string;
    notification_link: string | null;
  } | null>(null);
  const [key, setKey] = useState(crypto.randomUUID());
  const availableMembers = members.filter(
    (m) =>
      selected.length > 0 &&
      selected.every((id) =>
        services.find((s) => s.id === id)?.member_ids.includes(m.id),
      ),
  );
  const validMember = availableMembers.some((m) => m.id === member)
    ? member
    : "";
  const slots = useLoad(
    () =>
      validMember && selected.length
        ? api<{ start_time: string; end_time: string }[]>(
            `/public/${org.id}/slots?member_id=${validMember}&day=${day}&${selected.map((s) => "service_ids=" + s).join("&")}`,
          )
        : Promise.resolve([]),
    [org.id, validMember, day, selected.join(",")],
  );
  const total = services
    .filter((s) => selected.includes(s.id))
    .reduce((n, s) => n + s.price_minor, 0);
  if (result)
    return (
      <section className="card success-screen">
        <div className="big-icon">✓</div>
        <h2>{internal ? "Запись создана" : "Заявка отправлена"}</h2>
        <p>
          {internal
            ? "Визит добавлен в календарь."
            : "Салон подтвердит вашу запись."}
        </p>
        {!internal && result.notification_link && (
          <>
            <p>Подключите бота, чтобы получать подтверждение и напоминания.</p>
            <a
              className="primary link-button"
              href={result.notification_link}
              onClick={(e) => {
                if (tg()?.openTelegramLink) {
                  e.preventDefault();
                  tg()?.openTelegramLink(result.notification_link!);
                }
              }}
            >
              Подключить уведомления
            </a>
          </>
        )}
        <button
          onClick={() => {
            setResult(null);
            setKey(crypto.randomUUID());
            setSlot("");
            slots.reload();
            onDone?.();
          }}
        >
          Готово
        </button>
      </section>
    );
  if (!store.booking_enabled)
    return (
      <section className="card">
        <h2>Запись временно недоступна</h2>
        <p>Свяжитесь с салоном: {org.phone || org.name}</p>
      </section>
    );
  return (
    <div className="booking">
      {!internal && step > 0 && (
        <header className="booking-heading">
          <button aria-label="Назад" onClick={() => setStep(step - 1)}>
            <ChevronLeft size={28} />
          </button>
          <strong>{step === 1 ? "Время" : "Детали"}</strong>
          <span />
        </header>
      )}
      <section className="card" hidden={!internal && step !== 0}>
        <p className="eyebrow">{internal ? "Новая запись" : "Онлайн-запись"}</p>
        <h1>{org.name}</h1>
        <p className="muted">
          {org.address} {org.phone && `· ${org.phone}`}
        </p>
        <p className="muted">Время салона: {org.timezone}</p>
      </section>
      <section className="card" hidden={!internal && step !== 0}>
        <h2>Услуги</h2>
        {services.length === 0 && <p>Салон ещё не добавил услуги.</p>}
        <div className="service-list">
          {services.map((s) => (
            <label
              key={s.id}
              className={
                "service-option " + (selected.includes(s.id) ? "selected" : "")
              }
            >
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) => {
                  setSelected(
                    e.target.checked
                      ? [...selected, s.id]
                      : selected.filter((id) => id !== s.id),
                  );
                  setSlot("");
                }}
              />
              <span>
                <strong>{s.title}</strong>
                <small>{s.duration_minutes} мин</small>
              </span>
              <b>{money(s.price_minor, org.currency)}</b>
            </label>
          ))}
        </div>
      </section>
      <section className="card" hidden={!internal && step !== 1}>
        <h2>Мастер и время</h2>
        <div className="grid two">
          <Field label="Грумер">
            <select
              value={validMember}
              onChange={(e) => {
                setMember(e.target.value);
                setSlot("");
                setKey(crypto.randomUUID());
              }}
            >
              <option value="">Выберите мастера</option>
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата">
            <input
              type="date"
              value={day}
              min={localDate(new Date().toISOString(), org.timezone)}
              onChange={(e) => {
                setDay(e.target.value);
                setSlot("");
              }}
            />
          </Field>
        </div>
        {selected.length > 0 && availableMembers.length === 0 && (
          <p className="error">
            Нет мастера, выполняющего все выбранные услуги.
          </p>
        )}
        <Load {...slots} />
        <div className="slots">
          {slots.data?.map((s) => (
            <button
              type="button"
              key={s.start_time}
              className={slot === s.start_time ? "chosen" : ""}
              onClick={() => {
                setSlot(s.start_time);
                setKey(crypto.randomUUID());
              }}
            >
              {localTime(s.start_time, org.timezone)}
            </button>
          ))}
        </div>
        {validMember && slots.data?.length === 0 && (
          <p className="muted">Нет свободного времени. Выберите другую дату.</p>
        )}
      </section>
      <section className="card" hidden={!internal && step !== 2}>
        <h2>Клиент и питомец</h2>
        <Form
          label={internal ? "Создать запись" : "Отправить заявку"}
          disabled={!slot || !slots.data?.some((s) => s.start_time === slot)}
          submit={async (d) => {
            const payload = {
              member_id: validMember,
              service_ids: selected,
              start_time: slot,
              client: { name: str(d, "name"), phone: str(d, "phone") },
              pet: { name: str(d, "pet"), breed: str(d, "breed") },
              request_key: key,
            };
            const response = await api<{
              id: string;
              notification_link: string | null;
            }>(
              internal
                ? `/organizations/${org.id}/appointments`
                : `/public/${org.id}/bookings`,
              "POST",
              payload,
            );
            setResult(response);
          }}
        >
          <div className="grid two">
            <Field label="Имя клиента">
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                onChange={() => setKey(crypto.randomUUID())}
              />
            </Field>
            <Field label="Телефон с кодом страны">
              <input
                name="phone"
                type="tel"
                required
                placeholder="+7 777 123 45 67"
                autoComplete="tel"
                onChange={() => setKey(crypto.randomUUID())}
              />
            </Field>
            <Field label="Кличка питомца">
              <input
                name="pet"
                required
                maxLength={100}
                onChange={() => setKey(crypto.randomUUID())}
              />
            </Field>
            <Field label="Порода">
              <input
                name="breed"
                maxLength={100}
                onChange={() => setKey(crypto.randomUUID())}
              />
            </Field>
          </div>
          <div className="booking-total">
            <span>
              {slot ? dateTime(slot, org.timezone) : "Выберите время"}
            </span>
            <strong>{money(total, org.currency)}</strong>
          </div>
          {!internal && (
            <label className="check">
              <input type="checkbox" required />
              Согласен передать указанные данные салону для оформления записи и
              связи со мной.
            </label>
          )}
        </Form>
      </section>
      {!internal && step < 2 && (
        <button
          className="primary booking-next"
          disabled={
            step === 0
              ? !selected.length
              : !slot || !slots.data?.some((s) => s.start_time === slot)
          }
          onClick={() => setStep(step + 1)}
        >
          {step === 0
            ? `Выбрать время · ${money(total, org.currency)}`
            : "Продолжить"}
        </button>
      )}
    </div>
  );
}
