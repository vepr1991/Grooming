import { useState } from "react";
import { Plus, Scissors, ChevronRight } from "lucide-react";
import { api, dateTime, localDate, money } from "./api";
import type { Member, Service } from "./api";
import type { Context } from "./Dashboard";
import { Action, Empty, Field, Form, Load, Sheet } from "./ui";
import { useLoad } from "./hooks";
import { minor, num, str } from "./form-data";

export function Services({ org, member, subscription }: Context) {
  const [adding, setAdding] = useState(false);
  const services = useLoad(
    () => api<Service[]>(`/organizations/${org.id}/services`),
    [org.id],
  );
  const members = useLoad(
    () => api<Member[]>(`/organizations/${org.id}/members`),
    [org.id],
  );
  const writable = subscription.active && member.role !== "groomer";
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Услуги</h1>
          <p className="muted">Ваш прейскурант</p>
        </div>
        {writable && (
          <button
            className="primary icon-button"
            aria-label="Добавить услугу"
            onClick={() => setAdding(true)}
          >
            <Plus size={24} />
          </button>
        )}
      </header>
      <Load {...services} />
      <Load {...members} />
      {services.data?.map((s) => (
        <details key={s.id} className="card">
          <summary className="service-row">
            <span className="service-icon">
              <Scissors size={24} />
            </span>
            <span>
              <strong>{s.title}</strong>
              <small>
                {s.duration_minutes} мин {!s.active && "· В архиве"}
              </small>
              <b>{money(s.price_minor, org.currency)}</b>
            </span>
            <ChevronRight size={18} />
          </summary>
          <ServiceForm
            service={s}
            members={members.data || []}
            disabled={!writable}
            currency={org.currency}
            submit={(d) =>
              api(`/organizations/${org.id}/services/${s.id}`, "PUT", d)
            }
            onDone={services.reload}
          />
        </details>
      ))}
      {writable && adding && (
        <Sheet title="Новая услуга" onClose={() => setAdding(false)}>
          <section className="card">
            <h2>Новая услуга</h2>
            <ServiceForm
              key={services.data?.length}
              members={members.data || []}
              currency={org.currency}
              submit={(d) =>
                api(`/organizations/${org.id}/services`, "POST", d)
              }
              onDone={() => {
                setAdding(false);
                services.reload();
              }}
            />
          </section>
        </Sheet>
      )}
      {services.data?.length === 0 && <Empty>Услуги ещё не добавлены.</Empty>}
    </>
  );
}
function ServiceForm({
  service,
  members,
  disabled = false,
  currency,
  submit,
  onDone,
}: {
  service?: Service;
  members: Member[];
  disabled?: boolean;
  currency: string;
  submit: (d: unknown) => Promise<unknown>;
  onDone: () => void;
}) {
  return (
    <Form
      disabled={disabled}
      onDone={onDone}
      submit={(d) =>
        submit({
          title: str(d, "title"),
          price_minor: minor(d, "price"),
          duration_minutes: num(d, "duration"),
          member_ids: d.getAll("members"),
          active: d.has("active"),
        })
      }
    >
      <Field label="Название">
        <input
          name="title"
          minLength={2}
          maxLength={100}
          required
          defaultValue={service?.title}
        />
      </Field>
      <div className="grid two">
        <Field label={`Цена (${currency})`}>
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={(service?.price_minor || 0) / 100}
          />
        </Field>
        <Field label="Длительность, мин">
          <input
            name="duration"
            type="number"
            min={5}
            max={480}
            required
            defaultValue={service?.duration_minutes || 60}
          />
        </Field>
      </div>
      <p className="label">Кто выполняет услугу</p>
      <div className="checks">
        {members
          .filter((m) => m.active && m.bookable)
          .map((m) => (
            <label className="check" key={m.id}>
              <input
                type="checkbox"
                name="members"
                value={m.id}
                defaultChecked={
                  service
                    ? service.member_ids.includes(m.id)
                    : members.filter((x) => x.active && x.bookable).length === 1
                }
              />
              {m.name}
            </label>
          ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={service ? service.active : true}
        />
        Доступна для записи
      </label>
    </Form>
  );
}
const weekdays = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
type Schedule = {
  days: { weekday: number; start_time: string; end_time: string }[];
  exceptions: {
    day: string;
    start_time: string | null;
    end_time: string | null;
  }[];
};
export function Team(ctx: Context) {
  const { org, member, subscription } = ctx;
  const members = useLoad(
    () => api<Member[]>(`/organizations/${org.id}/members`),
    [org.id],
  );
  const [selected, setSelected] = useState(member.id),
    [invite, setInvite] = useState("");
  const chosen = members.data?.find((m) => m.id === selected);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Люди и рабочее время</p>
          <h1>Команда</h1>
        </div>
      </header>
      <Load {...members} />
      <div className="tabs">
        {members.data
          ?.filter((m) => member.role !== "groomer" || m.id === member.id)
          .map((m) => (
            <button
              className={selected === m.id ? "chosen" : ""}
              key={m.id}
              onClick={() => setSelected(m.id)}
            >
              {m.name}
              {!m.active ? " · Неактивен" : ""}
            </button>
          ))}
      </div>
      {chosen && (
        <section className="card" key={chosen.id}>
          <h2>{chosen.name}</h2>
          {member.role === "owner" && (
            <Form
              disabled={!subscription.active}
              onDone={members.reload}
              submit={(d) =>
                api(`/organizations/${org.id}/members/${chosen.id}`, "PUT", {
                  name: str(d, "name"),
                  role: str(d, "role"),
                  active: d.has("active"),
                  bookable: d.has("bookable"),
                })
              }
            >
              <div className="grid two">
                <Field label="Имя">
                  <input
                    name="name"
                    required
                    minLength={2}
                    defaultValue={chosen.name}
                  />
                </Field>
                <Field label="Роль">
                  <select name="role" defaultValue={chosen.role}>
                    {chosen.role === "owner" ? (
                      <option value="owner">Владелец</option>
                    ) : (
                      <>
                        <option value="admin">Администратор</option>
                        <option value="groomer">Грумер</option>
                      </>
                    )}
                  </select>
                </Field>
              </div>
              <div className="checks">
                <label className="check">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={chosen.active}
                  />
                  Доступ к компании
                </label>
                <label className="check">
                  <input
                    name="bookable"
                    type="checkbox"
                    defaultChecked={chosen.bookable}
                  />
                  Принимает клиентов
                </label>
              </div>
            </Form>
          )}
          <ScheduleEditor ctx={ctx} memberId={chosen.id} />
        </section>
      )}
      {member.role === "owner" && (
        <section className="card">
          <h2>Пригласить сотрудника</h2>
          <Form
            disabled={!subscription.active}
            label="Создать приглашение"
            submit={async (d) => {
              const result = await api<{ link: string | null; token: string }>(
                `/organizations/${org.id}/invitations`,
                "POST",
                { name: str(d, "name"), role: str(d, "role") },
              );
              setInvite(
                result.link ||
                  "Настройте имя бота, чтобы получить ссылку приглашения.",
              );
            }}
          >
            <div className="grid two">
              <Field label="Имя">
                <input name="name" required minLength={2} />
              </Field>
              <Field label="Роль">
                <select name="role">
                  <option value="groomer">Грумер</option>
                  <option value="admin">Администратор</option>
                </select>
              </Field>
            </div>
          </Form>
          {invite && (
            <div className="share-box">
              <p>
                Одноразовая ссылка действует 7 дней. Отправьте её сотруднику
                лично.
              </p>
              <input readOnly aria-label="Ссылка приглашения" value={invite} />
              <Action run={() => navigator.clipboard.writeText(invite)}>
                Скопировать
              </Action>
            </div>
          )}
        </section>
      )}
    </>
  );
}
function ScheduleEditor({ ctx, memberId }: { ctx: Context; memberId: string }) {
  const { org, subscription } = ctx,
    base = `/organizations/${org.id}/members/${memberId}`;
  const schedule = useLoad(() => api<Schedule>(base + "/schedule"), [base]);
  const [off, setOff] = useState(true);
  if (!schedule.data) return <Load {...schedule} />;
  return (
    <>
      <h2>Недельный график</h2>
      <p className="muted">
        Время: {org.timezone}. Изменение графика не переносит уже созданные
        визиты — проверьте календарь.
      </p>
      <Form
        disabled={!subscription.active}
        onDone={schedule.reload}
        submit={(d) =>
          api(base + "/schedule", "PUT", {
            days: weekdays.flatMap((_, i) =>
              d.has("on" + i)
                ? [
                    {
                      weekday: i,
                      start_time: str(d, "start" + i),
                      end_time: str(d, "end" + i),
                    },
                  ]
                : [],
            ),
          })
        }
      >
        {weekdays.map((name, i) => {
          const day = schedule.data!.days.find((d) => d.weekday === i);
          return (
            <div className="schedule-row" key={i}>
              <label className="check">
                <input type="checkbox" name={"on" + i} defaultChecked={!!day} />
                {name}
              </label>
              <input
                aria-label={name + " начало"}
                type="time"
                name={"start" + i}
                defaultValue={day?.start_time?.slice(0, 5) || "10:00"}
                required
              />
              <span>—</span>
              <input
                aria-label={name + " конец"}
                type="time"
                name={"end" + i}
                defaultValue={day?.end_time?.slice(0, 5) || "19:00"}
                required
              />
            </div>
          );
        })}
      </Form>
      <h2>Особый график на дату</h2>
      <Form
        disabled={!subscription.active}
        onDone={schedule.reload}
        submit={(d) =>
          api(base + "/exceptions", "PUT", {
            day: str(d, "day"),
            start_time: off ? null : str(d, "start"),
            end_time: off ? null : str(d, "end"),
          })
        }
      >
        <Field label="Дата">
          <input type="date" name="day" required />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => setOff(e.target.checked)}
          />
          Выходной
        </label>
        {!off && (
          <div className="grid two">
            <Field label="Начало">
              <input type="time" name="start" required defaultValue="10:00" />
            </Field>
            <Field label="Конец">
              <input type="time" name="end" required defaultValue="19:00" />
            </Field>
          </div>
        )}
      </Form>
      {schedule.data.exceptions.map((d) => (
        <div className="history-row" key={d.day}>
          <span>
            {d.day} ·{" "}
            {d.start_time
              ? `${d.start_time.slice(0, 5)}–${d.end_time?.slice(0, 5)}`
              : "Выходной"}
          </span>
          <Action
            disabled={!subscription.active}
            run={async () => {
              await api(base + "/exceptions/" + d.day, "DELETE");
              schedule.reload();
            }}
          >
            Убрать
          </Action>
        </div>
      ))}
    </>
  );
}
export function Profile({ org, member, subscription, refresh }: Context) {
  const [exported, setExported] = useState(false);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Настройки бизнеса</p>
          <h1>Профиль</h1>
        </div>
      </header>
      <section className="card">
        <h2>Ссылка для клиентов</h2>
        <div className="share-box">
          <input
            readOnly
            aria-label="Ссылка для записи"
            value={`${window.location.origin}/book/${org.id}`}
          />
          <Action
            run={() =>
              navigator.clipboard.writeText(
                `${window.location.origin}/book/${org.id}`,
              )
            }
          >
            Скопировать
          </Action>
          <a href={"/book/" + org.id} target="_blank" rel="noreferrer">
            Открыть страницу ↗
          </a>
        </div>
      </section>
      <section className="card">
        <h2>
          {subscription.status === "trial"
            ? "Пробный период"
            : subscription.active
              ? "Подписка активна"
              : "Подписка закончилась"}
        </h2>
        <p>Доступ до {dateTime(subscription.ends_at, org.timezone)}</p>
        {member.role === "owner" && (
          <>
            <p>
              {subscription.price_minor > 0
                ? `${money(subscription.price_minor, subscription.currency)} за 30 дней`
                : "Стоимость уточняйте у оператора."}
            </p>
            <p className="prewrap">{subscription.payment_instructions}</p>
            <p className="muted">
              После оплаты оператор продлит доступ. Данные сохраняются при
              окончании подписки.
            </p>
          </>
        )}
      </section>
      {member.role === "owner" && (
        <section className="card">
          <h2>Данные салона</h2>
          <Form
            disabled={!subscription.active}
            onDone={refresh}
            submit={(d) =>
              api("/organizations/" + org.id, "PUT", {
                name: str(d, "name"),
                address: str(d, "address"),
                phone: str(d, "phone"),
                timezone: str(d, "timezone"),
                currency: str(d, "currency"),
                slot_step: num(d, "step"),
              })
            }
          >
            <Field label="Название">
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={org.name}
              />
            </Field>
            <Field label="Адрес">
              <input
                name="address"
                maxLength={300}
                defaultValue={org.address}
              />
            </Field>
            <div className="grid two">
              <Field label="Телефон">
                <input
                  name="phone"
                  type="tel"
                  maxLength={30}
                  defaultValue={org.phone}
                />
              </Field>
              <Field label="Часовой пояс">
                <input
                  name="timezone"
                  required
                  defaultValue={org.timezone}
                  placeholder="Asia/Almaty"
                />
              </Field>
              <Field label="Валюта">
                <select name="currency" defaultValue={org.currency}>
                  {["KZT", "RUB", "USD", "EUR"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Шаг записи, мин">
                <input
                  name="step"
                  type="number"
                  min={5}
                  max={120}
                  defaultValue={org.slot_step}
                />
              </Field>
            </div>
          </Form>
        </section>
      )}
      {member.role !== "groomer" && (
        <section className="card">
          <h2>Выгрузка данных</h2>
          <p className="muted">
            Клиенты, питомцы, записи, оплаты и настройки в JSON.
          </p>
          <Action
            run={async () => {
              const data = await api(`/organizations/${org.id}/export`);
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `grooming-${org.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
              setExported(true);
            }}
          >
            Скачать данные
          </Action>
          {exported && <p className="success">Выгрузка подготовлена</p>}
        </section>
      )}
    </>
  );
}
export function Analytics({ org }: Context) {
  const today = localDate(new Date().toISOString(), org.timezone);
  const [start, setStart] = useState(today.slice(0, 8) + "01"),
    [end, setEnd] = useState(today);
  const stats = useLoad(
    () =>
      api<Record<string, number>>(
        `/organizations/${org.id}/analytics?start=${start}&end=${end}`,
      ),
    [org.id, start, end],
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Понятные цифры</p>
          <h1>Отчёты</h1>
        </div>
      </header>
      <div className="grid two">
        <Field label="С">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="По">
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <Load {...stats} />
      {stats.data && (
        <div className="stats">
          {[
            ["receipts_minor", "Получено денег"],
            ["appointments", "Записей"],
            ["completed", "Завершено"],
            ["completed_value_minor", "Стоимость завершённых услуг"],
            ["refunds_minor", "Возвращено"],
            ["outstanding_minor", "Долг по завершённым визитам"],
          ].map(([key, label]) => (
            <section className="card" key={key}>
              <p className="muted">{label}</p>
              <strong>
                {key.endsWith("minor")
                  ? money(stats.data![key], org.currency)
                  : stats.data![key]}
              </strong>
            </section>
          ))}
        </div>
      )}
      <p className="muted">
        Услуги учитываются по дате визита, поступления и возвраты — по дате
        операции. Часовой пояс: {org.timezone}.
      </p>
    </>
  );
}
