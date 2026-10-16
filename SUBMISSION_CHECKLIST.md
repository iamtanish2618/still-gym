# BYTE submission review — 16 October 2026

Sources rechecked: [task page](https://bytesoc.dev/tasks/web-dev/) and [complete Gym Slot Booking brief](https://bytesoc.dev/tasks/web-task.pdf). The page lists the deadline as **16 October, 11:59 PM IST** and links to [the submission portal](https://submissions.bytesoc.dev/).

## Links to submit

- Task 1 public fork: https://github.com/iamtanish2618/canteen-chaos — includes `LOG.md`, fixes and regression tests.
- Task 2 public repository: https://github.com/iamtanish2618/still-gym.
- Task 2 live frontend and API: https://still-gym.vercel.app.

## Task 1

- Original fork lineage and incremental debugging commits are retained.
- `LOG.md` records all ten reported issues with reproduction, root cause, fix and verification; two additional bugs and remaining architectural limitations are explained.
- Rule/HTTP tests cover the server fixes; browser regressions cover the interface bugs and responsive behavior.
- Test fixtures do not overwrite the app's JSON data. The inherited single-process JSON architecture is documented honestly; it is not represented as the gym's backend.

## Task 2

| Brief requirement                                                             | Evidence                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Real frontend, backend and related database tables                            | Live Next.js app/API; Turso primary; `db/schema.ts` and `drizzle/`.                                |
| README design note at most ten lines                                          | Eight numbered stack/data-model lines in README.                                                   |
| Setup, assumptions and admin/member test credentials                          | README quick start, assumptions and optional local reviewer dataset.                               |
| Admin, members and sessions across days including one full session            | Explicit local fixture and credentials; production uses real self-created accounts/staff sessions. |
| Registration/login; hashed passwords; trusted admin creation                  | Auth handlers, hashing utility, trusted admin CLI; cookie/token and privilege tests.               |
| Hourly sessions, fixed 20 capacity, unique starts, date filter                | Session handler, constraints, validation and browser filter tests.                                 |
| Never overbook; one active booking; cancel/rebook; ownership                  | Atomic SQL guards/partial unique index; multi-connection and real HTTP races.                      |
| Full-only FIFO waitlist, visible position, departure and no late promotion    | Cancellation trigger, execution-time invariant tests, live browser promotion.                      |
| Unpredictable server code, one-time staff check-in only during the hour       | Random code generation, unique index, conditional UPDATE and concurrent replay tests.              |
| Consistent statuses/errors; middleware, roles and ownership                   | API dispatcher, HTTP helpers, authenticated handlers and contract/security tests.                  |
| Protected routes, four application views and inline validation                | Focused components/hooks; browser role/form tests.                                                 |
| Loading/error/empty/success, pending buttons, optimistic rollback and polling | Browser state and network-failure suites.                                                          |
| 360px, keyboard controls, labelled fields and textual errors                  | Browser checks, accessibility lint rules and automated WCAG A/AA scans.                            |
| Persistent records after refresh/logout/fresh login                           | SQL reopen tests and fresh-browser-context tests.                                                  |
| Meaningful commits; no secrets; environment example                           | Owner-authored incremental commits, ignored private files and `.env.example`.                      |
| Modular code and reproducible verification                                    | Focused modules, 300-line source/test guard, `tests/`, lint/type/format checks and full CI.        |

The public admin/member credentials are **for a separate local reviewer database**. Publishing the real production admin password would allow anyone to edit the user's sessions, so it is not included. Reviewers can run the documented fixture to inspect staff behavior safely and can create their own member account on the live site. If a coordinator specifically requires live staff access, arrange private access to a separate reviewer environment before sharing credentials; do not publish the owner's password.

## Candidate review

The page prohibits AI by default. The candidate stated that the society granted permission for AI assistance; the README discloses that assistance. This is not an independent confirmation from the society. The candidate must still be able to explain and modify the submitted code during the live walkthrough. Read `ARCHITECTURE.md` and practise the booking/cancellation/check-in paths.

A final portal submission has not been made automatically. Open the portal, select the requested task fields, enter the links above and review the form before submitting. Automated tests establish the exercised behavior, not a guarantee of unlimited scale or zero possible defects.
