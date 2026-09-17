# Perfumora — Project Documentation

**Perfumora** is an artisanal, luxury haute-parfumerie digital experience and e-commerce platform. It combines interactive 3D WebGL craftsmanship, procedural Web Audio synthesis, and modern e-commerce checkout with a dedicated back-office administrative portal.

---

## 1. System Architecture

The project is structured as a multi-app repository:

```
perfumora/
├── perfumora/               # Customer-facing storefront (Next.js 16 + React 19)
├── perfumora-admin/         # Administrative back-office portal (Vite + React 19)
└── project.md               # Project technical documentation
```

### High-Level Architecture Flow

```mermaid
graph TD
    A[Customer Browser] -->|Next.js Storefront| B[perfumora (Port 3000)]
    C[Admin / Staff] -->|Vite SPA| D[perfumora-admin (Port 5173)]
    
    B -->|SSR / RPC / RLS| E[(Supabase PostgreSQL)]
    B -->|Transactional Emails| F[Resend API]
    D -->|Auth / CRUD / Storage| E
    
    subgraph Supabase Backend
        E --> G[Auth & Sessions]
        E --> H[Row Level Security / user_roles]
        E --> I[place_order RPC Transaction]
        E --> J[Fragrances, Sizes & Orders Tables]
    end
```

---

## 2. Tech Stack

### Storefront (`perfumora/`)
- **Framework**: Next.js 16.3 (App Router with Server Components & Server Actions)
- **UI Runtime**: React 19.2 & TypeScript 5.9
- **Styling**: Tailwind CSS v4 + custom HSL design tokens
- **3D Graphics & Physics**: Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`)
  - Procedural bottle materials (glass transmission, refractive liquid physics)
  - Interactive cap removal & particle mist spritz
- **Animations**: GSAP (`gsap` 3.15, `@gsap/react`) & Lenis smooth scrolling
- **Audio Synthesis**: Web Audio API (procedural "Modern Minimalist Spritz", cap uncap acoustic cue, UI clicks)
- **State Management**: `useSyncExternalStore` for persistent local storage cart synchronization
- **Email Service**: Resend API (`resend` SDK) for Atelier inquiries

### Admin Portal (`perfumora-admin/`)
- **Build Tool**: Vite 8.2 with React Router v7
- **UI Runtime**: React 19.2 & TypeScript 6.0
- **Styling**: Tailwind CSS v4
- **AI Processing**: `@imgly/background-removal` (in-browser client-side background removal for perfume bottle imagery)
- **Database Client**: `@supabase/supabase-js`

### Backend & Infrastructure
- **Database**: PostgreSQL on Supabase
- **Authentication**: Supabase Auth (Secure cookies, session tokens, JWT)
- **Security**: Strict Row Level Security (RLS) policies with Postgres `security definer` functions
- **Concurrency & Integrity**: Atomic `place_order` stored procedure (RPC) for inventory decrements

---

## 3. Key Features

### Storefront
1. **Interactive 3D Stage**:
   - WebGL 3D perfume bottle with physical glass refraction and floating liquid inertia.
   - Interactive uncap action that releases a fine particle mist spritz with spatial sound.
2. **Audio Experience**:
   - Procedural Web Audio API sound generator (no external audio files required).
   - Global sound mute toggle persisted in local storage.
3. **Cart & Stepper Counter**:
   - **Silent Add to Bag**: Adding items from product cards updates the bag badge without interrupting browsing.
   - **Directional Rolling Counter**: Incrementing (`+`) rolls numbers up from the bottom; decrementing (`−`) rolls numbers down from the top.
   - **Stock Enforcement**: Real-time stock limit checks with non-stacking toast alerts.
4. **Checkout & Customer Accounts**:
   - Guest and authenticated checkout with split shipping and billing addresses.
   - Order history tracking and account profile management.
   - Contact form with email notifications via Resend.

### Admin Back-Office
1. **Role-Based Access Control**:
   - Strict admin authentication checking `user_roles` via RLS.
2. **Catalog & Inventory Management**:
   - Add, edit, or archive fragrances.
   - Configure per-size price and inventory stock (30ml / 50ml).
   - Built-in automatic background remover for product photography.
3. **Order Management**:
   - Live order stream with status management (`pending`, `processing`, `delivered`, `canceled`).
   - Customer shipping, billing, and order item breakdowns.

---

## 4. Database Schema Overview

The database runs on Supabase PostgreSQL (`perfumora-admin/supabase/schema.sql`):

| Table | Description | Key Columns |
| :--- | :--- | :--- |
| `user_roles` | Role permissions | `user_id` (UUID, PK), `role` (`admin` \| `customer`) |
| `fragrances` | Fragrance SKUs | `id` (text, PK), `name`, `image_url`, `color`, `concentration`, `active` |
| `fragrance_sizes` | Per-size pricing & stock | `fragrance_id`, `size` (`30ml` \| `50ml`), `price` (PKR), `stock` |
| `orders` | Customer orders | `id`, `customer_name`, `customer_email`, `shipping_address`, `status`, `total` |
| `order_items` | Purchased items (denormalized) | `id`, `order_id`, `fragrance_id`, `fragrance_name`, `size`, `price`, `quantity` |

### Key Stored Procedures
- `is_admin()`: Security definer function checking admin status for RLS policies.
- `place_order(...)`: Atomic transaction verifying inventory, locking rows (`FOR UPDATE`), deducting stock, and recording order details.

---

## 5. Environment Configuration

### Storefront (`perfumora/.env`)
```env
# Supabase Client & Server
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key

# Resend Email
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=Perfumora Atelier <onboarding@resend.dev>
CONTACT_TO_EMAIL=shahidumair622@gmail.com
```

### Admin (`perfumora-admin/.env`)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
```

---

## 6. Development & Scripts

### Storefront (`perfumora/`)
```bash
cd perfumora
pnpm install
pnpm dev        # Starts Next.js dev server on http://localhost:3000
pnpm build      # Builds production bundle
pnpm lint       # Runs ESLint checks
```

### Admin Portal (`perfumora-admin/`)
```bash
cd perfumora-admin
npm install
npm run dev     # Starts Vite dev server on http://localhost:5173
npm run build   # Typechecks and builds Vite SPA to dist/
npm run lint    # Runs ESLint checks
```
