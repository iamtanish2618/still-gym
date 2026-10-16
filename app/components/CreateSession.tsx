import type { GymModel } from "../hooks/use-gym";
import { dateKey } from "../lib/format";
import { Arrow, Field } from "./ui";
type Props = Pick<
  GymModel,
  "pending" | "fields" | "actionCue" | "createSession"
>;
export function CreateSession(model: Props) {
  const { pending, fields, actionCue, createSession } = model;
  return (
    <section
      className={`panel create-panel ${actionCue?.kind === "session" ? "action-pulse" : ""}`}
    >
      <span className="eyebrow">01 / MAKE SPACE</span>
      <h2>Create a session</h2>
      <p className="muted">One hour. Twenty mats. A fresh start.</p>
      <form onSubmit={createSession} noValidate>
        <Field
          label="Session name"
          name="title"
          defaultValue="Open practice"
          maxLength={48}
          error={fields.title}
        />
        <div className="form-row">
          <Field
            label="Date (IST)"
            name="date"
            type="date"
            defaultValue={dateKey(Date.now() + 86400000)}
            error={fields.date}
          />
          <label className="field" htmlFor="hour">
            <span>Start hour (IST)</span>
            <select id="hour" name="hour" defaultValue="9">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
            {fields.hour && (
              <small className="field-error">{fields.hour}</small>
            )}
          </label>
        </div>
        <button
          className="button primary full"
          disabled={!!pending}
          aria-busy={pending === "create"}
        >
          {pending === "create" ? "Creating…" : "Create session"}
          {pending === "create" ? (
            <span className="request-spinner" aria-hidden="true" />
          ) : (
            <Arrow />
          )}
        </button>
      </form>
    </section>
  );
}
