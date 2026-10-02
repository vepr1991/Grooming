import { useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";
import { Calendar } from "./Calendar";
import {
  api,
  dateTime,
  localDate,
  localTime,
  money,
  statusNames,
  zonedISO,
} from "./api";
import type { Appointment, Member, Organization, Subscription } from "./api";
import { Action, Empty, Field, Form, Load, Sheet } from "./ui";
import { useLoad } from "./hooks";
import { minor, num, str } from "./form-data";
import { Booking } from "./Booking";
export type Context = {
  org: Organization;
  member: Member;
  subscription: Subscription;
  refresh: () => void;
};

export function Dashboard({
  org,
  member,
  subscription,
  onReports,
}: Context & { onReports?: () => void }) {
  const [view, setView] = useState("list"),
    [filter, setFilter] = useState("pending");
  const [day, setDay] = useState(
      localDate(new Date().toISOString(), org.timezone),
    ),
    [adding, setAdding] = useState(false),
    [blocking, setBlocking] = useState(false);
  const appointments = useLoad(
    () =>
      api<Appointment[]>(`/organizations/${org.id}/appointments?day=${day}`),
    [org.id, day],
  );
  const members = useLoad(
    () => api<Member[]>(`/organizations/${org.id}/members`),
    [org.id],
  );
  const visible = (appointments.data || []).filter(
    (a) =>
      view === "calendar" ||
      (filter === "pending"
        ? ["pending", "confirmed", "blocked"].includes(a.status)
        : ["completed", "canceled", "no_show"].includes(a.status)),
  );
  return (
    <>
      <header className="page-heading">
        <h1>Записи</h1>
        <div className="actions">
          {member.role !== "groomer" && (
            <button
              className="primary icon-button"
              aria-label="Добавить запись"
              disabled={!subscription.active}
              onClick={() => {
                setAdding(true);
                setBlocking(false);
              }}
            >
              <Plus size={24} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Обновить записи"
            onClick={appointments.reload}
          >
            <RefreshCcw size={20} />
          </button>
        </div>
      </header>
      <div className="segmented" aria-label="Вид записей">
        <button
          className={view === "list" ? "active" : ""}
          onClick={() => setView("list")}
        >
          Список
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
        >
          Календарь
        </button>
        {onReports && <button onClick={onReports}>Финансы</button>}
      </div>
      {view === "calendar" && (
        <Calendar
          key={day.slice(0, 7)}
          day={day}
          today={localDate(new Date().toISOString(), org.timezone)}
          onChange={setDay}
          onBlock={() => setBlocking(true)}
          writable={subscription.active}
        />
      )}
      {view === "list" && (
        <div className="segmented" aria-label="Статус записей">
          <button
            className={filter === "pending" ? "active" : ""}
            onClick={() => setFilter("pending")}
          >
            Ожидают
          </button>
          <button
            className={filter === "history" ? "active" : ""}
            onClick={() => setFilter("history")}
          >
            История
          </button>
        </div>
      )}
      {adding && (
        <Sheet title="Новая запись" onClose={() => setAdding(false)}>
          <Booking
            orgId={org.id}
            internal
            onDone={() => {
              setAdding(false);
              appointments.reload();
            }}
          />
        </Sheet>
      )}
      {blocking && (
        <Sheet title="Заблокировать время" onClose={() => setBlocking(false)}>
          <section className="card">
            <h2>Заблокировать время</h2>
            <Form
              onDone={() => {
                setBlocking(false);
                appointments.reload();
              }}
              submit={(d) =>
                api(`/organizations/${org.id}/blocks`, "POST", {
                  member_id: str(d, "member"),
                  start_time: zonedISO(
                    str(d, "day"),
                    str(d, "time"),
                    org.timezone,
                  ),
                  duration_minutes: num(d, "duration"),
                  reason: str(d, "reason"),
                })
              }
            >
              <div className="grid two">
                <Field label="Сотрудник">
                  <select name="member" required>
                    {members.data
                      ?.filter(
                        (m) =>
                          m.active &&
                          (member.role !== "groomer" || m.id === member.id),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Дата">
                  <input name="day" type="date" required defaultValue={day} />
                </Field>
                <Field label="Начало">
                  <input
                    name="time"
                    type="time"
                    required
                    defaultValue="13:00"
                  />
                </Field>
                <Field label="Минут">
                  <input
                    name="duration"
                    type="number"
                    required
                    min={5}
                    max={1440}
                    defaultValue={60}
                  />
                </Field>
                <Field label="Причина">
                  <input name="reason" defaultValue="Перерыв" maxLength={200} />
                </Field>
              </div>
            </Form>
          </section>
        </Sheet>
      )}
      <div className="toolbar">
        <Field label="Дата календаря">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        {view === "list" && (
          <button
            onClick={() => setBlocking(true)}
            disabled={!subscription.active}
          >
            Перерыв
          </button>
        )}
        <span className="muted">{appointments.data?.length || 0} записей</span>
      </div>
      <Load {...appointments} />
      {appointments.data && visible.length === 0 && (
        <Empty>В этом списке на выбранный день записей нет.</Empty>
      )}
      <div className="appointments">
        {visible.map((a) => (
          <AppointmentCard
            key={a.id + ":" + a.version + ":" + a.paid_minor}
            app={a}
            org={org}
            member={member}
            members={members.data || []}
            writable={subscription.active}
            reload={appointments.reload}
          />
        ))}
      </div>
    </>
  );
}
function AppointmentCard({
  app: a,
  org,
  member,
  members,
  writable,
  reload,
}: {
  app: Appointment;
  org: Organization;
  member: Member;
  members: Member[];
  writable: boolean;
  reload: () => void;
}) {
  const [move, setMove] = useState(false),
    [pay, setPay] = useState(false),
    [paymentKey, setPaymentKey] = useState(crypto.randomUUID());
  const payments = useLoad(
    () =>
      pay
        ? api<
            {
              id: string;
              kind: string;
              amount_minor: number;
              method: string;
              created_at: string;
            }[]
          >(`/organizations/${org.id}/appointments/${a.id}/payments`)
        : Promise.resolve([]),
    [pay, a.id],
  );
  const base = `/organizations/${org.id}/appointments/${a.id}`;
  const transitions: Record<string, string[]> = {
    pending: ["confirmed", "canceled"],
    confirmed: ["completed", "no_show", "canceled"],
    canceled: a.client_id ? ["pending"] : [],
    blocked: ["canceled"],
  };
  return (
    <article className={"card appointment " + a.status}>
      <div className="appointment-top">
        <div className="time">
          {localTime(a.start_time, org.timezone)}
          <small>{localTime(a.end_time, org.timezone)}</small>
        </div>
        <div className="appointment-title">
          <h3>
            {a.pet_name || a.reason} {a.breed && <small>· {a.breed}</small>}
          </h3>
          <p>
            {a.client_name}{" "}
            {a.client_phone && (
              <a href={"tel:" + a.client_phone}>{a.client_phone}</a>
            )}
          </p>
          <p className="muted">
            {a.member_name} · {a.services?.join(", ")}
          </p>
        </div>
        <span className={"badge " + a.status}>{statusNames[a.status]}</span>
      </div>
      {a.pet_notes && <p className="note">Уход: {a.pet_notes}</p>}
      {a.client_id && (
        <div className="appointment-meta">
          <span>
            {money(a.total_minor, org.currency)} · получено{" "}
            {money(a.paid_minor, org.currency)}
          </span>
          <span className="muted">
            {a.notifications_enabled
              ? "Telegram подключён"
              : "Без Telegram-уведомлений"}
          </span>
        </div>
      )}
      <div className="actions">
        {(transitions[a.status] || []).map((s) => (
          <Action
            key={s}
            disabled={!writable && s !== "canceled"}
            confirm={s === "canceled" ? "Отменить эту запись?" : undefined}
            run={async () => {
              await api(base + "/status", "PATCH", {
                status: s,
                version: a.version,
              });
              reload();
            }}
          >
            {s === "confirmed"
              ? "Подтвердить"
              : s === "completed"
                ? "Завершить"
                : s === "canceled"
                  ? "Отменить"
                  : s === "pending"
                    ? "Восстановить"
                    : "Неявка"}
          </Action>
        ))}
        {["pending", "confirmed"].includes(a.status) && (
          <button disabled={!writable} onClick={() => setMove(!move)}>
            Перенести
          </button>
        )}
        {a.client_id && member.role !== "groomer" && (
          <button onClick={() => setPay(!pay)}>Оплаты</button>
        )}
      </div>
      {move && (
        <Form
          onDone={reload}
          submit={(d) =>
            api(base + "/move", "PATCH", {
              version: a.version,
              member_id: str(d, "member"),
              start_time: zonedISO(str(d, "day"), str(d, "time"), org.timezone),
            })
          }
        >
          <div className="grid three">
            <Field label="Мастер">
              <select name="member" defaultValue={a.member_id}>
                {members
                  .filter(
                    (m) =>
                      m.active &&
                      m.bookable &&
                      (member.role !== "groomer" || m.id === member.id),
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Дата">
              <input
                name="day"
                type="date"
                required
                defaultValue={localDate(a.start_time, org.timezone)}
              />
            </Field>
            <Field label={`Время (${org.timezone})`}>
              <input
                name="time"
                type="time"
                required
                defaultValue={localTime(a.start_time, org.timezone)}
              />
            </Field>
          </div>
          <p className="muted">
            Стоимость и длительность сохраняются. Сервер проверит график и
            пересечения.
          </p>
        </Form>
      )}
      {pay && (
        <div className="payment-panel">
          <Load {...payments} />
          {payments.data?.map((p) => (
            <p key={p.id}>
              {p.kind === "refund" ? "Возврат" : "Оплата"} ·{" "}
              {money(p.amount_minor, org.currency)} ·{" "}
              {dateTime(p.created_at, org.timezone)}
            </p>
          ))}
          <p>
            <b>Остаток: {money(a.total_minor - a.paid_minor, org.currency)}</b>
          </p>
          <Form
            disabled={!writable}
            onDone={reload}
            label="Записать операцию"
            submit={(d) =>
              api(base + "/payments", "POST", {
                kind: str(d, "kind"),
                method: str(d, "method"),
                amount_minor: minor(d, "amount"),
                note: str(d, "note"),
                request_key: paymentKey,
              })
            }
          >
            <div className="grid two">
              <Field label="Операция">
                <select
                  name="kind"
                  onChange={() => setPaymentKey(crypto.randomUUID())}
                >
                  <option value="payment">Оплата</option>
                  <option value="refund">Возврат</option>
                </select>
              </Field>
              <Field label={`Сумма (${org.currency})`}>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={(a.total_minor - a.paid_minor) / 100}
                  onChange={() => setPaymentKey(crypto.randomUUID())}
                />
              </Field>
              <Field label="Способ">
                <select
                  name="method"
                  onChange={() => setPaymentKey(crypto.randomUUID())}
                >
                  <option value="transfer">Перевод</option>
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                </select>
              </Field>
              <Field label="Комментарий">
                <input
                  name="note"
                  maxLength={500}
                  onChange={() => setPaymentKey(crypto.randomUUID())}
                />
              </Field>
            </div>
          </Form>
        </div>
      )}
    </article>
  );
}
