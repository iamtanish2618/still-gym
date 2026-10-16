import { useEffect, type FormEvent } from "react";
import { navigate } from "../lib/format";
import { RequestError } from "../lib/request-error";
import type { Fields } from "../lib/types";
import type { useApi } from "./use-api";
import type { GymState } from "./use-gym-state";
export function useAuthentication({
  setUser,
  setReady,
  setSessions,
  setBookings,
  setError,
  setPending,
  setFields,
  setActionCue,
  setStaffSession,
  setRoster,
  authMode,
  setAuthMode,
  setShowPassword,
  requestSequence,
  previousBookings,
  rosterSequence,
  authGeneration,
  api,
}: Pick<
  GymState,
  | "setUser"
  | "setReady"
  | "setSessions"
  | "setBookings"
  | "setError"
  | "setPending"
  | "setFields"
  | "setActionCue"
  | "setStaffSession"
  | "setRoster"
  | "authMode"
  | "setAuthMode"
  | "setShowPassword"
  | "requestSequence"
  | "previousBookings"
  | "rosterSequence"
  | "authGeneration"
> & { api: ReturnType<typeof useApi>["api"] }) {
  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch((e) => {
        if ((e as RequestError).status !== 401) setError((e as Error).message);
      })
      .finally(() => setReady(true));
  }, [api, setError, setReady, setUser]); // Restore the server-verified cookie session once.
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      email = String(form.get("email") || "").trim(),
      password = String(form.get("password") || ""),
      name = String(form.get("name") || "").trim(),
      username = String(form.get("username") || "")
        .trim()
        .toLowerCase(),
      f: Fields = {};
    if (authMode === "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      f.email = "Enter a valid email address.";
    if (password.length < 10 || password.length > 128)
      f.password = "Use between 10 and 128 characters.";
    if (authMode === "register" && (name.length < 2 || name.length > 60))
      f.name = "Use between 2 and 60 characters.";
    if (authMode === "login" && !email)
      f.email = "Enter your email or username.";
    if (authMode === "register" && !/^[a-z0-9_]{3,24}$/.test(username))
      f.username = "Use 3–24 letters, numbers or underscores.";
    if (
      authMode === "register" &&
      password !== String(form.get("confirmPassword") || "")
    )
      f.confirmPassword = "Your passwords do not match.";
    setFields(f);
    setError("");
    if (Object.keys(f).length) return;
    setPending("auth");
    try {
      const d = await api(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({ name, email, username, password }),
      });
      authGeneration.current++;
      setUser(d.user);
      navigate(d.user.role === "admin" ? "admin" : "sessions");
    } catch (e) {
      setError((e as Error).message);
      setFields((e as RequestError).fields || {});
    } finally {
      setPending("");
    }
  }
  async function logout() {
    setPending("logout");
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
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
      setStaffSession("");
      previousBookings.current = [];
      navigate("login");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending("");
    }
  }

  return { signIn, logout };
}
