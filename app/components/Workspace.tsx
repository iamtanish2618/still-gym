import type { GymModel } from "../hooks/use-gym";
import { AdminView } from "./AdminView";
import { BookingsView } from "./BookingsView";
import { PageHeading } from "./PageHeading";
import { SessionsView } from "./SessionsView";
export function Workspace(model: GymModel) {
  const { user, route, loading, error, loadError, notice, setNotice, load } =
    model;
  if (!user) return null;
  return (
    <div className="workspace">
      <PageHeading {...model} />
      {(error || loadError) && (
        <div className="alert error" role="alert">
          {error || loadError}
          <button
            className="text-btn"
            onClick={() => load()}
            disabled={loading}
          >
            Try again
          </button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status" key={notice}>
          <span className="success-message">
            <svg
              className="success-check"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path pathLength="1" d="m7.5 12 3 3 6-6" />
            </svg>
            <span>{notice}</span>
          </span>
          <button
            aria-label="Dismiss message"
            className="text-btn"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {route === "sessions" && <SessionsView {...model} />}
      {route === "bookings" && <BookingsView {...model} />}
      {route === "admin" && user.role === "admin" && <AdminView {...model} />}
    </div>
  );
}
