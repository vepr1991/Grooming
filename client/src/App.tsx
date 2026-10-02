import { useEffect, useState } from "react";
import {
  CalendarDays,
  Users,
  Scissors,
  Settings,
  ChartNoAxesCombined,
  PawPrint,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { api, dateTime, tg } from "./crm/api";
import type { Member, Organization, Subscription } from "./crm/api";
import { Action, Field, Form, Load } from "./crm/ui";
import { useLoad } from "./crm/hooks";
import { minor, str } from "./crm/form-data";
import { Booking } from "./crm/Booking";
import { Dashboard } from "./crm/Dashboard";
import { Clients } from "./crm/Clients";
import { Services, Team, Profile, Analytics } from "./crm/Settings";
import "./crm/crm.css";

type Me = {
  user: { id: number; first_name: string };
  organizations: (Organization & { role: string; member_id: string })[];
  is_operator: boolean;
};
export default function App() {
  useEffect(() => {
    tg()?.ready();
    tg()?.expand();
  }, []);
  const path = window.location.pathname.match(
    /^\/(?:book|client)\/([a-f0-9-]{36})\/?$/i,
  );
  const start =
    tg()?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get("tgWebAppStartParam") ||
    "";
  if (path || start.startsWith("salon_"))
    return (
      <main className="crm public-shell">
        <a className="brand" href="/">
          <PawPrint /> Grooming CRM
        </a>
        <Booking orgId={path ? path[1] : start.slice(6)} />
        <footer>Запись в салон · Grooming CRM</footer>
      </main>
    );
  return (
    <div className="crm">
      <Authenticated start={start} />
    </div>
  );
}
function Authenticated({ start }: { start: string }) {
  const me = useLoad(() => api<Me>("/me"), []);
  const [orgId, setOrgId] = useState(""),
    [operator, setOperator] = useState(false),
    [inviteDone, setInviteDone] = useState(false);
  const config = useLoad(() => api<{ bot_username: string }>("/config"), []);
  if (!tg()?.initData)
    return (
      <main className="welcome">
        <div className="logo-mark">
          <PawPrint size={38} />
        </div>
        <p className="eyebrow">Больше заботы. Меньше рутины.</p>
        <h1>
          Ваш салон.
          <br />
          Всё под рукой.
        </h1>
        <p>Клиенты, питомцы и расписание команды — в одном кабинете.</p>
        {config.data?.bot_username ? (
          <a
            className="primary link-button"
            href={`https://t.me/${config.data.bot_username}?startapp`}
          >
            Открыть в Telegram
          </a>
        ) : (
          <p className="muted">
            Откройте Mini App через Telegram-бота салона. Имя бота на сервере
            ещё не настроено.
          </p>
        )}
      </main>
    );
  if (!me.data)
    return (
      <main className="welcome">
        <Load {...me} />
        <button onClick={me.reload}>Повторить</button>
      </main>
    );
  if (start.startsWith("invite_") && !inviteDone)
    return (
      <main className="welcome">
        <h1>Приглашение в команду</h1>
        <p>Нажмите, чтобы присоединиться к компании.</p>
        <Action
          run={async () => {
            const result = await api<{ org_id: string }>(
              "/invitations/accept",
              "POST",
              { token: start.slice(7) },
            );
            setOrgId(result.org_id);
            setInviteDone(true);
            me.reload();
          }}
        >
          Принять приглашение
        </Action>
        <button onClick={() => setInviteDone(true)}>Вернуться в кабинет</button>
      </main>
    );
  if (operator && me.data.is_operator)
    return (
      <div className="operator-shell">
        <button onClick={() => setOperator(false)}>← Кабинет</button>
        <Operator />
      </div>
    );
  if (me.data.organizations.length === 0)
    return (
      <main className="welcome register">
        <p className="eyebrow">Начнём с вашего салона</p>
        <h1>Добро пожаловать, {me.data.user.first_name}</h1>
        <p>
          Первые 14 дней бесплатно. Добавьте услуги и отправьте клиентам ссылку
          на запись.
        </p>
        <Form
          label="Создать салон"
          onDone={me.reload}
          submit={(d) =>
            api("/organizations", "POST", {
              name: str(d, "name"),
              phone: str(d, "phone"),
              address: str(d, "address"),
              timezone: str(d, "timezone"),
              currency: str(d, "currency"),
            })
          }
        >
          <Field label="Название салона">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Лапки и хвостики"
            />
          </Field>
          <Field label="Телефон">
            <input name="phone" type="tel" maxLength={30} />
          </Field>
          <Field label="Адрес">
            <input name="address" maxLength={300} />
          </Field>
          <div className="grid two">
            <Field label="Часовой пояс">
              <input name="timezone" required defaultValue="Asia/Almaty" />
            </Field>
            <Field label="Валюта">
              <select name="currency">
                {["KZT", "RUB", "USD", "EUR"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
        </Form>
        {me.data.is_operator && (
          <button onClick={() => setOperator(true)}>Кабинет оператора</button>
        )}
      </main>
    );
  const activeOrg =
    me.data.organizations.find((o) => o.id === orgId) ||
    me.data.organizations[0];
  return (
    <Workspace
      key={activeOrg.id}
      orgId={activeOrg.id}
      organizations={me.data.organizations}
      changeOrg={setOrgId}
      operator={me.data.is_operator ? () => setOperator(true) : undefined}
    />
  );
}
function Workspace({
  orgId,
  organizations,
  changeOrg,
  operator,
}: {
  orgId: string;
  organizations: Organization[];
  changeOrg: (id: string) => void;
  operator?: () => void;
}) {
  const state = useLoad(
    () =>
      api<{
        organization: Organization;
        membership: Member;
        subscription: Subscription;
      }>(`/organizations/${orgId}`),
    [orgId],
  );
  const [tab, setTab] = useState("calendar"),
    [open, setOpen] = useState(false);
  if (!state.data)
    return (
      <main className="welcome">
        <Load {...state} />
        <button onClick={state.reload}>Повторить</button>
      </main>
    );
  const { organization: org, membership: member, subscription } = state.data;
  const ctx = { org, member, subscription, refresh: state.reload };
  const nav = [
    { id: "calendar", label: "Календарь", icon: CalendarDays },
    { id: "clients", label: "Клиенты", icon: Users },
    { id: "services", label: "Услуги", icon: Scissors },
    { id: "team", label: "Команда", icon: Users },
    ...(member.role === "groomer"
      ? []
      : [{ id: "reports", label: "Отчёты", icon: ChartNoAxesCombined }]),
    { id: "profile", label: "Салон и подписка", icon: Settings },
  ];
  return (
    <div className="workspace">
      <div className="mobile-bar">
        <span className="brand">
          <PawPrint /> Grooming CRM
        </span>
        <button aria-label="Меню" onClick={() => setOpen(!open)}>
          <Menu />
        </button>
      </div>
      <aside className={open ? "sidebar open" : "sidebar"}>
        <a className="brand" href="/">
          <PawPrint /> Grooming CRM
        </a>
        <div className="salon-switch">
          <span className="avatar">{org.name[0]}</span>
          <div>
            {organizations.length > 1 ? (
              <select
                aria-label="Компания"
                value={orgId}
                onChange={(e) => changeOrg(e.target.value)}
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{org.name}</strong>
            )}
            <small>
              {member.role === "owner"
                ? "Владелец"
                : member.role === "admin"
                  ? "Администратор"
                  : "Грумер"}
            </small>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => {
                setTab(n.id);
                setOpen(false);
              }}
            >
              <n.icon size={19} />
              {n.label}
            </button>
          ))}
          {operator && (
            <button onClick={operator}>
              <ShieldCheck size={19} />
              Оператор
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span
            className={
              "badge " + (subscription.active ? "confirmed" : "canceled")
            }
          >
            {subscription.status === "trial"
              ? "Пробный период"
              : subscription.active
                ? "Подписка активна"
                : "Доступ ограничен"}
          </span>
          <small>До {dateTime(subscription.ends_at, org.timezone)}</small>
          <button onClick={() => setTab("profile")}>
            Управлять подпиской →
          </button>
        </div>
      </aside>
      <main className="content">
        {!subscription.active && (
          <div className="banner">
            Подписка закончилась. Доступны просмотр, экспорт и отмена записей.{" "}
            <button onClick={() => setTab("profile")}>Продлить</button>
          </div>
        )}
        {tab === "calendar" ? (
          <Dashboard {...ctx} />
        ) : tab === "clients" ? (
          <Clients {...ctx} />
        ) : tab === "services" ? (
          <Services {...ctx} />
        ) : tab === "team" ? (
          <Team {...ctx} />
        ) : tab === "reports" && member.role !== "groomer" ? (
          <Analytics {...ctx} />
        ) : (
          <Profile {...ctx} />
        )}
        <footer>Grooming CRM · Забота начинается с порядка</footer>
      </main>
    </div>
  );
}
function Operator() {
  const [q, setQ] = useState("");
  const orgs = useLoad(
    () =>
      api<
        (Organization & { trial_ends_at: string; paid_until: string | null })[]
      >("/operator/organizations?q=" + encodeURIComponent(q)),
    [q],
  );
  return (
    <>
      <h1>Компании и подписки</h1>
      <Field label="Название или ID">
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <Load {...orgs} />
      {orgs.data?.map((o) => (
        <section className="card" key={o.id}>
          <h2>{o.name}</h2>
          <p className="muted">{o.id}</p>
          <p>
            Пробный период до {dateTime(o.trial_ends_at, o.timezone)}
            {o.paid_until &&
              ` · Оплачено до ${dateTime(o.paid_until, o.timezone)}`}
          </p>
          <RenewForm orgId={o.id} reload={orgs.reload} />
        </section>
      ))}
    </>
  );
}
function RenewForm({ orgId, reload }: { orgId: string; reload: () => void }) {
  const [key, setKey] = useState(crypto.randomUUID());
  return (
    <Form
      label="Подтвердить оплату и продлить на 30 дней"
      onDone={reload}
      submit={(d) =>
        api(`/operator/organizations/${orgId}/renew`, "POST", {
          amount_minor: minor(d, "amount"),
          reference: str(d, "reference"),
          request_key: key,
        })
      }
    >
      <div className="grid two">
        <Field label="Полученная сумма (валюта тарифа)">
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            onChange={() => setKey(crypto.randomUUID())}
          />
        </Field>
        <Field label="Номер / подтверждение платежа">
          <input
            name="reference"
            minLength={3}
            maxLength={300}
            required
            onChange={() => setKey(crypto.randomUUID())}
          />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" required />
        Оплата проверена, продление подтверждаю
      </label>
    </Form>
  );
}
