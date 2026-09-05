# sailors-dream-redux-frontend

The Vue 3 client for the Sailor's Dream API — a marketplace for boats where the funnel ends in a
negotiation rather than a checkout.

- [ROADMAP.md](ROADMAP.md) — what was built, and the reasoning behind each decision.
- [TODO.md](TODO.md) — what is left, by part of the project. Most of it belongs to the API.

## Running it against the real API

The client is useless on its own: every screen reads from the Spring backend in the sibling
checkout `../sailors-dream-redux`. Verified working end to end on 2026-09-04 — the notes below are
what it actually took, not what it ought to take.

### What you need

| | |
| --- | --- |
| **Node** | `^22.18.0 \|\| >=24.12.0`, per `package.json` |
| **JDK 21** | The backend sets `<java.version>21</java.version>`. **A JDK 17 on your `PATH` will not build it** — this is the first thing that goes wrong. |
| **Docker** | Running, for Postgres. You do not start it yourself; see below. |

If `java -version` says anything below 21, point `JAVA_HOME` at one that is — the Maven wrapper
uses `JAVA_HOME` in preference to `PATH`:

```bash
export JAVA_HOME="$HOME/.jdks/corretto-21.0.12"
```

### 1. Start the backend

```bash
cd ../sailors-dream-redux && ./mvnw spring-boot:run
```

**Do not run `docker compose up` first.** `spring-boot-docker-compose` is on the classpath, so Boot
starts `compose.yaml` itself, waits for Postgres, and overrides `spring.datasource.*` with the
container's real connection details — including the host port, which compose deliberately leaves
unmapped so Docker assigns a free one.

This is why `compose.yaml` (`myuser` / `secret` / `mydatabase`) and `application.yaml`
(`postgres` / `changemeinprod!` / `postgres` on 5432) disagree and **both are correct**: the
compose values are what actually gets used, and the `application.yaml` block is the fallback for
running against a Postgres you started yourself. It looks like a bug and is not one.

The API is up when `http://localhost:8080/products` answers:

```bash
curl -s "http://localhost:8080/products?size=1"
```

### 2. Start the client

```bash
npm install
npm run dev
```

