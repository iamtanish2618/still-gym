import type { GymModel } from "../hooks/use-gym";
import { Arrow, Field } from "./ui";
type Props = Pick<GymModel, "pending" | "fields" | "checkIn">;
export function CheckIn(model: Props) {
  const { pending, fields, checkIn } = model;
  return (
    <section className="panel checkin-panel">
      <span className="eyebrow">02 / WELCOME IN</span>
      <h2>
        A familiar face.
        <br />
        <em>A simple check-in.</em>
      </h2>
      <p className="muted">
        Enter the member’s code during their session. Each code works once.
      </p>
      <form onSubmit={checkIn} noValidate>
        <Field
          label="Booking code"
          name="code"
          className="code-input"
          placeholder="ABCDEFG2"
          autoComplete="off"
          maxLength={8}
          error={fields.code}
        />
        <button className="button primary full" disabled={!!pending}>
          {pending === "checkin" ? "Checking…" : "Check in member"}
          <Arrow />
        </button>
      </form>
      <div className="desk-symbol" aria-hidden="true">
        ✳
      </div>
    </section>
  );
}
