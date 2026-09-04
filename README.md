# sailors-dream-redux-frontend

The Vue 3 client for the Sailor's Dream API — a marketplace for boats where the funnel ends in a
negotiation rather than a checkout. What is built and what is next is in [ROADMAP.md](ROADMAP.md).

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
strips the prefix. **The proxy is development only** — in production the SPA is served
same-origin with the API, which is what the cookie session and the CSRF double-submit both assume.

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
