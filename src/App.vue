<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
</script>

<template>
  <a class="skip" href="#main">Skip to content</a>

  <AppHeader />

  <main id="main">
    <!--
      No route transition. Navigation here is frequent and often keyboard- or
      back-button-initiated, and an animation on a repeated action reads as lag rather than
      polish. Individual views animate their own content in instead.
    -->
    <RouterView />
  </main>
</template>

<style scoped>
.skip {
  position: absolute;
  left: -9999px;
  top: var(--sp-3);
  z-index: 10;
  background: var(--ink);
  color: var(--ground);
  padding: var(--sp-2) var(--sp-4);
  border-radius: 3px;
  text-decoration: none;
  font-size: var(--step--1);
}
.skip:focus {
  left: var(--sp-4);
}
</style>
