"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
type User = {
  id: number;
  name: string;
  email: string;
  role: "member" | "admin";
};
type Session = {
  id: number;
  title: string;
  start: number;
  capacity: number;
  remaining: number;
  waiting: number;
  my_status: string | null;
};
type Booking = {
  id: number;
  session_id: number;
  title: string;
  start: number;
  status: string;
  code: string | null;
  position: number | null;
  checked_in_at: number | null;
  name?: string;
  email?: string;
};
type Fields = Record<string, string>;
type ApiResponse = {
  user: User;
  token: string;
  sessions: Session[];
  bookings: Booking[];
  serverTime: number;
  booking: Booking;
  error?: { message: string; fields: Fields };
};
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Fields = {},
  ) {
    super(message);
  }
}
const zone = "Asia/Kolkata";
const dateKey = (n = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(n);
const time = (n: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(n);
const day = (n: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(n);
const bookingMessage = (booking: Booking) =>
  booking.status === "waitlisted"
    ? `You’re number ${booking.position} in line. We’ll book you automatically when a mat opens.`
    : booking.status === "confirmed"
      ? `Your mat is reserved. Check-in code: ${booking.code}.`
      : "This reservation was cancelled on another screen. Availability has been refreshed.";
const navigate = (page: string) => {
  window.location.hash = "/" + page;
};
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
function Field({
  label,
  name,
  error,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field" htmlFor={name}>
      <span>{label}</span>
      <input
        id={name}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        {...props}
      />
      {error && (
        <small className="field-error" id={`${name}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol" aria-hidden="true">
        ◎
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export default function Gym() {
  const [user, setUser] = useState<User | null>(null),
    [token, setToken] = useState(""),
    [ready, setReady] = useState(false),
    [route, setRoute] = useState("login");
  const [sessions, setSessions] = useState<Session[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [date, setDate] = useState(dateKey()),
    [allDates, setAllDates] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(""),
    [fields, setFields] = useState<Fields>({});
  const [staffSession, setStaffSession] = useState(""),
    [roster, setRoster] = useState<Booking[]>([]),
    [rosterLoading, setRosterLoading] = useState(false),
    [rosterError, setRosterError] = useState("");
  const [serverOffset, setServerOffset] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [confirm, setConfirm] = useState<number | null>(null),
    [authMode, setAuthMode] = useState("login");
  const requestSequence = useRef(0),
    loadingSequence = useRef<number | null>(null),
    mutating = useRef(false),
    previousBookings = useRef<Booking[]>([]),
    rosterSequence = useRef(0),
    rosterLoadingSequence = useRef<number | null>(null);
  const now = clock + serverOffset;
  const api = useCallback(
    async (path: string, options: RequestInit = {}, override?: string) => {
      const auth = override ?? token;
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
            ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
          },
          cache: "no-store",
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
          sessionStorage.getItem("still-token") === auth
        ) {
          sessionStorage.removeItem("still-token");
          requestSequence.current++;
          rosterSequence.current++;
          setUser(null);
          setToken("");
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
    [token],
  );
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
  }, []);
  useEffect(() => {
    const stored = sessionStorage.getItem("still-token");
    if (!stored) {
      setReady(true);
      return;
    }
    api("/auth/me", {}, stored)
      .then((data) => {
        setToken(stored);
        setUser(data.user);
      })
      .catch(() => sessionStorage.removeItem("still-token"))
      .finally(() => setReady(true));
  }, []); // Restore once; token changes do not restart restoration.
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
  }, []);
  const load = useCallback(
    async (quiet = false) => {
      if (!user || mutating.current) return;
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
    [api, user, date, allDates],
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
      requestSequence.current++;
    };
  }, [load, route, user]);
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
    [staffSession, user, api],
  );
  useEffect(() => {
    if (route !== "admin") return;
    loadRoster();
    const timer = setInterval(() => {
      if (!document.hidden) loadRoster(true);
    }, 3000);
    return () => {
      clearInterval(timer);
      rosterSequence.current++;
    };
  }, [loadRoster, route]);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      email = String(form.get("email") || "").trim(),
      password = String(form.get("password") || ""),
      name = String(form.get("name") || "").trim(),
      f: Fields = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      f.email = "Enter a valid email address.";
    if (password.length < 10 || password.length > 128)
      f.password = "Use between 10 and 128 characters.";
    if (authMode === "register" && (name.length < 2 || name.length > 60))
      f.name = "Use between 2 and 60 characters.";
    setFields(f);
    setError("");
    if (Object.keys(f).length) return;
    setPending("auth");
    try {
      const d = await api(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      sessionStorage.setItem("still-token", d.token);
      setToken(d.token);
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
      sessionStorage.removeItem("still-token");
      requestSequence.current++;
      rosterSequence.current++;
      setToken("");
      setUser(null);
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
        body: JSON.stringify({ date, hour, title, capacity: 20 }),
      });
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
  if (!ready)
    return (
      <div className="boot" role="status">
        <Mark /> Opening the studio…
      </div>
    );
  const active = bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.start + 3600000 > now &&
      (b.status !== "waitlisted" || b.start > now),
  );
  const auth = !user;
  return (
    <div className="shell">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
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
            {user.role === "member" && (
              <a
                href="#/bookings"
                aria-current={route === "bookings" ? "page" : undefined}
              >
                My bookings <span className="nav-count">{active.length}</span>
              </a>
            )}
            {user.role === "admin" && (
              <a
                href="#/admin"
                aria-current={route === "admin" ? "page" : undefined}
              >
                Studio desk
              </a>
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
              <button
                className="text-btn"
                disabled={!!pending}
                onClick={logout}
              >
                Log out
              </button>
            </>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {auth ? (
          <div className="auth-layout">
            <section className="auth-story">
              <p className="eyebrow">A LITTLE SPACE. JUST FOR YOU.</p>
              <h1>
                Make room
                <br />
                for <em>yourself.</em>
              </h1>
              <p className="intro">
                One hour to move, breathe, and come back to you.
                <br />
                Your next session starts here.
              </p>
              <div className="orb-scene" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orb" />
                <span className="orbit-caption">LESS RUSH. MORE ROOM.</span>
              </div>
              <div className="story-footer">
                <span>01 / A simpler rhythm</span>
                <span>Move well. Feel still.</span>
              </div>
            </section>
            <section className="auth-form-section">
              <div className="auth-form">
                <p className="eyebrow">YOUR DAILY RESET</p>
                <h2>
                  {authMode === "login" ? "Welcome back." : "Find your rhythm."}
                </h2>
                <p className="muted">
                  {authMode === "login"
                    ? "A little time for yourself is a good place to start."
                    : "Create an account. We’ll save you a little space."}
                </p>
                <div className="auth-tabs" aria-label="Account options">
                  <button
                    aria-pressed={authMode === "login"}
                    onClick={() => {
                      setAuthMode("login");
                      setError("");
                      setFields({});
                    }}
                  >
                    Log in
                  </button>
                  <button
                    aria-pressed={authMode === "register"}
                    onClick={() => {
                      setAuthMode("register");
                      setError("");
                      setFields({});
                    }}
                  >
                    Create account
                  </button>
                </div>
                {error && (
                  <p className="alert error" role="alert">
                    {error}
                  </p>
                )}
                <form onSubmit={signIn} noValidate key={authMode}>
                  {authMode === "register" && (
                    <Field
                      label="Your name"
                      name="name"
                      autoComplete="name"
                      placeholder="Aanya Shah"
                      error={fields.name}
                    />
                  )}
                  <Field
                    label="Email address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    error={fields.email}
                  />
                  <Field
                    label="Password"
                    name="password"
                    type="password"
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="At least 10 characters"
                    error={fields.password}
                  />
                  <button className="button primary full" disabled={!!pending}>
                    {pending === "auth"
                      ? "Opening your space…"
                      : authMode === "login"
                        ? "Enter your space"
                        : "Create your account"}
                    <Arrow />
                  </button>
                </form>
                <p className="auth-note">
                  A mat when you need it.
                  <br />A fair place in line when it’s full.
                </p>
                <details className="demo">
                  <summary>Trying the studio? Demo accounts</summary>
                  <p>
                    Member: <code>aanya@still.demo</code>
                    <br />
                    Staff: <code>admin@still.demo</code>
                    <br />
                    Password for both: <code>StillDemo2026!</code>
                  </p>
                </details>
              </div>
            </section>
          </div>
        ) : (
          <div className="workspace">
            <section className="page-heading">
              <div>
                <p className="eyebrow">
                  {route === "admin"
                    ? "THE STUDIO DESK"
                    : `HELLO, ${user.name.split(" ")[0].toUpperCase()}`}
                </p>
                <h1>
                  {route === "bookings" ? (
                    <>
                      Your time,
                      <br className="mobile-break" /> <em>set aside.</em>
                    </>
                  ) : route === "admin" ? (
                    <>
                      A little order.
                      <br className="mobile-break" /> <em>A better day.</em>
                    </>
                  ) : (
                    <>
                      Find your
                      <br className="mobile-break" /> <em>next hour.</em>
                    </>
                  )}
                </h1>
                <p className="muted">
                  {route === "bookings"
                    ? "Your reservations, your place in line, your moment to move."
                    : route === "admin"
                      ? "Create a session, welcome a member, keep the day flowing."
                      : "Space to move. Time to reset. Choose a session that works for you."}
                </p>
              </div>
              <div className="heading-aside">
                <span className="live-dot" />{" "}
                {loadError ? "Reconnecting" : "Live availability"}
                <small>All times in India · IST</small>
              </div>
            </section>
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
              <div className="alert success" role="status">
                {notice}
                <button
                  aria-label="Dismiss message"
                  className="text-btn"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            {route === "sessions" && (
              <>
                <section className="session-banner">
                  <div>
                    <span className="eyebrow">
                      SMALL SESSIONS. SPACE TO BREATHE.
                    </span>
                    <h2>
                      Twenty mats.
                      <br />
                      <em>One of them could be yours.</em>
                    </h2>
                  </div>
                  <div className="mat-art" aria-hidden="true">
                    {Array.from({ length: 20 }, (_, i) => (
                      <i key={i} className={i === 13 ? "your-mat" : ""} />
                    ))}
                  </div>
                  <span className="banner-foot">
                    60 minutes · All levels welcome
                  </span>
                </section>
                <section className="schedule">
                  <div className="section-title">
                    <h2>
                      The schedule{" "}
                      <span className="muted">
                        /{String(sessions.length).padStart(2, "0")}
                      </span>
                    </h2>
                    <div className="date-control">
                      <label htmlFor="filter-date">Date</label>
                      <input
                        id="filter-date"
                        type="date"
                        value={date}
                        disabled={!!pending}
                        onChange={(e) => {
                          setDate(e.target.value || dateKey());
                          setAllDates(false);
                        }}
                      />
                      <button
                        className={`text-btn ${allDates ? "selected" : ""}`}
                        disabled={!!pending}
                        onClick={() => setAllDates(!allDates)}
                      >
                        {allDates ? "Show selected day" : "All upcoming"}
                      </button>
                    </div>
                  </div>
                  <div className="session-table">
                    <div className="table-head">
                      <span>SESSION / TIME</span>
                      <span>AVAILABILITY</span>
                      <span>YOUR PLACE</span>
                    </div>
                    {loading ? (
                      <div className="loading" role="status">
                        Finding your next hour…
                      </div>
                    ) : sessions.length === 0 ? (
                      <Empty title="A little breathing room.">
                        No sessions on this date. Choose another day or view all
                        upcoming.
                      </Empty>
                    ) : (
                      sessions.map((s) => (
                        <article
                          className="session-row"
                          key={s.id}
                          data-session-id={s.id}
                        >
                          <div className="session-info">
                            <span className="session-icon" aria-hidden="true">
                              ◎
                            </span>
                            <div>
                              <h3>{s.title}</h3>
                              <p>
                                {day(s.start)} <span>·</span> {time(s.start)} –{" "}
                                {time(s.start + 3600000)}
                              </p>
                            </div>
                          </div>
                          <div className="availability">
                            <span className={s.remaining === 0 ? "muted" : ""}>
                              {s.remaining === 0 ? (
                                "All mats taken"
                              ) : (
                                <>
                                  <strong>{s.remaining}</strong> / 20 mats
                                  available
                                </>
                              )}
                            </span>
                            <div className="capacity" aria-hidden="true">
                              {Array.from({ length: 20 }, (_, i) => (
                                <i
                                  key={i}
                                  className={
                                    i < 20 - s.remaining ? "taken" : ""
                                  }
                                />
                              ))}
                            </div>
                            {s.waiting > 0 && (
                              <small>{s.waiting} in the waitlist</small>
                            )}
                          </div>
                          <div className="session-action">
                            {user.role === "admin" ? (
                              <button
                                className="button soft"
                                onClick={() => {
                                  setStaffSession(String(s.id));
                                  navigate("admin");
                                }}
                                disabled={!!pending}
                              >
                                View register <Arrow />
                              </button>
                            ) : s.start <= now ? (
                              <span className="tag">
                                {s.start + 3600000 <= now
                                  ? "Finished"
                                  : "In session"}
                              </span>
                            ) : s.my_status ? (
                              <a href="#/bookings" className="button soft">
                                {pending === `book-${s.id}`
                                  ? "Saving…"
                                  : s.my_status === "waitlisted"
                                    ? "On the waitlist"
                                    : "You’re booked"}
                                <span aria-hidden="true">✓</span>
                              </a>
                            ) : (
                              <button
                                className={`button ${s.remaining ? "primary" : "outline"}`}
                                onClick={() => book(s)}
                                disabled={!!pending}
                              >
                                {s.remaining ? "Book a mat" : "Join waitlist"}
                                <Arrow />
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
                <div className="quiet-note">
                  <span>↳</span>
                  <p>
                    Plans change. Cancel anytime before your session begins.
                    <br />
                    When a mat opens, the first person waiting gets it
                    automatically.
                  </p>
                </div>
              </>
            )}
            {route === "bookings" && (
              <section className="bookings-section">
                <div className="section-title">
                  <h2>
                    Your reservations{" "}
                    <span className="muted">
                      /{String(active.length).padStart(2, "0")}
                    </span>
                  </h2>
                  <a href="#/sessions" className="text-btn">
                    Find a session <Arrow />
                  </a>
                </div>
                {loading ? (
                  <div className="loading" role="status">
                    Opening your reservations…
                  </div>
                ) : bookings.length === 0 ? (
                  <Empty title="Your next hour is waiting.">
                    Book a mat from the schedule. Your code will appear here.
                  </Empty>
                ) : (
                  <div className="booking-grid">
                    {bookings.map((b) => {
                      const past = b.start + 3600000 <= now,
                        cancelled = b.status === "cancelled";
                      return (
                        <article
                          className={`booking-card ${cancelled || past ? "past" : ""}`}
                          key={b.id}
                          data-booking-id={b.id}
                        >
                          <div className="booking-top">
                            <span className="eyebrow">{day(b.start)}</span>
                            <span className="tag">
                              {cancelled
                                ? "Cancelled"
                                : b.checked_in_at
                                  ? "Checked in"
                                  : past
                                    ? "Finished"
                                    : b.status === "waitlisted"
                                      ? "Waitlisted"
                                      : "Confirmed"}
                            </span>
                          </div>
                          <h2>{b.title}</h2>
                          <p className="booking-time">
                            {time(b.start)} <span>—</span>{" "}
                            {time(b.start + 3600000)}
                          </p>
                          {!cancelled && b.status === "confirmed" ? (
                            <div className="ticket">
                              <span className="eyebrow">
                                {b.checked_in_at
                                  ? "YOU’RE HERE. ENJOY YOUR HOUR."
                                  : "YOUR CHECK-IN CODE"}
                              </span>
                              <strong className="booking-code">{b.code}</strong>
                              <small>
                                Show this at the desk during your session.
                              </small>
                            </div>
                          ) : b.status === "waitlisted" ? (
                            <div className="ticket">
                              <span className="eyebrow">
                                YOUR PLACE IN LINE
                              </span>
                              <strong className="queue-number">
                                {b.start <= now
                                  ? "—"
                                  : String(b.position).padStart(2, "0")}
                              </strong>
                              <small>
                                {b.start <= now
                                  ? "This waitlist is closed. No mat became available before the session started."
                                  : "We’ll reserve your mat automatically if one opens."}
                              </small>
                            </div>
                          ) : (
                            <p className="muted cancelled-note">
                              A change of plans. There’s always another hour.
                            </p>
                          )}
                          {b.start > now &&
                            !cancelled &&
                            (confirm === b.id ? (
                              <div className="cancel-confirm">
                                <p>
                                  {b.status === "waitlisted"
                                    ? "Leave the waitlist?"
                                    : "Release your mat?"}
                                </p>
                                <button
                                  className="text-btn danger"
                                  disabled={!!pending}
                                  onClick={() => cancel(b)}
                                >
                                  {pending === `cancel-${b.id}`
                                    ? "Releasing…"
                                    : "Yes, release it"}
                                </button>
                                <button
                                  className="text-btn"
                                  onClick={() => setConfirm(null)}
                                >
                                  Keep my place
                                </button>
                              </div>
                            ) : (
                              <button
                                className="text-btn cancel"
                                disabled={!!pending}
                                onClick={() => setConfirm(b.id)}
                              >
                                {b.status === "waitlisted"
                                  ? "Leave waitlist"
                                  : "Cancel booking"}{" "}
                                <span aria-hidden="true">↗</span>
                              </button>
                            ))}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {route === "admin" && user.role === "admin" && (
              <>
                <div className="admin-grid">
                  <section className="panel">
                    <span className="eyebrow">01 / MAKE SPACE</span>
                    <h2>Create a session</h2>
                    <p className="muted">
                      One hour. Twenty mats. A fresh start.
                    </p>
                    <form onSubmit={createSession} noValidate>
                      <Field
                        label="Session name"
                        name="title"
                        defaultValue="Open practice"
                        maxLength={48}
                        error={fields.title}
                      />
                      <div className="form-row">
                        <Field
                          label="Date (IST)"
                          name="date"
                          type="date"
                          defaultValue={dateKey(Date.now() + 86400000)}
                          error={fields.date}
                        />
                        <label className="field" htmlFor="hour">
                          <span>Start hour (IST)</span>
                          <select id="hour" name="hour" defaultValue="9">
                            {Array.from({ length: 24 }, (_, h) => (
                              <option key={h} value={h}>
                                {String(h).padStart(2, "0")}:00
                              </option>
                            ))}
                          </select>
                          {fields.hour && (
                            <small className="field-error">{fields.hour}</small>
                          )}
                        </label>
                      </div>
                      <button
                        className="button primary full"
                        disabled={!!pending}
                      >
                        {pending === "create" ? "Creating…" : "Create session"}
                        <Arrow />
                      </button>
                    </form>
                  </section>
                  <section className="panel checkin-panel">
                    <span className="eyebrow">02 / WELCOME IN</span>
                    <h2>
                      A familiar face.
                      <br />
                      <em>A simple check-in.</em>
                    </h2>
                    <p className="muted">
                      Enter the member’s code during their session. Each code
                      works once.
                    </p>
                    <form onSubmit={checkIn} noValidate>
                      <Field
                        label="Booking code"
                        name="code"
                        className="code-input"
                        placeholder="ABCDEFG2"
                        autoComplete="off"
                        maxLength={8}
                        error={fields.code}
                      />
                      <button
                        className="button primary full"
                        disabled={!!pending}
                      >
                        {pending === "checkin"
                          ? "Checking…"
                          : "Check in member"}
                        <Arrow />
                      </button>
                    </form>
                    <div className="desk-symbol" aria-hidden="true">
                      ✳
                    </div>
                  </section>
                </div>
                <section className="roster panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">
                        03 / THE PEOPLE IN THE ROOM
                      </span>
                      <h2>Session register</h2>
                    </div>
                    <label
                      className="field roster-select"
                      htmlFor="roster-session"
                    >
                      <span>Choose a session</span>
                      <select
                        id="roster-session"
                        value={staffSession}
                        disabled={loading}
                        onChange={(e) => setStaffSession(e.target.value)}
                      >
                        <option value="">
                          {loading ? "Loading sessions…" : "Select session"}
                        </option>
                        {sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {day(s.start)} · {time(s.start)} · {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="date-control">
                    <label htmlFor="admin-date">Schedule date</label>
                    <input
                      id="admin-date"
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value || dateKey());
                        setAllDates(false);
                        setStaffSession("");
                        setRoster([]);
                      }}
                    />
                    <button
                      className="text-btn"
                      onClick={() => setAllDates(!allDates)}
                    >
                      {allDates ? "Selected day" : "All upcoming"}
                    </button>
                  </div>
                  {rosterError && (
                    <p className="alert error" role="alert">
                      {rosterError}
                      <button className="text-btn" onClick={() => loadRoster()}>
                        Retry
                      </button>
                    </p>
                  )}
                  {rosterLoading ? (
                    <div className="loading" role="status">
                      Opening the register…
                    </div>
                  ) : !staffSession ? (
                    <Empty title="Choose an hour.">
                      Select a session to see its members and attendance.
                    </Empty>
                  ) : roster.length === 0 ? (
                    <Empty title="The room is ready.">
                      No bookings for this session yet.
                    </Empty>
                  ) : (
                    <div className="roster-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Status</th>
                            <th>Code</th>
                            <th>Attendance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roster.map((b) => (
                            <tr key={b.id}>
                              <td>
                                <strong>{b.name}</strong>
                                <small>{b.email}</small>
                              </td>
                              <td>{b.status}</td>
                              <td className="mono">
                                {b.status === "confirmed" ? b.code : "—"}
                              </td>
                              <td>{b.checked_in_at ? "Present" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </main>
      <footer>
        <a
          className="brand footer-brand"
          href={auth ? "#/login" : "#/sessions"}
        >
          still.
        </a>
        <span>A little movement. A little more you.</span>
        <span>Made for a slower, stronger rhythm.</span>
      </footer>
    </div>
  );
}
