import { useEffect, useRef, useState } from "react";
import { dateKey } from "../lib/format";
import type { Booking, Fields, Session, User } from "../lib/types";
export function useGymState() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState("login");
  const [sessions, setSessions] = useState<Session[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [date, setDate] = useState(dateKey()),
    [allDates, setAllDates] = useState(true),
    [filterReady, setFilterReady] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(""),
    [fields, setFields] = useState<Fields>({});
  const [actionCue, setActionCue] = useState<{
    kind: "booking" | "session";
    id: number;
  } | null>(null);
  useEffect(() => {
    if (!actionCue) return;
    const timeout = setTimeout(() => setActionCue(null), 1100);
    return () => clearTimeout(timeout);
  }, [actionCue]);
  const [staffSession, setStaffSession] = useState(""),
    [roster, setRoster] = useState<Booking[]>([]),
    [rosterLoading, setRosterLoading] = useState(false),
    [rosterError, setRosterError] = useState("");
  const [serverOffset, setServerOffset] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [confirm, setConfirm] = useState<number | null>(null),
    [authMode, setAuthMode] = useState("login"),
    [showPassword, setShowPassword] = useState(false);
  const requestSequence = useRef(0),
    loadingSequence = useRef<number | null>(null),
    mutating = useRef(false),
    previousBookings = useRef<Booking[]>([]),
    rosterSequence = useRef(0),
    rosterLoadingSequence = useRef<number | null>(null),
    authGeneration = useRef(0);
  return {
    user,
    setUser,
    ready,
    setReady,
    route,
    setRoute,
    sessions,
    setSessions,
    bookings,
    setBookings,
    date,
    setDate,
    allDates,
    setAllDates,
    filterReady,
    setFilterReady,
    loading,
    setLoading,
    error,
    setError,
    loadError,
    setLoadError,
    notice,
    setNotice,
    pending,
    setPending,
    fields,
    setFields,
    actionCue,
    setActionCue,
    staffSession,
    setStaffSession,
    roster,
    setRoster,
    rosterLoading,
    setRosterLoading,
    rosterError,
    setRosterError,
    serverOffset,
    setServerOffset,
    clock,
    setClock,
    confirm,
    setConfirm,
    authMode,
    setAuthMode,
    showPassword,
    setShowPassword,
    requestSequence,
    loadingSequence,
    mutating,
    previousBookings,
    rosterSequence,
    rosterLoadingSequence,
    authGeneration,
  };
}
export type GymState = ReturnType<typeof useGymState>;
