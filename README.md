# Vendor Management System

A UAE-oriented vendor management platform for event, exhibition, conference, hospitality, and procurement teams. It includes a public website, a super admin and staff CRM, and a vendor portal, backed by PostgreSQL.

The only required environment value is the database connection:

```env
DATABASE_URL="postgresql://vms:vms@localhost:5432/vendor_registration"
```

Company identity, tax, branding, notifications, vendor rules, and feature switches are stored in the database and edited from **System settings**. Do not put those values in `.env`.

## Run locally

1. Start PostgreSQL:

```bash
docker compose up -d
```

2. Install dependencies, create the schema, and load development data:

```bash
npm install
npm run db:setup
```

`db:setup` pushes the Prisma schema and seeds fictitious demo companies. Generated development passwords are written to `seed-credentials.txt`, which is gitignored. You can also pass your own super admin password:

```bash
npx tsx prisma/seed.ts --email you@example.com --password "YourPassword1"
```

3. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If the database has no users yet, open [http://localhost:3000/setup](http://localhost:3000/setup) and create the first super admin. That form is disabled after the first account exists.

## Portals

- Public site: vendor registration, login, and company pages
- Admin CRM: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
- Vendor portal: [http://localhost:3000/login](http://localhost:3000/login)

Demo companies, events, and commercial records are fictitious and marked `isDemo`. They are not real businesses.

## Feature switches

Super Admin can turn modules on or off under **Features**. A disabled module is hidden in navigation and rejected by the API. Settings, users, roles, and audit logs stay available so a switch can be turned back on.

## Scripts

- `npm run dev` — development server
- `npm run build` — generate the Prisma client and build Next.js
- `npm run db:push` — apply the schema
- `npm run db:seed` — load development accounts and demo records
