import { useState } from "react";
import { ChevronLeft, ChevronRight, Coffee } from "lucide-react";

export function Calendar({
  day,
  today,
  onChange,
  onBlock,
  writable,
}: {
  day: string;
  today: string;
  onChange: (day: string) => void;
  onBlock: () => void;
  writable: boolean;
}) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const [year, index] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, index - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const heading = new Intl.DateTimeFormat("ru", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);
  const move = (delta: number) =>
    setMonth(
      new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7),
    );
  return (
    <section className="card month-calendar" aria-label="Календарь записей">
      <div className="month-heading">
        <strong>{heading}</strong>
        <div>
          <button aria-label="Предыдущий месяц" onClick={() => move(-1)}>
            <ChevronLeft size={22} />
          </button>
          <button aria-label="Следующий месяц" onClick={() => move(1)}>
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
      <div className="month-grid">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((name) => (
          <span key={name}>{name}</span>
        ))}
        {Array.from({ length: offset }, (_, n) => (
          <div key={`empty-${n}`} />
        ))}
        {Array.from({ length: count }, (_, n) => {
          const date = `${month}-${String(n + 1).padStart(2, "0")}`;
          return (
            <button
              key={date}
              aria-label={date}
              aria-pressed={date === day}
              className={
                date === day ? "active" : date === today ? "today" : ""
              }
              onClick={() => onChange(date)}
            >
              {n + 1}
            </button>
          );
        })}
      </div>
      <button className="calendar-block" disabled={!writable} onClick={onBlock}>
        <Coffee size={18} /> Заблокировать время
      </button>
    </section>
  );
}