`vite.config.ts` proxies `/api/*` to `:8080`, so the app talks to `/api/products` and the proxy
strips the prefix. **This proxy is development only** — `vite dev` does not run in production.
What replaces it there is a rewrite on the host doing the same job for the same reason, since the
cookie session and the CSRF double-submit both assume the browser sees one origin; see
[Deploying it](#deploying-it).

### 3. Bootstrap the data

A fresh database is **completely empty**, and two things make that more than an inconvenience.

**There is no way to create an admin through the API.** `accountType` is never settable —
`POST /users` always makes a `USER`, and `UpdateUserRequest` carries name and phone only. So the
first one is made by hand. Register through the app at `/signup`, then:

```bash
cd ../sailors-dream-redux
docker compose exec postgres psql -U myuser -d mydatabase -c "UPDATE user_entity SET account_type='ADMIN' WHERE email='you@example.com';"
```

Sign out and back in for the session to carry the new tier.

**Nothing can be listed until a category exists**, and only an admin can create one. So the order
is forced: register → promote → create categories at `/admin/categories` → list a boat. That path
also exercises signup, login and the staff pages as a side effect, which makes it a reasonable
smoke test in its own right.

### Known limitation: images do not load

With the default `IMAGES_STORE=memory`, uploaded images are **unreachable**. `InMemoryImageStore`
keeps the bytes in a map and builds URLs like `http://localhost:8080/local-images/<key>`, but
nothing serves that path — there is no resource handler — and Spring Security's
`anyRequest().authenticated()` answers **401** for it besides. The URL is absolute to `:8080`, so
it bypasses the Vite proxy too.

Uploads succeed and the API returns URLs; the pictures simply never render. Anything image-shaped
— the browse cards, the listing gallery, avatars, the photo manager on a listing — cannot be
checked this way. Set `IMAGES_STORE=oci` with the `OCI_S3_*` variables to exercise it for real.

### Tearing it down

`Ctrl-C` stops the backend but **leaves Postgres running**, since Boot only stops what it started
if configured to. To clear the database and start clean:

```bash
cd ../sailors-dream-redux && docker compose down -v
```

## Deploying it

The client is hosted on **Vercel** and the API on **Railway**, which are two different origins —
and that is the whole problem this section exists to solve.

### Why the API is proxied rather than called directly

A cookie session and a CSRF double-submit both assume one origin. Calling
`https://…up.railway.app` straight from `https://…vercel.app` breaks on the second of those in a
way no amount of CORS configuration fixes: [`src/lib/http.ts`](src/lib/http.ts) reads the
`XSRF-TOKEN` value out of `document.cookie`, that cookie belongs to the Railway host, and
JavaScript cannot read another site's cookies. Every write would send no `X-XSRF-TOKEN` and take a
403 — sign-in included.

The session cookie has the same shape of problem one level down: cross-site it needs
`SameSite=None; Secure`, which Safari and Firefox block by default. And both `vercel.app` and
`up.railway.app` are on the Public Suffix List, so there is no shared parent domain that would
make the two same-site.

So `vercel.json` rewrites `/api/*` to Railway **server-side**. The browser only ever talks to the
Vercel origin, which makes the cookies first-party, the CSRF handshake unchanged, and CORS
unnecessary — the production counterpart of the dev proxy in `vite.config.ts`, and the case
`http.ts` was already written for. The cost is one extra hop per API call.

### `vercel.json`

Two rules, and the order is load-bearing:

1. `/api/:path*` → the Railway origin, prefix stripped, exactly as the dev proxy strips it.
2. `/(.*)` → `/index.html`, so a deep link into a client route (`/messages/1`, `/listings/2`)
   serves the shell instead of 404ing.

The catch-all does not swallow the bundle: Vercel checks the filesystem before applying rewrites,
so anything real under `/assets`, `/fonts` and `/favicon.ico` is served as a file. It does not
swallow the API either, because the rule above it matched first. Put the two the other way round
and every API call returns the HTML shell with a 200 — a failure that surfaces as JSON parse
errors somewhere far away.

### The client half: `.env.production`

The rewrite is only half the arrangement — the app has to actually ask for `/api/products` rather
than `/products`. That is `VITE_API_BASE=/api`, and it lives in
[`.env.production`](.env.production) rather than in Vercel's dashboard so that it cannot drift from
the `vercel.json` it has to match. It is a path, not a secret. Vite reads the file for
`vite build` and never for `vite dev`, where the config's own proxy already answers.

Without it a production build resolves the API to the root of the Vercel origin, where nothing
answers — `http.ts` defaults to `''` precisely because the same-origin case needs no prefix. A
dashboard variable of the same name overrides the file if a deployment ever needs to point
somewhere else.

**Building locally on Windows, set it in a file or in PowerShell, never as a Git Bash prefix.**
`VITE_API_BASE=/api npm run build` under Git Bash bakes in `C:/Program Files/Git/api`: MSYS
rewrites a value that starts with `/` into a Windows path, and the bundle is silently wrong.

### Vercel project settings

- **Node 22 or 24.** `package.json` declares `"node": "^22.18.0 || >=24.12.0"` and an older
  default fails the install.
- Build command and output directory are the Vite defaults (`npm run build`, `dist`).
- No environment variables needed — see the section above.

### Railway

Nothing in this repository configures the API; it is deployed from `../sailors-dream-redux` as the
image its CI publishes to GHCR.

- **The port needs nothing set.** The backend binds `${PORT:8080}`, so it takes whatever Railway
  injects and falls back to 8080 anywhere that injects nothing. Recorded because it was not always
  true, and the failure it caused is worth recognising: Boot used to sit on 8080 while Railway
  dialled its own choice, which produced `502 Application failed to respond` on every request from
  a container that was **completely healthy** — logs showing a clean start, a live database
  connection, and `Tomcat started on port 8080`, with `connection refused` at the edge. When a
  service looks dead and its logs look fine, suspect this rather than a crash. Fixed in the backend
  on 2026-09-05.
- **The environment.** `DATABASE_URL`, `DB_USERNAME`, `DB_PASSWORD`, `IMAGES_STORE=oci`,
  `IMAGES_BASE_URL` and the five `OCI_S3_*` values are all required and none have defaults — the
  app fails at startup rather than coming up half-working. `DATABASE_URL` must point at the
  Supabase **pooler** (`aws-1-eu-west-1.pooler.supabase.com:5432`) with `DB_USERNAME` as
  `postgres.<project-ref>`; the direct `db.<ref>.supabase.co` host is IPv6-only and unreachable
  from a container.

### Verifying a deploy

In this order, because each step rules out everything before it:

1. `GET /products` directly on the Railway origin — the API is up at all.
2. The same through `https://<app>.vercel.app/api/products` — the rewrite works and strips the
   prefix.
3. Sign in — the session cookie survives the proxy and comes back first-party.
4. Any write (save a listing, send a message) — the CSRF double-submit works, which is the thing
   the whole arrangement exists to protect.
5. A listing photograph — those load straight from OCI object storage on absolute URLs and touch
   neither host, so a failure here is the image store, not the deployment.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
npm run build

# Runs the end-to-end tests
npm run test:e2e
# Runs the tests only on Chromium
npm run test:e2e -- --project=chromium
# Runs the tests of a specific file
npm run test:e2e -- tests/example.spec.ts
# Runs the tests in debug mode
npm run test:e2e -- --debug
```
