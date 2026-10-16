import { useEffect } from "react";
import { dateKey, navigate } from "../lib/format";
import type { GymState } from "./use-gym-state";
export function useNavigation({
  user,
  ready,
  route,
  setRoute,
  date,
  setDate,
  allDates,
  setAllDates,
  filterReady,
  setFilterReady,
  setError,
  setNotice,
  setFields,
  staffSession,
  setStaffSession,
  setClock,
  setConfirm,
}: Pick<
  GymState,
  | "user"
  | "ready"
  | "route"
  | "setRoute"
  | "date"
  | "setDate"
  | "allDates"
  | "setAllDates"
  | "filterReady"
  | "setFilterReady"
  | "setError"
  | "setNotice"
  | "setFields"
  | "staffSession"
  | "setStaffSession"
  | "setClock"
  | "setConfirm"
>) {
  // Keep schedule navigation in the URL so reloads and shared links show the
  // same date/register. A new visit defaults to all upcoming sessions.
  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(location.search);
      const chosen = query.get("date");
      const parsed = chosen ? Date.parse(`${chosen}T00:00:00+05:30`) : NaN;
      const valid =
        !!chosen &&
        /^\d{4}-\d{2}-\d{2}$/.test(chosen) &&
        Number.isFinite(parsed) &&
        dateKey(parsed) === chosen;
      setDate(valid ? chosen : dateKey());
      setAllDates(!valid);
      const session = query.get("session") || "";
      setStaffSession(/^[1-9]\d{0,9}$/.test(session) ? session : "");
      setFilterReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [setAllDates, setDate, setFilterReady, setStaffSession]);
  useEffect(() => {
    if (!filterReady) return;
    const url = new URL(location.href);
    if (allDates) url.searchParams.delete("date");
    else url.searchParams.set("date", date);
    if (staffSession) url.searchParams.set("session", staffSession);
    else url.searchParams.delete("session");
    if (url.href !== location.href)
      history.replaceState(history.state, "", url);
  }, [filterReady, date, allDates, staffSession]);
  useEffect(() => {
    const change = () => {
      const next = location.hash.replace(/^#\/?/, "") || "sessions";
      setRoute(next);
      setError("");
      setFields({});
      setNotice("");
      setConfirm(null);
    };
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [setConfirm, setError, setFields, setNotice, setRoute]);
  useEffect(() => {
    if (!ready) return;
    if (!user && route !== "login") navigate("login");
    if (user && route === "login")
      navigate(user.role === "admin" ? "admin" : "sessions");
    if (user?.role === "member" && route === "admin") navigate("sessions");
    if (user && !["login", "sessions", "bookings", "admin"].includes(route))
      navigate("sessions");
  }, [ready, user, route]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [setClock]);

  return {};
}
