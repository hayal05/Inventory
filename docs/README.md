# Inventory Management System: Project Pack

Light, simple inventory management for pharmacies, retailers, and wholesalers.
Runs on free tiers: **Render + Neon + Cloudinary + an uptime bot**.

## Files in this pack
| File | What it covers |
|---|---|
| `README.md` | This index and the quick summary |
| `tasks.md` | The 69-task build checklist, by phase |
| `project-status.md` | Live progress, decisions, open questions, risks |
| `tech-stack.md` | Chosen technologies, libraries, and why |
| `architecture.md` | Folder structure, database schema, ledger and FEFO rules, API endpoints, roles |
| `deployment.md` | Render, Neon, Cloudinary, and uptime bot setup, env vars, backups |
| `ui-guide.md` | Design direction taken from the reference, screens, and components |

## Quick summary
- **Stack:** Node.js (Express) + React (Vite PWA) + Neon Postgres + Cloudinary
- **Hosting:** one Render free web service serves both the API and the built React app
- **Core idea:** stock is an append-only ledger; current stock is the sum of movements
- **Multi-tenant:** every table has `org_id`, every query filters on it
- **Pharmacy support:** optional batch and expiry tracking per product, FEFO issuing
- **Keep-alive:** uptime bot pings `/health`, which never touches the database

## Suggested reading order
1. `tech-stack.md`
2. `architecture.md`
3. `tasks.md` (start at task 1)
4. `deployment.md` (when you reach Phase 11)
5. Update `project-status.md` after each work session

## Ground rules
1. Never edit a stock quantity directly; write a ledger row.
2. Corrections are reversing entries, never edits or deletes.
3. Always filter by `org_id`.
4. No secrets in git. The Cloudinary API secret and JWT secret live in environment variables only.
5. Never write uploads to Render's disk.
6. Commit after every task.
