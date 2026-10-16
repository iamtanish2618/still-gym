import type { GymModel } from "../hooks/use-gym";
import { day, time } from "../lib/format";
import { Arrow, Empty } from "./ui";
type Props = Pick<
  GymModel,
  | "bookings"
  | "loading"
  | "pending"
  | "confirm"
  | "setConfirm"
  | "cancel"
  | "now"
  | "active"
>;
export function BookingsView(model: Props) {
  const {
    bookings,
    loading,
    pending,
    confirm,
    setConfirm,
    cancel,
    now,
    active,
  } = model;
  return (
    <section className="bookings-section">
      <div className="section-title">
        <h2>
          Your reservations{" "}
          <span className="muted">
            /{String(active.length).padStart(2, "0")}
          </span>
        </h2>
        <a href="#/sessions" className="text-btn">
          Find a session <Arrow />
        </a>
      </div>
      {loading ? (
        <div className="loading" role="status">
          Opening your reservations…
        </div>
      ) : bookings.length === 0 ? (
        <Empty title="Your next hour is waiting.">
          Book a mat from the schedule. Your code will appear here.
        </Empty>
      ) : (
        <div className="booking-grid">
          {bookings.map((b) => {
            const past = b.start + 3600000 <= now,
              cancelled = b.status === "cancelled";
            return (
              <article
                className={`booking-card ${cancelled || past ? "past" : ""}`}
                key={b.id}
                data-booking-id={b.id}
              >
                <div className="booking-top">
                  <span className="eyebrow">{day(b.start)}</span>
                  <span className="tag">
                    {cancelled
                      ? "Cancelled"
                      : b.checked_in_at
                        ? "Checked in"
                        : past
                          ? "Finished"
                          : b.status === "waitlisted"
                            ? "Waitlisted"
                            : "Confirmed"}
                  </span>
                </div>
                <h2>{b.title}</h2>
                <p className="booking-time">
                  {time(b.start)} <span>—</span> {time(b.start + 3600000)}
                </p>
                {!cancelled && b.status === "confirmed" ? (
                  <div className="ticket">
                    <span className="eyebrow">
                      {b.checked_in_at
                        ? "YOU’RE HERE. ENJOY YOUR HOUR."
                        : "YOUR CHECK-IN CODE"}
                    </span>
                    <strong className="booking-code">{b.code}</strong>
                    <small>Show this at the desk during your session.</small>
                  </div>
                ) : b.status === "waitlisted" ? (
                  <div className="ticket">
                    <span className="eyebrow">YOUR PLACE IN LINE</span>
                    <strong className="queue-number">
                      {b.start <= now
                        ? "—"
                        : String(b.position).padStart(2, "0")}
                    </strong>
                    <small>
                      {b.start <= now
                        ? "This waitlist is closed. No mat became available before the session started."
                        : "We’ll reserve your mat automatically if one opens."}
                    </small>
                  </div>
                ) : (
                  <p className="muted cancelled-note">
                    A change of plans. There’s always another hour.
                  </p>
                )}
                {b.start > now &&
                  !cancelled &&
                  (confirm === b.id ? (
                    <div className="cancel-confirm">
                      <p>
                        {b.status === "waitlisted"
                          ? "Leave the waitlist?"
                          : "Release your mat?"}
                      </p>
                      <button
                        className="text-btn danger"
                        disabled={!!pending}
                        onClick={() => cancel(b)}
                      >
                        {pending === `cancel-${b.id}`
                          ? "Releasing…"
                          : "Yes, release it"}
                      </button>
                      <button
                        className="text-btn"
                        onClick={() => setConfirm(null)}
                      >
                        Keep my place
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-btn cancel"
                      disabled={!!pending}
                      onClick={() => setConfirm(b.id)}
                    >
                      {b.status === "waitlisted"
                        ? "Leave waitlist"
                        : "Cancel booking"}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
