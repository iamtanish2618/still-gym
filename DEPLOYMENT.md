# Deployment status

The application runs locally and both repositories are public. **The optional Sites deployment did not succeed; there is no verified hosted demo.**

The hosting migration runner returned `incomplete input: SQLITE_ERROR` while applying the initial migration containing SQLite triggers. The exact migration passes locally through Wrangler D1 and through the API regression database. Formatting complete SQL statements onto individual lines did not resolve the host error. The hosting parser is the suspected cause, not a confirmed diagnosis. No capacity or waitlist guarantees were removed to work around it.

The failed deployment has no active database binding exposed by the Sites database viewer. No hosted seed was run, and the temporary setup secret was removed.

Diagnostic identifiers:
- Site: `appgprj_6ad0ff152aa08191ac1a32fa96355747`
- Saved version: `appgprj_6ad0ff152aa08191ac1a32fa96355747~appgver_f98621a90d2481918f83d7a95a2da77d`
- Deployment: `appgdep_6ad106934f4081918f5766b8a2566ecf`
- Source: `c1c282753494720a1de5af2b0ebbafeb9d37e862`

Use the reproducible local setup in README.md. The full brief makes deployment optional. A direct Workers/D1 deployment would need the migrations applied through a runner that preserves complete `CREATE TRIGGER ... END` statements, a D1 binding named `DB`, and seed data in an empty database. A static host alone cannot run the API.
