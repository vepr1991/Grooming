import { useState } from "react";
import { api, dateTime, statusNames } from "./api";
import type { Appointment, Client, Pet } from "./api";
import type { Context } from "./Dashboard";
import { Empty, Field, Form, Load } from "./ui";
import { useLoad } from "./hooks";
import { str } from "./form-data";
export function Clients(ctx: Context) {
  const [q, setQ] = useState(""),
    [selected, setSelected] = useState(""),
    [adding, setAdding] = useState(false);
  const { org, member, subscription } = ctx;
  const list = useLoad(
    () =>
      api<Client[]>(
        `/organizations/${org.id}/clients?q=${encodeURIComponent(q)}`,
      ),
    [org.id, q],
  );
  const writable = subscription.active && member.role !== "groomer";
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Знакомые мордочки</p>
          <h1>Клиенты</h1>
        </div>
        {member.role !== "groomer" && (
          <button
            className="primary"
            disabled={!writable}
            onClick={() => setAdding(!adding)}
          >
            ＋ Клиент
          </button>
        )}
      </header>
      {adding && (
        <section className="card">
          <h2>Новый клиент</h2>
          <ClientForm
            submit={(d) => api(`/organizations/${org.id}/clients`, "POST", d)}
            onDone={() => {
              setAdding(false);
              list.reload();
            }}
          />
        </section>
      )}
      <Field label="Найти по имени, телефону или питомцу">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Имя, +7777, кличка…"
        />
      </Field>
      <Load {...list} />
      <div className="client-grid">
        {list.data?.map((c) => (
          <button
            className={
              "card client-tile " + (selected === c.id ? "selected" : "")
            }
            key={c.id}
            onClick={() => setSelected(selected === c.id ? "" : c.id)}
          >
            <span className="avatar">{c.name[0]}</span>
            <span>
              <strong>{c.name}</strong>
              <small>{c.phone}</small>
              <small>
                {c.visits} визитов ·{" "}
                {c.last_visit
                  ? dateTime(c.last_visit, org.timezone)
                  : "Ещё не был"}
              </small>
            </span>
            <span>→</span>
          </button>
        ))}
      </div>
      {list.data?.length === 0 && (
        <Empty>Клиентов пока нет или поиск не дал результатов.</Empty>
      )}
      {selected && (
        <ClientDetail
          key={selected}
          id={selected}
          ctx={ctx}
          reloadList={list.reload}
        />
      )}
    </>
  );
}
function ClientForm({
  client,
  submit,
  onDone,
  disabled = false,
}: {
  client?: Client;
  submit: (data: {
    name: string;
    phone: string;
    notes: string;
  }) => Promise<unknown>;
  onDone: () => void;
  disabled?: boolean;
}) {
  return (
    <Form
      disabled={disabled}
      onDone={onDone}
      submit={(d) =>
        submit({
          name: str(d, "name"),
          phone: str(d, "phone"),
          notes: str(d, "notes"),
        })
      }
    >
      <div className="grid two">
        <Field label="Имя">
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={client?.name}
          />
        </Field>
        <Field label="Телефон">
          <input
            name="phone"
            type="tel"
            required
            defaultValue={client?.phone}
          />
        </Field>
      </div>
      <Field label="Заметки">
        <textarea name="notes" maxLength={2000} defaultValue={client?.notes} />
      </Field>
    </Form>
  );
}
function ClientDetail({
  id,
  ctx,
  reloadList,
}: {
  id: string;
  ctx: Context;
  reloadList: () => void;
}) {
  const { org, member, subscription } = ctx;
  const detail = useLoad(
    () =>
      api<Client & { pets: Pet[]; history: Appointment[] }>(
        `/organizations/${org.id}/clients/${id}`,
      ),
    [id, org.id],
  );
  const writable = subscription.active && member.role !== "groomer";
  const reload = () => {
    detail.reload();
    reloadList();
  };
  if (!detail.data) return <Load {...detail} />;
  const client = detail.data;
  return (
    <section className="card">
      <h2>{client.name}</h2>
      <ClientForm
        client={client}
        disabled={!writable}
        onDone={reload}
        submit={(d) => api(`/organizations/${org.id}/clients/${id}`, "PUT", d)}
      />
      <h2>Питомцы</h2>
      {client.pets.map((p) => (
        <details key={p.id} className="pet">
          <summary>
            {p.name} · {p.breed || "Порода не указана"}
          </summary>
          <PetForm
            pet={p}
            disabled={!writable}
            onDone={reload}
            submit={(d) =>
              api(`/organizations/${org.id}/pets/${p.id}`, "PUT", d)
            }
          />
        </details>
      ))}
      {writable && (
        <details className="pet">
          <summary>＋ Добавить питомца</summary>
          <PetForm
            onDone={reload}
            submit={(d) =>
              api(`/organizations/${org.id}/clients/${id}/pets`, "POST", d)
            }
          />
        </details>
      )}
      <h2>История визитов</h2>
      {client.history.length === 0 ? (
        <p className="muted">История появится после первой записи.</p>
      ) : (
        client.history.map((a) => (
          <div key={a.id} className="history-row">
            <span>
              {dateTime(a.start_time, org.timezone)} · {a.pet_name} ·{" "}
              {a.member_name}
            </span>
            <span className={"badge " + a.status}>{statusNames[a.status]}</span>
          </div>
        ))
      )}
    </section>
  );
}
function PetForm({
  pet,
  submit,
  onDone,
  disabled = false,
}: {
  pet?: Pet;
  submit: (d: {
    name: string;
    breed: string;
    notes: string;
  }) => Promise<unknown>;
  onDone: () => void;
  disabled?: boolean;
}) {
  return (
    <Form
      disabled={disabled}
      onDone={onDone}
      submit={(d) =>
        submit({
          name: str(d, "name"),
          breed: str(d, "breed"),
          notes: str(d, "notes"),
        })
      }
    >
      <div className="grid two">
        <Field label="Кличка">
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={pet?.name}
          />
        </Field>
        <Field label="Порода">
          <input name="breed" maxLength={100} defaultValue={pet?.breed} />
        </Field>
      </div>
      <Field label="Особенности ухода и поведения">
        <textarea name="notes" maxLength={2000} defaultValue={pet?.notes} />
      </Field>
    </Form>
  );
}
