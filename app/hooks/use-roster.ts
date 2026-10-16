import { invalidateSequence } from "../lib/request-sequence";
import { useCallback, useEffect } from "react";
import type { useApi } from "./use-api";
import type { GymState } from "./use-gym-state";
export function useRoster({
  user,
  route,
  staffSession,
  setRoster,
  setRosterLoading,
  setRosterError,
  rosterSequence,
  rosterLoadingSequence,
  api,
}: Pick<
  GymState,
  | "user"
  | "route"
  | "staffSession"
  | "setRoster"
  | "setRosterLoading"
  | "setRosterError"
  | "rosterSequence"
  | "rosterLoadingSequence"
> & { api: ReturnType<typeof useApi>["api"] }) {
  const loadRoster = useCallback(
    async (quiet = false) => {
      if (!staffSession || user?.role !== "admin") return;
      if (quiet && rosterLoadingSequence.current === rosterSequence.current)
        return;
      const seq = ++rosterSequence.current;
      rosterLoadingSequence.current = seq;
      if (!quiet) setRosterLoading(true);
      try {
        const d = await api(`/sessions/${staffSession}/bookings`);
        if (seq === rosterSequence.current) {
          setRoster(d.bookings);
          setRosterError("");
        }
      } catch (e) {
        if (seq === rosterSequence.current)
          setRosterError((e as Error).message);
      } finally {
        if (rosterLoadingSequence.current === seq)
          rosterLoadingSequence.current = null;
        if (seq === rosterSequence.current) setRosterLoading(false);
      }
    },
    [
      staffSession,
      user?.role,
      rosterLoadingSequence,
      rosterSequence,
      setRosterLoading,
      api,
      setRoster,
      setRosterError,
    ],
  );
  useEffect(() => {
    if (route !== "admin") return;
    loadRoster();
    const timer = setInterval(() => {
      if (!document.hidden) loadRoster(true);
    }, 3000);
    return () => {
      clearInterval(timer);
      invalidateSequence(rosterSequence);
    };
  }, [loadRoster, rosterSequence, route]);

  return { loadRoster };
}
