"use client";
import { AppHeader } from "./components/AppHeader";
import { AuthView } from "./components/AuthView";
import { Mark } from "./components/ui";
import { Workspace } from "./components/Workspace";
import { useGym } from "./hooks/use-gym";
export default function Gym() {
  const model = useGym();
  const { ready, user } = model;
  if (!ready)
    return (
      <div className="boot" role="status">
        <Mark /> Opening the studio…
      </div>
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
      <AppHeader {...model} />
      <main id="main" tabIndex={-1}>
        {auth ? <AuthView {...model} /> : <Workspace {...model} />}
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
