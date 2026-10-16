import type { GymModel } from "../hooks/use-gym";
import { dateKey } from "../lib/format";
import { SessionTable } from "./SessionTable";
type Props = GymModel;
export function SessionsView(model: Props) {
  const {
    sessions,
    date,
    setDate,
    allDates,
    setAllDates,
    pending,
    setStaffSession,
    setRoster,
  } = model;
  return (
    <>
      <section className="session-banner">
        <div>
          <span className="eyebrow">SMALL SESSIONS. SPACE TO BREATHE.</span>
          <h2>
            Twenty mats.
            <br />
            <em>One of them could be yours.</em>
          </h2>
        </div>
        <div className="mat-art" aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <i key={i} className={i === 13 ? "your-mat" : ""} />
          ))}
        </div>
        <span className="banner-foot">60 minutes · All levels welcome</span>
      </section>
      <section className="schedule">
        <div className="section-title">
          <h2>
            {allDates ? "Upcoming sessions" : "The schedule"}{" "}
            <span className="muted">
              /{String(sessions.length).padStart(2, "0")}
            </span>
          </h2>
          <div className="date-control">
            <label htmlFor="filter-date">Date</label>
            <input
              id="filter-date"
              type="date"
              value={date}
              disabled={!!pending}
              onChange={(e) => {
                setDate(e.target.value || dateKey());
                setAllDates(false);
                setStaffSession("");
                setRoster([]);
              }}
            />
            <button
              className={`text-btn ${allDates ? "selected" : ""}`}
              disabled={!!pending}
              aria-pressed={allDates}
              onClick={() => {
                setAllDates(!allDates);
                setStaffSession("");
                setRoster([]);
              }}
            >
              {allDates ? "Show selected day" : "All upcoming"}
            </button>
          </div>
        </div>
        <SessionTable {...model} />
      </section>
      <div className="quiet-note">
        <span>↳</span>
        <p>
          Plans change. Cancel anytime before your session begins.
          <br />
          When a mat opens, the first person waiting gets it automatically.
        </p>
      </div>
    </>
  );
}
