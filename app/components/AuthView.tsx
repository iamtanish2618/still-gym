import type { GymModel } from "../hooks/use-gym";
import { Arrow, Field } from "./ui";
type Props = Pick<
  GymModel,
  | "error"
  | "setError"
  | "pending"
  | "fields"
  | "setFields"
  | "authMode"
  | "setAuthMode"
  | "showPassword"
  | "setShowPassword"
  | "signIn"
>;
export function AuthView(model: Props) {
  const {
    error,
    setError,
    pending,
    fields,
    setFields,
    authMode,
    setAuthMode,
    showPassword,
    setShowPassword,
    signIn,
  } = model;
  return (
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
                setShowPassword(false);
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
                setShowPassword(false);
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
                placeholder="Your full name"
                error={fields.name}
              />
            )}
            {authMode === "register" && (
              <Field
                label="Username"
                name="username"
                autoComplete="username"
                placeholder="Choose a unique username"
                maxLength={24}
                error={fields.username}
              />
            )}
            <Field
              label={
                authMode === "register" ? "Email address" : "Email or username"
              }
              name="email"
              type={authMode === "register" ? "email" : "text"}
              autoComplete={authMode === "register" ? "email" : "username"}
              placeholder={
                authMode === "register"
                  ? "you@example.com"
                  : "Your email or username"
              }
              error={fields.email}
            />
            <Field
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                authMode === "login" ? "current-password" : "new-password"
              }
              placeholder="At least 10 characters"
              error={fields.password}
            />
            {authMode === "register" && (
              <Field
                label="Confirm password"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Enter your password again"
                error={fields.confirmPassword}
              />
            )}
            <button
              type="button"
              className="text-btn password-toggle"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Hide password" : "Show password"}
            </button>
            <button
              className="button primary full"
              disabled={!!pending}
              aria-busy={pending === "auth"}
            >
              {pending === "auth"
                ? "Opening your space…"
                : authMode === "login"
                  ? "Enter your space"
                  : "Create your account"}
              {pending === "auth" ? (
                <span className="request-spinner" aria-hidden="true" />
              ) : (
                <Arrow />
              )}
            </button>
          </form>
          <p className="auth-note">
            A mat when you need it.
            <br />A fair place in line when it’s full.
          </p>
        </div>
      </section>
    </div>
  );
}
