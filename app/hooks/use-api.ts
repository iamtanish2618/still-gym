import { useCallback } from "react";
import { navigate } from "../lib/format";
import { RequestError } from "../lib/request-error";
import type { ApiResponse } from "../lib/types";
import type { GymState } from "./use-gym-state";
export function useApi({
  setUser,
  setSessions,
  setBookings,
  setFields,
  setActionCue,
  setRoster,
  setAuthMode,
  setShowPassword,
  requestSequence,
  previousBookings,
  rosterSequence,
  authGeneration,
}: Pick<
  GymState,
  | "setUser"
  | "setSessions"
  | "setBookings"
  | "setFields"
  | "setActionCue"
  | "setRoster"
  | "setAuthMode"
  | "setShowPassword"
  | "requestSequence"
  | "previousBookings"
  | "rosterSequence"
  | "authGeneration"
>) {
  const api = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const generation = authGeneration.current;
      let r: Response;
      let data: ApiResponse;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        r = await fetch("/api" + path, {
          ...options,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Still-Client": "browser",
          },
          cache: "no-store",
          credentials: "same-origin",
        });
        try {
          data = (await r.json()) as ApiResponse;
        } catch {
          if (controller.signal.aborted)
            throw new DOMException("Aborted", "AbortError");
          throw new RequestError(
            "The server sent an unreadable response. Please try again.",
            502,
          );
        }
      } catch (e) {
        if (e instanceof RequestError) throw e;
        throw new RequestError(
          controller.signal.aborted
            ? "The request timed out. Check My bookings before retrying a reservation."
            : "Cannot connect. Check your connection and try again.",
          0,
        );
      } finally {
        clearTimeout(timeout);
      }
      if (!r.ok) {
        if (
          r.status === 401 &&
          !path.startsWith("/auth/") &&
          generation === authGeneration.current
        ) {
          authGeneration.current++;
          requestSequence.current++;
          rosterSequence.current++;
          setUser(null);
          setActionCue(null);
          setAuthMode("login");
          setShowPassword(false);
          setFields({});
          setSessions([]);
          setBookings([]);
          setRoster([]);
          previousBookings.current = [];
          navigate("login");
        }
        throw new RequestError(
          data.error?.message || "Something went wrong.",
          r.status,
          data.error?.fields,
        );
      }
      return data;
    },
    [
      authGeneration,
      previousBookings,
      requestSequence,
      rosterSequence,
      setActionCue,
      setAuthMode,
      setBookings,
      setFields,
      setRoster,
      setSessions,
      setShowPassword,
      setUser,
    ],
  );

  return { api };
}
