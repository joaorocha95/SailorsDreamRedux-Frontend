import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import BrowseView from '@/views/BrowseView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Redirects to /login when there is no session. */
    requiresAuth?: boolean
    /** Sends signed-in users away — for /login and /signup. */
    guestOnly?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    // Browse is guest-visible and is the landing page, so it is bundled eagerly rather than
    // split — the split chunk would just be a second round trip on every cold visit.
    { path: '/', name: 'browse', component: BrowseView },

    {
      path: '/listings/:id',
      name: 'listing',
      component: () => import('@/views/ListingView.vue'),
      props: true,
    },

    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true },
    },

    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/views/SignupView.vue'),
      meta: { guestOnly: true },
    },

    {
      path: '/messages',
      name: 'inbox',
      component: () => import('@/views/InboxView.vue'),
      meta: { requiresAuth: true },
    },

    // A thread survives things its inbox row does not: a block hides it from both inboxes while
    // leaving `GET /chats/{id}` working, so this route has to resolve for a bookmarked URL that
    // no longer appears in any list. The view designs that state rather than treating it as a 404.
    {
      path: '/messages/:id',
      name: 'thread',
      component: () => import('@/views/ThreadView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },

    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
      meta: { requiresAuth: true },
    },

    // Reachable only while signed in, because reactivating is an authenticated act — which is
    // exactly why a self-deactivated user is allowed to sign in at all.
    {
      path: '/account/deactivated',
      name: 'account-deactivated',
      component: () => import('@/views/AccountDeactivatedView.vue'),
      meta: { requiresAuth: true },
    },

    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],

  // Return to the top on a new route, but restore position on back/forward — the browser's own
  // behaviour, which people expect and notice the absence of.
  scrollBehavior(to, from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Every guard waits on the same in-flight bootstrap, so a hard refresh onto a protected route
  // is decided against the real session rather than against an empty store.
  await auth.bootstrap()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'browse' }
  }

  return true
})

export default router
