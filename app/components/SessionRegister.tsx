import type { GymModel } from "../hooks/use-gym";
import { dateKey, day, time } from "../lib/format";
import { Empty } from "./ui";
type Props = Pick<
  GymModel,
  | "sessions"
  | "date"
  | "setDate"
  | "allDates"
  | "setAllDates"
  | "loading"
  | "staffSession"
  | "setStaffSession"
  | "roster"
  | "setRoster"
  | "rosterLoading"
  | "rosterError"
  | "loadRoster"
>;
export function SessionRegister(model: Props) {
  const {
    sessions,
    date,
    setDate,
    allDates,
    setAllDates,
    loading,
    staffSession,
    setStaffSession,
    roster,
    setRoster,
    rosterLoading,
    rosterError,
    loadRoster,
  } = model;
  return (
    <section className="roster panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">03 / THE PEOPLE IN THE ROOM</span>
          <h2>Session register</h2>
        </div>
        <label className="field roster-select" htmlFor="roster-session">
          <span>Choose a session</span>
          <select
            id="roster-session"
            value={staffSession}
            disabled={loading}
            onChange={(e) => setStaffSession(e.target.value)}
          >
            <option value="">
              {loading
                ? "Loading sessions…"
                : sessions.length
                  ? "Select session"
                  : allDates
                    ? "No upcoming sessions"
                    : "No sessions on selected date"}
            </option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {day(s.start)} · {time(s.start)} · {s.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="date-control">
        <label htmlFor="admin-date">Schedule date</label>
        <input
          id="admin-date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value || dateKey());
            setAllDates(false);
            setStaffSession("");
            setRoster([]);
          }}
        />
        <button
          className="text-btn"
          aria-pressed={allDates}
          onClick={() => {
            setAllDates(!allDates);
            setStaffSession("");
            setRoster([]);
          }}
        >
          {allDates ? "Selected day" : "All upcoming"}
        </button>
      </div>
      {rosterError && (
        <p className="alert error" role="alert">
          {rosterError}
          <button className="text-btn" onClick={() => loadRoster()}>
            Retry
          </button>
        </p>
      )}
      {rosterLoading ? (
        <div className="loading" role="status">
          Opening the register…
        </div>
      ) : !staffSession ? (
        <Empty title="Choose an hour.">
          Select a session to see its members and attendance.
        </Empty>
      ) : roster.length === 0 ? (
        <Empty title="The room is ready.">
          No bookings for this session yet.
        </Empty>
      ) : (
        <div className="roster-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Code</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.name}</strong>
                    <small>{b.email}</small>
                  </td>
                  <td>{b.status}</td>
                  <td className="mono">
                    {b.status === "confirmed" ? b.code : "—"}
                  </td>
                  <td>{b.checked_in_at ? "Present" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
