import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  User,
  ChevronRight,
  Users,
  Scissors,
  PawPrint,
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
  const me = useLoad(
    () => (tg()?.initData ? api<Me>("/me") : Promise.resolve(null)),
    [],
  );
  const [orgId, setOrgId] = useState(""),
    [operator, setOperator] = useState(false),
    [inviteDone, setInviteDone] = useState(false),
    [clientHint, setClientHint] = useState(false);
  const config = useLoad(() => api<{ bot_username: string }>("/config"), []);
  if (!tg()?.initData)
    return (
      <main className="welcome role-screen">
        <h1>Grooming App</h1>
        <p className="muted">
          Удобная запись для клиентов и управление для мастеров
        </p>
        <button
          className="role-card"
          disabled={!config.data?.bot_username}
          onClick={() => {
            if (config.data?.bot_username)
              window.location.href = `https://t.me/${config.data.bot_username}`;
          }}
        >
          <span className="role-icon">
            <Scissors size={28} />
          </span>
          <span>
            <strong>Я Мастер</strong>
            <small>Создать салон и расписание</small>
          </span>
          <ChevronRight size={20} />
        </button>
        <button className="role-card" onClick={() => setClientHint(true)}>
          <span className="role-icon client">
            <User size={28} />
          </span>
          <span>
            <strong>Я Клиент</strong>
            <small>У меня есть ссылка</small>
          </span>
          <ChevronRight size={20} />
        </button>
        {clientHint && (
          <p className="muted" role="status">
            Перейдите по ссылке от вашего мастера, чтобы записаться
          </p>
        )}
        <p className="muted">Вход для мастеров через Telegram</p>
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
        <p className="eyebrow">Создайте свой салон</p>
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
    [profileTab, setProfileTab] = useState("profile");
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
    { id: "calendar", label: "Записи", icon: LayoutDashboard },
    { id: "services", label: "Услуги", icon: Scissors },
    { id: "clients", label: "Клиенты", icon: Users },
    { id: "profile", label: "Профиль", icon: User },
  ];
  return (
    <div className="workspace">
      <main className="content">
        {organizations.length > 1 && (
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
        )}
        {!subscription.active && (
          <div className="banner">
            Подписка закончилась. Доступны просмотр, экспорт и отмена записей.
            <button
              onClick={() => {
                setTab("profile");
                setProfileTab("profile");
              }}
            >
              Продлить
            </button>
          </div>
        )}
        {tab === "profile" && (
          <div className="profile-tools">
            <div className="salon-switch">
              <span className="avatar">
                <Scissors size={24} />
              </span>
              <div>
                <strong>{org.name}</strong>
                <small>
                  {member.role === "owner"
                    ? "Владелец"
                    : member.role === "admin"
                      ? "Администратор"
                      : "Грумер"}
                </small>
              </div>
            </div>
            <div className="segmented" aria-label="Настройки салона">
              <button
                className={profileTab === "profile" ? "active" : ""}
                onClick={() => setProfileTab("profile")}
              >
                Салон
              </button>
              <button
                className={profileTab === "team" ? "active" : ""}
                onClick={() => setProfileTab("team")}
              >
                Команда
              </button>
              {member.role !== "groomer" && (
                <button
                  className={profileTab === "reports" ? "active" : ""}
                  onClick={() => setProfileTab("reports")}
                >
                  Финансы
                </button>
              )}
            </div>
            {operator && (
              <button className="operator-link" onClick={operator}>
                <ShieldCheck size={17} /> Кабинет оператора
              </button>
            )}
          </div>
        )}
        {tab === "calendar" ? (
          <Dashboard
            {...ctx}
            onReports={
              member.role !== "groomer"
                ? () => {
                    setTab("profile");
                    setProfileTab("reports");
                  }
                : undefined
            }
          />
        ) : tab === "clients" ? (
          <Clients {...ctx} />
        ) : tab === "services" ? (
          <Services {...ctx} />
        ) : profileTab === "team" ? (
          <Team {...ctx} />
        ) : profileTab === "reports" && member.role !== "groomer" ? (
          <Analytics {...ctx} />
        ) : (
          <Profile {...ctx} />
        )}
      </main>
      <nav className="bottom-nav" aria-label="Основная навигация">
        <div>
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => setTab(n.id)}
            >
              <n.icon size={26} strokeWidth={tab === n.id ? 2.5 : 2} />
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
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
