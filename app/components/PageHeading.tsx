import type { GymModel } from "../hooks/use-gym";
type Props = Pick<GymModel, "user" | "route" | "loadError">;
export function PageHeading(model: Props) {
  const { user, route, loadError } = model;
  if (!user) return null;
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">
          {route === "admin"
            ? "THE STUDIO DESK"
            : `HELLO, ${user.name.split(" ")[0].toUpperCase()}`}
        </p>
        <h1>
          {route === "bookings" ? (
            <>
              Your time,
              <br className="mobile-break" /> <em>set aside.</em>
            </>
          ) : route === "admin" ? (
            <>
              A little order.
              <br className="mobile-break" /> <em>A better day.</em>
            </>
          ) : (
            <>
              Find your
              <br className="mobile-break" /> <em>next hour.</em>
            </>
          )}
        </h1>
        <p className="muted">
          {route === "bookings"
            ? "Your reservations, your place in line, your moment to move."
            : route === "admin"
              ? "Create a session, welcome a member, keep the day flowing."
              : "Space to move. Time to reset. Choose a session that works for you."}
        </p>
      </div>
      <div className="heading-aside">
        <span className="live-dot" />{" "}
        {loadError ? "Reconnecting" : "Live availability"}
        <small>All times in India · IST</small>
      </div>
    </section>
  );
}
