import type { GymModel } from "../hooks/use-gym";
import { day, time } from "../lib/format";
import { Arrow, Empty } from "./ui";
type Props = Pick<
  GymModel,
  | "sessions"
  | "date"
  | "allDates"
  | "loading"
  | "pending"
  | "actionCue"
  | "book"
  | "now"
>;
export function SessionTable(model: Props) {
  const { sessions, date, allDates, loading, pending, actionCue, book, now } =
    model;
  return (
    <div className="session-table">
      <div className="table-head">
        <span>SESSION / TIME</span>
        <span>AVAILABILITY</span>
        <span>YOUR PLACE</span>
      </div>
      {loading ? (
        <div className="loading" role="status">
          Finding your next hour…
        </div>
      ) : sessions.length === 0 ? (
        <Empty title="A little breathing room.">
          {allDates
            ? "No upcoming sessions have been created yet."
            : `No sessions for ${day(Date.parse(`${date}T00:00:00+05:30`))}. Choose another date or select All upcoming.`}
        </Empty>
      ) : (
        sessions.map((s) => (
          <article
            className={`session-row ${actionCue?.kind === "booking" && actionCue.id === s.id ? "action-pulse" : ""}`}
            key={s.id}
            data-session-id={s.id}
          >
            <div className="session-info">
              <span className="session-icon" aria-hidden="true">
                ◎
              </span>
              <div>
                <h3>{s.title}</h3>
                <p>
                  {day(s.start)} <span>·</span> {time(s.start)} –{" "}
                  {time(s.start + 3600000)}
                </p>
              </div>
            </div>
            <div className="availability">
              <span className={s.remaining === 0 ? "muted" : ""}>
                {s.remaining === 0 ? (
                  "All mats taken"
                ) : (
                  <>
                    <strong>{s.remaining}</strong> / {s.capacity} mats available
                  </>
                )}
              </span>
              <div className="capacity" aria-hidden="true">
                {Array.from({ length: s.capacity }, (_, i) => (
                  <i
                    key={i}
                    className={i < s.capacity - s.remaining ? "taken" : ""}
                  />
                ))}
              </div>
              {s.waiting > 0 && <small>{s.waiting} in the waitlist</small>}
            </div>
            <div className="session-action">
              {s.start <= now ? (
                <span className="tag">
                  {s.start + 3600000 <= now ? "Finished" : "In session"}
                </span>
              ) : s.my_status ? (
                <a
                  href="#/bookings"
                  className="button soft"
                  aria-busy={pending === `book-${s.id}`}
                  aria-disabled={pending === `book-${s.id}`}
                  onClick={(event) => {
                    if (pending === `book-${s.id}`) event.preventDefault();
                  }}
                >
                  {pending === `book-${s.id}`
                    ? "Saving…"
                    : s.my_status === "waitlisted"
                      ? "On the waitlist"
                      : "You’re booked"}
                  {pending === `book-${s.id}` ? (
                    <span className="request-spinner" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">✓</span>
                  )}
                </a>
              ) : (
                <button
                  className={`button ${s.remaining ? "primary" : "outline"}`}
                  onClick={() => book(s)}
                  disabled={!!pending}
                >
                  {s.remaining ? "Book a mat" : "Join waitlist"}
                  <Arrow />
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
