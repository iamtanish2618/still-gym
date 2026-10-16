import { type FormEvent } from "react";
import { time } from "../lib/format";
import { RequestError } from "../lib/request-error";
import type { Fields } from "../lib/types";
import type { useApi } from "./use-api";
import type { GymState } from "./use-gym-state";
import type { useRoster } from "./use-roster";
import type { useSchedule } from "./use-schedule";
export function useStaffActions({
  setDate,
  setAllDates,
  setError,
  setNotice,
  setPending,
  setFields,
  setActionCue,
  api,
  load,
  loadRoster,
}: Pick<
  GymState,
  | "setDate"
  | "setAllDates"
  | "setError"
  | "setNotice"
  | "setPending"
  | "setFields"
  | "setActionCue"
> & {
  api: ReturnType<typeof useApi>["api"];
  load: ReturnType<typeof useSchedule>["load"];
  loadRoster: ReturnType<typeof useRoster>["loadRoster"];
}) {
  async function createSession(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      date = String(data.get("date")),
      hour = Number(data.get("hour")),
      title = String(data.get("title")).trim(),
      f: Fields = {};
    if (!date) f.date = "Choose a date.";
    else if (
      Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00+05:30`) <=
      Date.now()
    )
      f.date = "Choose a future session.";
    if (title.length < 2 || title.length > 48)
      f.title = "Use between 2 and 48 characters.";
    setFields(f);
    setError("");
    setNotice("");
    if (Object.keys(f).length) return;
    setPending("create");
    try {
      await api("/sessions", {
        method: "POST",
        body: JSON.stringify({ date, hour, title }),
      });
      setActionCue({ kind: "session", id: Date.now() });
      setNotice("Session created. All twenty mats are ready to book.");
      setDate(date);
      setAllDates(false);
      await load(true);
    } catch (e) {
      setError((e as Error).message);
      setFields((e as RequestError).fields || {});
    } finally {
      setPending("");
    }
  }
  async function checkIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      code = String(new FormData(form).get("code")).trim().toUpperCase();
    setFields({});
    setError("");
    setNotice("");
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      setFields({ code: "Enter the eight-character code." });
      return;
    }
    setPending("checkin");
    try {
      const d = await api("/check-in", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setNotice(
        `${d.booking.name} is checked in for ${time(d.booking.start)}. Welcome in.`,
      );
      form.reset();
      await loadRoster(true);
    } catch (e) {
      setError((e as Error).message);
      setFields((e as RequestError).fields || {});
    } finally {
      setPending("");
    }
  }

  return { createSession, checkIn };
}
