import { useState } from "react";
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
import { Action, Empty, Field, Form, Load } from "./ui";
import { useLoad } from "./hooks";
import { minor, num, str } from "./form-data";
import { Booking } from "./Booking";
export type Context = {
  org: Organization;
  member: Member;
  subscription: Subscription;
  refresh: () => void;
};

export function Dashboard({ org, member, subscription }: Context) {
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
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Ваш рабочий день</p>
          <h1>Календарь</h1>
          <p className="muted">{org.timezone}</p>
        </div>
        <div className="actions">
          {member.role !== "groomer" && (
            <button
              className="primary"
              disabled={!subscription.active}
              onClick={() => {
                setAdding(!adding);
                setBlocking(false);
              }}
            >
              {adding ? "Закрыть" : "＋ Запись"}
            </button>
          )}
          <button
            disabled={!subscription.active}
            onClick={() => {
              setBlocking(!blocking);
              setAdding(false);
            }}
          >
            Перерыв
          </button>
        </div>
      </header>
      {adding && (
        <Booking
          orgId={org.id}
          internal
          onDone={() => {
            setAdding(false);
            appointments.reload();
          }}
        />
      )}
      {blocking && (
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
                <input name="time" type="time" required defaultValue="13:00" />
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
      )}
      <div className="toolbar">
        <Field label="Дата календаря">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <button onClick={appointments.reload}>Обновить</button>
        <span className="muted">{appointments.data?.length || 0} записей</span>
      </div>
      <Load {...appointments} />
      {appointments.data?.length === 0 && (
        <Empty>
          На этот день записей нет. Поделитесь ссылкой на запись или добавьте
          визит вручную.
        </Empty>
      )}
      <div className="appointments">
        {appointments.data?.map((a) => (
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
