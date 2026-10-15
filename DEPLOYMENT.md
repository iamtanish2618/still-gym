# Hosted preview

[Open Still](https://still-gym-tanish-byte.aniketyadav982.chatgpt.site)

The Sites preview is owner-private and may require the connected owner’s ChatGPT sign-in. It is an additional preview, not a publicly accessible recruitment demo. Use the public GitHub repository and local setup in README.md for the submission.

The deployment runs the same API and SQLite schema on Cloudflare Workers and D1. Hosted data is separate from local data. Demo accounts are listed in README.md. One-time database initialization uses a secret setup key, which is removed after seeding. The setup endpoint then returns 404.

To deploy elsewhere, provide a Workers-compatible runtime with a D1 binding named `DB`, apply the SQL in `drizzle/` once, and seed an empty database. A generic static host alone cannot run the API. Never copy local database files or real credentials into Git.
