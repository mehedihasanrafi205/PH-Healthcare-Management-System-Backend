# 🏥 PH Healthcare Management System — Backend

A production-grade REST API for a doctor-appointment platform. Patients register, verify their email with an OTP (or sign in with Google), browse doctors, and book & pay for online consultations slot-by-slot via **bKash**. Doctors apply with credentials + resume, manage publishable schedules, run appointments, and e-mail **PDF prescriptions**. Admins approve/reject doctor applications and view aggregate platform analytics.

> **Note:** This repository contains the **backend only**. It pairs with a separate frontend client (see `FRONTEND_URL`).

---

## ✨ Badges

| Category | Badge |
| -------- | ----- |
| Runtime | ![Node](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white) |
| Framework | ![Express](https://img.shields.io/badge/Express-5.2.1-000000?logo=express&logoColor=white) |
| Language | ![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white) |
| ORM | ![Prisma](https://img.shields.io/badge/Prisma-7.9.1-2D3748?logo=prisma&logoColor=white) |
| Database | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white) |
| Cache | ![Redis](https://img.shields.io/badge/Redis-6.2.1-DC382D?logo=redis&logoColor=white) |
| Auth | ![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtoken) |
| Validation | ![Zod](https://img.shields.io/badge/Validation-Zod-3E67B1?logo=zod) |
| Payments | ![bKash](https://img.shields.io/badge/Payments-bKash-E2136E) |
| PDF | ![PDFKit](https://img.shields.io/badge/PDF-PDFKit-EC1C24) |
| Email | ![Nodemailer](https://img.shields.io/badge/Email-Nodemailer-1B75BC) |
| Uploads | ![Cloudinary](https://img.shields.io/badge/Uploads-Cloudinary-3448C5) |
| Lint/Format | ![Biome](https://img.shields.io/badge/Lint%2FFormat-Biome-60A5FA) |

---

## 📚 Table of Contents

- [✨ Badges](#-badges)
- [🚀 Core Features](#-core-features)
- [🧰 Tech Stack & Libraries](#-tech-stack--libraries)
- [🗄️ Database Schema & Models](#️-database-schema--models)
- [📁 Project Folder Structure](#-project-folder-structure)
- [🔐 Environment Variables](#-environment-variables)
- [⚙️ Getting Started & Setup](#️-getting-started--setup)
- [🔌 API Endpoint Reference](#-api-endpoint-reference)
- [🛡️ Error Handling & Standards](#️-error-handling--standards)
- [🤝 Contributing](#-contributing)
- [📝 License](#-license)

---

## 🚀 Core Features

Derived from a full scan of the source under `src/app/module/`.

### 1. Authentication & RBAC (`auth`)
- **Patient registration** with email → 6-digit OTP, stored in **Redis** (5-min TTL), delivered via **Nodemailer** + an EJS template.
- **Email verification** completes the user + patient row in one nested Prisma create.
- **Credentials login**, **Google OAuth login** (Google ID token verified via `google-auth-library`), silent **account merge** when a Google user already exists as a credential user, and **refresh-token rotation**.
- **Password recovery**: forgot-password OTP (Redis, 5-min TTL) → reset password → confirmation email.
- **Role-based access control (RBAC)** through the `auth(...roles)` guard covering `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT`. Blocks BLOCKED accounts and checks the user against the DB on every request.
- Access & refresh JWTs issued and re-issued with configurable expiry, delivered as httpOnly cookies **and** in the response body.

### 2. User Profile (`user`)
- **Profile image upload** via Multer (memory storage) → **Cloudinary** upload → stores `imageUrl`/`imagePublicId` and deletes the previous image.

### 3. Doctor Applications & Onboarding (`doctor`)
- **Apply as doctor** with multipart fields including a **resume** (1) and **additional files** (up to 10), uploaded to Cloudinary; random temporary password issued.
- **Email verification** gate before an application can be **approved/rejected**.
- Admin/`SUPER_ADMIN` **approval workflow** (`APPROVED` / `REJECTED` with required rejection reason), recording `reviewedBy` / `reviewedAt`, and e-mailing approved/rejected templates.
- **Self-profile update** (address, bio, consultation fee, contact number).
- **Public doctor catalog + single doctor profile** (only `APPROVED`, non-deleted doctors) with future published schedules.
- **Today's available doctors** — approved doctors with a PUBLISHED schedule today having `availableSlots > 0`.
- **Cron job** (`node-cron`, every 10 min): auto-deletes doctor applications older than 1 hour whose email was never verified (`deleteUnverifiedDoctors`).

### 4. Schedule Management (`schedule`)
- Doctors **create schedules**; system auto-computes slot count at **20 minutes per slot** and forbids two schedules on the same day.
- **Publish / update / soft-delete** schedules (published schedules with booked slots become immutable).
- **Query today's schedules**, a doctor's own schedules (with appointments + patients), and all schedules (admin).

### 5. Appointment Transactions (`appointment`)
- Patients **book an appointment** against a published, same-day, not-yet-started schedule — full business-rule validation inside a **Prisma transaction** (no double booking / no double pending-pay).
- **bKash payment init** on booking, backed by the `Payment` model and a `merchantInvoiceNumber` mapping to the appointment ID.
- **bKash callback** (`/book-appointment/payment/callback`) handles `success` / `failure` / `cancel`:
  - On success it **executes** the payment, decrements `availableSlots`, assigns a **serial number** and computed **joining time** (20-min stagger), marks the payment `PAID`, and e-mails a **PDFKit invoice** attachment.
- **Cancel & refund** — auto-refund via bKash when cancelled > 1 hour before the schedule start; slot is restored and payment marked `REFUNDED`.
- Doctors **advance status** only along `CONFIRMED → ONGOING → COMPLETED`.
- Per-role appointment listing (patient / doctor / admin) and ownership-checked single appointment.

### 6. Payment Records (`payment`)
- Patient payment history, admin overview with aggregation, and single payment detail with **ownership enforcement** for patients.

### 7. Prescriptions (`prescription`)
- Doctors write a prescription (findings + medication list) **only for COMPLETED appointments**.
- A **PDFKit** prescription PDF is generated, uploaded to Cloudinary, and e-mailed to the patient; the URL is stored on the appointment.

### 8. Analytics & Prisma Aggregations (`analytics`)
- **Admin analytics**: doctor counts by verification status, patient/appointment counts, total revenue & refunds via `prisma.payment.aggregate({ _sum })`.
- **Patient analytics**: appointment counts by status + total spent / refunded.
- **Doctor analytics**: schedule & appointment counts + total earnings minus refunds.

### 9. Public APIs
- Health check (`GET /` & `GET /test`), today's schedules, today's available doctors, and the public doctor catalog — no auth required.

---

## 🧰 Tech Stack & Libraries

### Core Runtime
| Package | Version | Purpose |
| ------- | ------- | ------- |
| `express` | ^5.2.1 | HTTP framework |
| `typescript` | ^7.0.2 | Static typing |
| `tsx` | ^4.23.1 | Dev runner / watch |
| `dotenv` | ^17.4.2 | Env loading |
| `cors` | ^2.8.6 | CORS handling |
| `cookie-parser` | ^1.4.7 | Cookie parsing |
| `http-status` | ^2.1.0 | HTTP status codes |

### Data, Caching & ORM
| Package | Version | Purpose |
| ------- | ------- | ------- |
| `@prisma/client` + `prisma` | ^7.9.1 | Prisma ORM |
| `@prisma/adapter-pg` | ^7.9.1 | Prisma Pg driver adapter |
| `pg` | ^8.22.0 | PostgreSQL driver |
| `redis` | ^6.2.1 | OTP & bKash token caching |

### Auth & Validation
| Package | Version | Purpose |
| ------- | ------- | ------- |
| `jsonwebtoken` | ^9.0.3 | JWT sign/verify |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `google-auth-library` | ^11.0.0 | Google ID token verification |
| `zod` | ^4.4.3 | Schema validation (`z.email()`, `z.coerce.date()`, …) |

### Payments, Files & Email
| Package | Version | Purpose |
| ------- | ------- | ------- |
| `cloudinary` | ^2.10.0 | Media upload (profile, resume, PDFs) |
| `multer` | ^2.2.0 | Multipart file parsing |
| `nodemailer` | ^9.0.5 | SMTP email transport |
| `ejs` | ^6.0.1 | Email template rendering |
| `pdfkit` | ^0.20.1 | Invoice & prescription PDF generation |
| `node-cron` | ^4.6.0 | Scheduled jobs |
| `date-fns` | ^4.4.0 | Date math (slots, joining time, refund cutoff) |

### Tooling (dev)
| Package | Version | Purpose |
| ------- | ------- | ------- |
| `@biomejs/biome` | 2.5.7 | Linter + formatter |
| `@types/*` | — | TS type definitions |

---

## 🗄️ Database Schema & Models

Prisma splits the schema across multiple files under `prisma/schema/`. The `Prescription` is **not a separate table** — prescription data is stored on the `Appointment` model (`prescriptionUrl` / `prescriptionPublicId`) with the PDF generated at runtime.

```
User ──┬── Patient ──┬── Appointment ──┬── Payment
  │    └── Doctor ──┬── Schedule ──────┘
  │                 └── Appointment ────┘
  └── (1-to-1 doctor/patient)
```

### Model: `User` — table `users`
| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `String` @id @default(uuid()) | |
| `name` | `String` | |
| `email` | `String` | `@@unique([email])` |
| `password` | `String?` | `null` for Google-only users |
| `googleId` | `String?` @unique | |
| `authProvider` | `AuthProvider` @default(CREDENTIAL) | `GOOGLE` / `CREDENTIAL` |
| `emailVerified` | `Boolean` @default(false) | |
| `role` | `Role` @default(PATIENT) | |
| `status` | `UserStatus` @default(ACTIVE) | |
| `needPasswordChange` | `Boolean` @default(false) | |
| `imageUrl` | `String` @default("") | |
| `imagePublicId` | `String` @default("") | |
| `isDeleted` | `Boolean` @default(false) | soft delete |
| `deletedAt` | `DateTime?` | |
| `createdAt` / `updatedAt` | timestamps | |

### Model: `Doctor` — table `doctor`
| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `String` @id @default(uuid()) | |
| `name` / `email` | `String` | indexed (`idx_doctor_email`) |
| `address` | `String?` | |
| `specialization` | `String` | |
| `licenseNumber` | `String` @unique | |
| `qualifications` | `String` | |
| `experienceYears` | `Int` | |
| `bio` | `String?` | |
| `consultationFee` | `Decimal?` @db.Decimal(10, 2) | |
| `contactNumber` | `String?` | |
| `verificationStatus` | `DoctorVerificationStatus` @default(PENDING) | |
| `rejectionReason` | `String?` | |
| `reviewedBy` / `reviewedAt` | `String?` / `DateTime?` | |
| `resume` / `resumePublicId` | `String?` | Cloudinary |
| `additionalFiles` | `Json?` | uploaded files array |
| `isDeleted` / `deletedAt` | soft delete | |
| `userId` | `String` @unique | FK → `User` (Cascade) |
| `schedules` / `appointments` | relations | |

### Model: `Patient` — table `patients`
| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `String` @id @default(uuid(7)) | |
| `name` | `String` | |
| `email` | `String` @unique | indexed |
| `contactNumber` / `address` | `String?` | |
| `isDeleted` / `deletedAt` | soft delete | indexed |
| `userId` | `String` @unique | FK → `User` (Cascade) |
| `appointments` | relation | |

### Model: `Schedule` — table `schedules`
| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `String` @id @default(uuid()) | |
| `startDateTime` / `endDateTime` | `DateTime` | |
| `totalSlots` / `availableSlots` | `Int` | `totalSlots = floor(duration / 20 min)` |
| `meetingLink` | `String` | |
| `status` | `ScheduleStatus` @default(DRAFT) | |
| `isDeleted` / `deletedAt` | soft delete | |
| `doctorId` | `String` | FK → `Doctor` |
| `appointments` | relation | |
| unique | | `unique_schedule([doctorId, startDateTime, endDateTime])` |

### Model: `Appointment` — table `appointments`
| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `String` @id @default(uuid()) | also the bKash `merchantInvoiceNumber` |
| `status` | `AppointmentStatus` @default(PENDING) | |
| `joiningTime` | `DateTime?` | computed = start + (serial-1)*20 min |
| `serialNumber` | `Int?` | assigned on payment success |
| `recordUrl` / `recordPublicId` | `String?` | |
| `prescriptionUrl` / `prescriptionPublicId` | `String?` | PDF hosted on Cloudinary |
| `patientId`, `doctorId`, `scheduleId` | FK (Cascade) | |
| `payment` | `Payment?` | 1-to-1 |
| unique | | `unique_appointment([patientId, doctorId, scheduleId])`, `unique_appointment_serial_number` |

### Model: `Payment` — table `payments`
| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `String` @id @default(uuid()) | |
| `status` | `PaymentStatus` @default(UNPAID) | |
| `amount` / `currency` | `Decimal(10,2)` / `String` default `BDT` | |
| `paymentGateway` | `String` default `bkash` | |
| `merchantInvoiceNumber` | `String` @unique | the Appointment ID |
| `bkashPaymentId` / `bkashTrxId` | `String?` @unique / `String?` | |
| `payerReference` | `String?` | user email/phone |
| `paidAt` | `String?` | |
| `gatewayResponse` | `Json?` | raw bKash payload |
| `refundTrxId` / `refundAmount` / `refundReason` / `refundedAt` | refund fields | |
| `appointmentId` | `String` @unique | FK → `Appointment` (Cascade) |

### Enums (`enums.prisma`)
| Enum | Values |
| ---- | ------ |
| `Role` | `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `PATIENT` |
| `UserStatus` | `ACTIVE`, `BLOCKED`, `DELETED` |
| `Gender` | `MALE`, `FEMALE`, `OTHER` |
| `AuthProvider` | `GOOGLE`, `CREDENTIAL` |
| `AppointmentStatus` | `PENDING`, `CONFIRMED`, `CANCELLED`, `ONGOING`, `COMPLETED` |
| `PaymentStatus` | `UNPAID`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` |
| `DoctorVerificationStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `ScheduleStatus` | `DRAFT`, `PUBLISHED` |

---

## 📁 Project Folder Structure

```
PH Healthcare Management System Backend/
├── prisma/
│   ├── config.ts                        # Prisma config: schema dir, migrations path, DATABASE_URL
│   ├── schema/                          # multi-file Prisma schema
│   │   ├── schema.prisma                # generator + PostgreSQL datasource
│   │   ├── enums.prisma                 # Role, UserStatus, Gender, AuthProvider, AppointmentStatus, ...
│   │   ├── user.prisma
│   │   ├── doctor.prisma
│   │   ├── patient.prisma
│   │   ├── schedule.prisma
│   │   ├── appointment.prisma
│   │   └── payment.prisma
│   └── migrations/                      # committed SQL migrations
├── src/
│   ├── server.ts                        # bootstrap: DB/Redis/Nodemailer connect, seed, cron, listen
│   ├── app.ts                           # express app: CORS, parsers, route mounting, error handlers
│   ├── generated/prisma/                # prisma client (generated — git-ignored)
│   └── app/
│       ├── config/index.ts              # reads/exposes all process.env values
│       ├── interfaces/index.ts          # IQuery (pagination/filter) type
│       ├── lib/
│       │   ├── prisma.ts                # shared PrismaClient (Pg adapter)
│       │   ├── redis.ts                 # Redis client
│       │   ├── nodemailer.ts            # SMTP transport
│       │   ├── multer.ts                # memory storage uploader
│       │   ├── googleAuth.ts            # OAuth2Client
│       │   ├── cloudinary.ts            # Cloudinary config
│       │   ├── bkash.ts                 # bKash token grant/refresh (Redis-cached)
│       │   └── corn.ts                  # cron job: delete unverified doctor apps
│       ├── middleware/
│       │   ├── checkAuth.ts             # auth(...roles) JWT + role guard
│       │   ├── validateRequest.ts       # zod schema middleware
│       │   ├── globalErrorHandler.ts    # centralized error → JSON
│       │   └── notFound.ts              # 404 handler
│       ├── utils/
│       │   ├── AppError.ts              # error class with statusCode
│       │   ├── catchAsync.ts            # async handler wrapper
│       │   ├── jwt.ts                   # token sign/verify
│       │   ├── sendResponse.ts          # standard response envelope
│       │   └── seed.ts                  # seedSuperAdmin / seedTesterAdmin / seedTesterDoctor
│       ├── templates/                   # EJS email templates
│       │   ├── appointment-invoice.ejs
│       │   ├── registration-user-otp.ejs
│       │   ├── patient-welcome-email.ejs
│       │   ├── forgot-password.ejs
│       │   ├── reset-password-success.ejs
│       │   ├── doctor-application-approved.ejs
│       │   ├── doctor-application-rejected.ejs
│       │   └── prescription-notification.ejs
│       └── module/                      # one folder per feature
│           ├── auth/                    # route, controller, service, interface, validation
│           ├── user/
│           ├── doctor/                  # + doctor.interface.ts
│           ├── schedule/
│           ├── appointment/
│           ├── payment/
│           ├── prescription/
│           └── analytics/
├── .env / .env.example
├── biome.json                           # Biome lint & format config
├── tsconfig.json
└── package.json
```

---

## 🔐 Environment Variables

All environment variables are read centrally in `src/app/config/index.ts`. Copy `.env.example` to `.env` and fill in real values.

```dotenv
# ---- App ----
NODE_ENV=development                 # "development" shows full error/stack in responses
PORT=5000
APP_URL=http://localhost:5000        # API base URL (referenced by bkash callback)
FRONTEND_URL=http://localhost:3000   # allowed CORS origin

# ---- Database (Prisma + Postgres) ----
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ph_healthcare?schema=public"

# ---- JWT ----
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# ---- Password hashing ----
BCRYPT_SALT_ROUNDS=10

# ---- Google OAuth ----
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

# ---- Auto-seeded accounts (created at server start) ----
SUPER_ADMIN_NAME=Super Admin
SUPER_ADMIN_EMAIL=superadmin@phhealth.com
SUPER_ADMIN_PASSWORD=Super@12345
TESTER_ADMIN_NAME=Tester Admin
TESTER_ADMIN_EMAIL=testeradmin@phhealth.com
TESTER_ADMIN_PASSWORD=Tester@12345
TESTER_DOCTOR_NAME=Tester Doctor
TESTER_DOCTOR_EMAIL=testerdoctor@phhealth.com
TESTER_DOCTOR_PASSWORD=Tester@12345

# ---- Redis (OTP + bKash tokens) ----
REDIS_USER=default
REDIS_PASSWORD=
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# ---- SMTP (Gmail app password) ----
EMAIL_SENDER=PH Healthcare <your@email.com>
SMTP_USER=your@email.com
SMTP_PASSWORD=your_gmail_app_password

# ---- Cloudinary ----
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ---- bKash (Tokenized Checkout) ----
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_USERNAME=your_bkash_username
BKASH_PASSWORD=your_bkash_password
BKASH_APP_KEY=your_bkash_app_key
BKASH_APP_SECRET=your_bkash_app_secret
BKASH_CALLBACK_URL=http://localhost:5000/api/v1
```

> ⚠️ **Never commit your real `.env`.** Treat every value above as a dummy placeholder.

---

## ⚙️ Getting Started & Setup

### Prerequisites
- **Node.js** 20+ (`node -v`)
- **PostgreSQL** 14+ (`psql -V`)
- **Redis** (for OTP & bKash token storage). Use a local server or **Redis Cloud** — set `REDIS_*` accordingly.

Any package manager works (examples use `npm`).

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least: `DATABASE_URL`, JWT secrets, `REDIS_*`, `SMTP_*`, `CLOUDINARY_*`, and `BKASH_*`. The official bKash **sandbox** base URL is `https://tokenized.sandbox.bka.sh/v1.2.0-beta`.

### 3. Generate the Prisma client

```bash
npx prisma generate
```

This writes the typed client to `src/generated/prisma` (git-ignored). **Every file under `src/` imports it — re-run after any change under `prisma/schema/`.**

### 4. Run migrations

```bash
npx prisma migrate dev
```

Creates the tables from the SQL already committed under `prisma/migrations/`.

### 5. Start in development

```bash
npm run dev
```

On boot the server:
1. Connects to PostgreSQL, Redis, and verifies the SMTP transport.
2. Auto-seeds **Super Admin**, **Tester Admin**, and **Tester Doctor** from your env (skipped if they already exist).
3. Starts a `node-cron` job that deletes unverified doctor applications older than an hour.

You should see `Server is running on port 5000`.

### Production build & run

```bash
npm run build   # typecheck + emit to dist/
npm run start   # run the compiled server (node dist/src/server.js)
```

### Useful scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Run with hot-reload (`tsx watch src/server.ts`) |
| `npm run build` | Type-check & compile to `dist/` |
| `npm run start` | Run the compiled output |
| `npm run lint:check` / `lint:fix` | Biome lint |
| `npm run format:check` / `format:fix` | Biome format |
| `npx prisma studio` | Open a browser GUI at `http://localhost:5555` |
| `npx prisma migrate dev` | Create & apply a migration |

> **Seeding note:** Unlike the classic `prisma db seed`, seeding here is **automatic** — `server.ts` calls `seedSuperAdmin()`, `seedTesterAdmin()`, and `seedTesterDoctor()` from `src/app/utils/seed.ts` on every startup.

---

## 🔌 API Endpoint Reference

All feature routes are mounted under `/api/v1` in `src/app.ts`. Base URL: `http://localhost:5000/api/v1`.

**Access legend:** `🟢 Public` · `🔵 Patient` · `🟠 Doctor` · `🟣 Admin/SUPER_ADMIN` · `🟤 Any authed`

### Auth — `/auth`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `POST` | `/register` | 🟢 | Register patient, sends OTP |
| `POST` | `/verify-email` | 🟢 | Verify OTP → creates account + tokens |
| `POST` | `/login` | 🟢 | Credentials login → tokens |
| `POST` | `/google` | 🟢 | Google ID token login/register |
| `GET` | `/me` | 🟤 | Current user profile (incl. patient) |
| `POST` | `/refresh-token` | 🟢 | Rotate access + refresh tokens |
| `POST` | `/forgot-password` | 🟢 | Send password-reset OTP |
| `POST` | `/reset-password` | 🟢 | Reset password with OTP |

### User — `/user`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `PATCH` | `/profile-image` | 🟤 | Upload profile image (multipart `profileImage`) |

### Doctor — `/doctor`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `POST` | `/apply-as-doctor` | 🟢 | Apply with `resume` + `additionalFiles` + JSON `data` |
| `POST` | `/apply-as-doctor/verify-email` | 🟢 | Verify doctor application OTP |
| `POST` | `/approve-doctor` | 🟣 | Approve / reject (requires `rejectionReason` if rejected) |
| `GET` | `/all-doctors` | 🟣 | Paginated admin doctor list (filters) |
| `PATCH` | `/update-my-profile` | 🟠 | Update own address/bio/fee/contact |
| `GET` | `/available-doctors/todays-schedule` | 🟢 | Approved doctors with today's open schedules |
| `GET` | `/public/all-doctors` | 🟢 | Public approved-doctor catalog |
| `GET` | `/public/:doctorId` | 🟢 | Single public doctor profile (with upcoming schedules) |

### Schedule — `/schedule`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `POST` | `/create-schedule` | 🟠 | Create schedule (auto slot compute, 20-min slots) |
| `GET` | `/my-schedules` | 🟠 | Own schedules with appointments |
| `GET` | `/all-schedules` | 🟣 | All schedules (filter by doctor/status) |
| `GET` | `/todays-schedule` | 🟢 | Today's PUBLISHED schedules (`?doctorId=` required) |
| `PATCH` | `/update-schedule/:scheduleId` | 🟠 | Update (blocked once booked) |
| `PATCH` | `/publish-schedule/:scheduleId` | 🟠 | Publish schedule |
| `GET` | `/:scheduleId` | 🟠🟣 | Single schedule detail |
| `DELETE` | `/:scheduleId` | 🟠 | Soft-delete schedule |

### Appointment — `/appointment`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `POST` | `/book-appointment` | 🔵 | Book + initiate bKash payment (returns `paymentUrl`) |
| `POST` | `/pay-appointment` | 🔵 | Pay a pending appointment |
| `GET` | `/book-appointment/payment/callback` | 🟢 | **bKash callback** — redirects to frontend |
| `POST` | `/cancel-appointment` | 🔵🟣 | Cancel + auto refund if eligible |
| `PATCH` | `/update-status/:appointmentId` | 🟠 | Advance `CONFIRMED → ONGOING → COMPLETED` |
| `GET` | `/my-appointments` | 🔵 | Own appointment history |
| `GET` | `/doctor-appointments` | 🟠 | Doctor's appointments |
| `GET` | `/all-appointments` | 🟣 | All appointments (extensive filters) |
| `GET` | `/:appointmentId` | 🟤 | Single appointment (ownership enforced) |

### Payment — `/payment`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `GET` | `/my-payments` | 🔵 | Patient's payments |
| `GET` | `/all-payments` | 🟣 | All payments (`?patientEmail=`) |
| `GET` | `/:paymentId` | 🔵🟣 | Single payment (ownership enforced) |

### Prescription — `/prescription`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `POST` | `/create-prescription` | 🟠 | Generate PDF + email (COMPLETED appointments only) |
| `GET` | `/:appointmentId` | 🟤 | Fetch prescription URL for an appointment |

### Analytics — `/analytics`
| Method | Path | Access | Description |
| ------ | ---- | ------ | ----------- |
| `GET` | `/patient-analytics` | 🔵 | Patient's appointment & spend stats |
| `GET` | `/doctor-analytics` | 🟠 | Doctor's schedule/appointment & earnings |
| `GET` | `/admin-analytics` | 🟣 | Platform-wide KPIs & revenue |

### Health — `/` and `/test`
| Method | Path | Access |
| ------ | ---- | ------ |
| `GET` | `/` | 🟢 Health check |
| `GET` | `/test` | 🟢 bKash token smoke test |

### Common query params (lists)
`page`, `limit`, `sortBy`, `sortOrder`, `searchTerm`, plus module-specific filters (`status`, `specialization`, `doctorId`, `email`, …). Responses include a `meta` object: `{ page, limit, total, totalPages }`.

---

## 🛡️ Error Handling & Standards

### Global error middleware
`src/app/middleware/globalErrorHandler.ts` centralizes every thrown error into a single JSON envelope:

```json
{
  "success": false,
  "statusCode": 400,
  "name": "PrismaClientValidationError",
  "message": "You have provided incorrect field type or missing fields",
  "error": {},
  "stack": "…"
}
```

In `development` mode, `name`, `message`, `error`, and `stack` expose full detail; in `production` they are masked.

### `AppError` (`src/app/utils/AppError.ts`)
A first-class error class carrying an HTTP `statusCode`. Services throw it with intent:

```ts
throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
```

### `catchAsync` (`src/app/utils/catchAsync.ts`)
Wraps every async controller so that a rejected promise (or thrown `AppError`) is forwarded to Express's error-handling middleware — no try/catch noise in controllers.

### `validateRequest` + Zod
Every mutating route uses a `validateRequest(zodSchema)` middleware that `safeParse`s `req.body` and throws `AppError(400, <first issue>)` on failure. Note: doctor-application payload validation is performed manually inside the controller (multipart JSON).

### Prisma error mapping
The global handler recognizes Prisma 7 error classes and translates them:
| Prisma code/error | HTTP status | Message |
| ----------------- | ----------- | ------- |
| `PrismaClientValidationError` | 400 | "You have provided incorrect field type or missing fields" |
| `P2002` (unique) | 400 | "Duplicate Key Error" |
| `P2003` (FK) | 400 | "Foreign key constraint failed" |
| `P2025` (not found) | 400 | "…records that were required but not found" |
| `P1000` (auth) | 401 | "Authentication failed against database server…" |
| `P1001` (unreachable) | 400 | "Can't reach database server" |
| `PrismaClientUnknownRequestError` | 500 | "Error occurred during query execution" |

### Common status codes observed
`400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `410 GONE`, `502 BAD_GATEWAY`, `201 CREATED`, `200 OK`.

### Response envelope (`sendResponse`)
All success responses share the shape `{ success, statusCode, message, data, meta? }`.

### Coding conventions
- **Lint/format:** [Biome](https://biomejs.dev/) with tabs, double quotes, and the `recommended` preset (`biome.json`). Run `npm run lint:check` / `npm run format:check`.
- **Modules:** feature-per-folder (`route` / `controller` / `service` / `interface` / `validation`). Controllers never call Prisma directly; services never touch `req`/`res`.
- **Types:** payloads typed via `*/*.interface.ts`; enums imported from `generated/prisma` rather than magic strings.
- **Env access:** always through the central `config` object, never `process.env` in app code.
- **Atomicity:** multi-step business flows (booking, callback, cancel/refund) run inside `prisma.$transaction`.

### Conventional Commits
This project follows **Conventional Commits** (e.g. `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`). A typical message looks like:

```
feat(appointment): add bKash refund flow on appointment cancellation
fix(auth): reject blocked users during login
```

---

## 🤝 Contributing

1. Fork the repo and create a feature branch.
2. Write clear, typed code following the module structure above.
3. Run `npm run format:fix && npm run lint:fix` before committing.
4. Open a pull request with a Conventional Commit message.

## 📝 License

Distributed under the ISC License. See the `package.json` (`"license": "ISC"`) for details.
