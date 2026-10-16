import { invalidateSequence } from "../lib/request-sequence";
import { useCallback, useEffect } from "react";
import type { Booking } from "../lib/types";
import type { useApi } from "./use-api";
import type { GymState } from "./use-gym-state";
export function useSchedule({
  user,
  route,
  setSessions,
  setBookings,
  date,
  allDates,
  filterReady,
  setLoading,
  setLoadError,
  setNotice,
  setServerOffset,
  requestSequence,
  loadingSequence,
  mutating,
  previousBookings,
  api,
}: Pick<
  GymState,
  | "user"
  | "route"
  | "setSessions"
  | "setBookings"
  | "date"
  | "allDates"
  | "filterReady"
  | "setLoading"
  | "setLoadError"
  | "setNotice"
  | "setServerOffset"
  | "requestSequence"
  | "loadingSequence"
  | "mutating"
  | "previousBookings"
> & { api: ReturnType<typeof useApi>["api"] }) {
  const load = useCallback(
    async (quiet = false) => {
      if (!user || !filterReady || mutating.current) return;
      // A quiet poll must not invalidate a slower request for the same view.
      // Explicit navigation/filter changes can still replace an obsolete request.
      if (quiet && loadingSequence.current === requestSequence.current) return;
      const seq = ++requestSequence.current;
      loadingSequence.current = seq;
      if (!quiet) setLoading(true);
      try {
        const [s, b] = await Promise.all([
          api(`/sessions${allDates ? "" : `?date=${date}`}`),
          api("/bookings"),
        ]);
        if (seq !== requestSequence.current || mutating.current) return;
        setSessions(s.sessions);
        setBookings(b.bookings);
        setServerOffset(s.serverTime - Date.now());
        setLoadError("");
        const promoted = b.bookings.some(
          (x: Booking) =>
            x.status === "confirmed" &&
            previousBookings.current.some(
              (p) => p.id === x.id && p.status === "waitlisted",
            ),
        );
        if (promoted)
          setNotice(
            "A mat opened up. You’re booked! Your check-in code is in My bookings.",
          );
        previousBookings.current = b.bookings;
        return { sessions: s.sessions, bookings: b.bookings };
      } catch (e) {
        if (seq === requestSequence.current) setLoadError((e as Error).message);
      } finally {
        if (loadingSequence.current === seq) loadingSequence.current = null;
        if (seq === requestSequence.current) setLoading(false);
      }
    },
    [
      user,
      filterReady,
      mutating,
      loadingSequence,
      requestSequence,
      setLoading,
      api,
      allDates,
      date,
      setSessions,
      setBookings,
      setServerOffset,
      setLoadError,
      setNotice,
      previousBookings,
    ],
  );
  useEffect(() => {
    if (!user || route === "login") return;
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load(true);
    }, 3000);
    const focus = () => load(true);
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      invalidateSequence(requestSequence);
    };
  }, [load, requestSequence, route, user]);

  return { load };
}
