import { bookingMessage } from "../lib/format";
import type { Booking, Session } from "../lib/types";
import type { useApi } from "./use-api";
import type { GymState } from "./use-gym-state";
import type { useSchedule } from "./use-schedule";
export function useBookingActions({
  sessions,
  setSessions,
  setBookings,
  setError,
  setNotice,
  setPending,
  setActionCue,
  setConfirm,
  requestSequence,
  mutating,
  api,
  load,
}: Pick<
  GymState,
  | "sessions"
  | "setSessions"
  | "setBookings"
  | "setError"
  | "setNotice"
  | "setPending"
  | "setActionCue"
  | "setConfirm"
  | "requestSequence"
  | "mutating"
> & {
  api: ReturnType<typeof useApi>["api"];
  load: ReturnType<typeof useSchedule>["load"];
}) {
  async function book(s: Session) {
    if (mutating.current) return;
    mutating.current = true;
    requestSequence.current++;
    setPending(`book-${s.id}`);
    setError("");
    setNotice("");
    const original = sessions;
    const wait = s.remaining === 0;
    let failed = false;
    setSessions((list) =>
      list.map((x) =>
        x.id === s.id
          ? {
              ...x,
              remaining: wait ? 0 : x.remaining - 1,
              my_status: wait ? "waitlisted" : "confirmed",
              waiting: x.waiting + (wait ? 1 : 0),
            }
          : x,
      ),
    );
    try {
      const d = await api(`/sessions/${s.id}/${wait ? "waitlist" : "book"}`, {
        method: "POST",
        body: "{}",
      });
      setBookings((list) => [
        ...list.filter((b) => b.id !== d.booking.id),
        d.booking,
      ]);
      setNotice(bookingMessage(d.booking));
      if (d.booking.status !== "cancelled")
        setActionCue({ kind: "booking", id: s.id });
    } catch (e) {
      failed = true;
      setSessions(original);
      setError((e as Error).message);
    } finally {
      mutating.current = false;
      const refreshed = await load(true);
      // A disconnected response is not proof that the write failed. Read back
      // the member's actual booking rather than retrying the mutation blindly.
      const recovered = refreshed?.bookings.find(
        (b) => b.session_id === s.id && b.status !== "cancelled",
      );
      if (failed && recovered) {
        setError("");
        setNotice(bookingMessage(recovered));
        setActionCue({ kind: "booking", id: s.id });
      }
      setPending("");
    }
  }
  async function cancel(b: Booking) {
    if (mutating.current) return;
    mutating.current = true;
    requestSequence.current++;
    setPending(`cancel-${b.id}`);
    setError("");
    setNotice("");
    let failed = false;
    try {
      await api(`/bookings/${b.id}`, { method: "DELETE" });
      setBookings((list) =>
        list.map((x) =>
          x.id === b.id
            ? { ...x, status: "cancelled", code: null, position: null }
            : x,
        ),
      );
      setConfirm(null);
      setNotice(
        b.status === "waitlisted"
          ? "You’ve left the waitlist."
          : "Booking cancelled. Your mat is available to the next member.",
      );
    } catch (e) {
      failed = true;
      setError((e as Error).message);
    } finally {
      mutating.current = false;
      const refreshed = await load(true);
      if (
        failed &&
        refreshed?.bookings.some(
          (x) => x.id === b.id && x.status === "cancelled",
        )
      ) {
        setConfirm(null);
        setError("");
        setNotice(
          "Your place has been released. Cancellation verified with the studio.",
        );
      }
      setPending("");
    }
  }

  return { book, cancel };
}
