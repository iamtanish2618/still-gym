import type { GymModel } from "../hooks/use-gym";
import { navigate } from "../lib/format";
import { Mark } from "./ui";
type Props = Pick<GymModel, "user" | "route" | "pending" | "logout" | "active">;
export function AppHeader(model: Props) {
  const { user, route, pending, logout, active } = model;
  const auth = !user;
  return (
    <header className="header">
      <a href={auth ? "#/login" : "#/sessions"} className="brand">
        <Mark />
        still<span className="brand-dot">.</span>
      </a>
      <span className="brand-caption">MOVEMENT, AT YOUR PACE</span>
      {!auth && (
        <nav aria-label="Main navigation">
          <a
            href="#/sessions"
            aria-current={route === "sessions" ? "page" : undefined}
          >
            Sessions
          </a>
          <a
            href="#/bookings"
            aria-current={route === "bookings" ? "page" : undefined}
          >
            My bookings <span className="nav-count">{active.length}</span>
          </a>
          {user.role === "admin" && (
            <button
              className="mode-switch"
              role="switch"
              aria-checked={route !== "admin"}
              aria-label="Member mode"
              title={
                route === "admin"
                  ? "Switch to booking your own sessions"
                  : "Switch back to the studio desk"
              }
              disabled={!!pending}
              onClick={() => navigate(route === "admin" ? "sessions" : "admin")}
            >
              <span className="switch-track" aria-hidden="true">
                <span />
              </span>
              Member mode
            </button>
          )}
        </nav>
      )}
      <div className="header-end">
        {auth ? (
          <span className="small-label">20 MATS. ONE GOOD HOUR.</span>
        ) : (
          <>
            <span className="avatar" title={user.name}>
              {user.name.slice(0, 1)}
            </span>
            <button className="text-btn" disabled={!!pending} onClick={logout}>
              Log out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
