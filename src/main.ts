/**
 * The entry point. Three things are wired here and the order of two of them matters.
 *
 * `main.css` is imported first, and imports `tokens.css` in turn, so every custom property exists
 * before a single component's scoped styles are evaluated. A component that renders against
 * missing tokens does not fail loudly — it falls back to the initial value of each property,
 * which is to say transparent text on a transparent ground.
 */
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

/**
 * **Pinia before the router, and not the other way round.** The router's `beforeEach` guard calls
 * `useAuthStore()` on the very first navigation — it has to, since whether a route is reachable
 * depends on the session — and a store used before its plugin is installed throws rather than
 * returning an empty store. The bug that arrangement produces is a blank page on first load and
 * nothing else, so it is worth stating why these two lines are in this order.
 */
app.use(createPinia())
app.use(router)

app.mount('#app')
