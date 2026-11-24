# Vue rules (stack-web)

## Components
- Single-file components with `<script setup lang="ts">` and the Composition API. No Options API or mixins in new code.
- Type props and events with `defineProps<{ … }>()` and `defineEmits<{ … }>()`; use `defineModel()` for `v-model`. No `any`.
- Props are read-only. Copy a prop into a `ref` to edit it locally; never mutate a prop object.
- Derived values belong in `computed()`, not in long template expressions. `computed` has no side effects.
- `v-for` has a stable `:key` (an id, not the index). Never put `v-if` and `v-for` on the same element.

## Reactivity guardrails (bugs that fail silently)
- Destructuring a `reactive()` object, or a Pinia store without `storeToRefs()`, loses reactivity.
- Props destructured in `<script setup>` (Vue 3.5) stay reactive in the template, but `watch` and composables need a getter: `watch(() => count, …)`.
- `ref` needs `.value` in script, not in the template. A `ref` holding a large immutable object should be a `shallowRef`.
- `watch` on a nested object needs a getter or `{ deep: true }`. `watchEffect` re-runs for everything it reads.
- Listeners, timers and subscriptions started in `onMounted` are stopped in `onUnmounted`.

## State, routing and data
- Shared state lives in Pinia setup stores (`defineStore("x", () => { … })`). Component-local state stays local.
- Route params and query are `unknown` until a schema (zod) parses them. A `router.beforeEach` guard is UX, not access control: the API authorizes every request.
- Data fetching lives in composables (`useX()`) that expose data, error and pending state. Every screen handles loading, error and empty results.

## Security and tooling
- `v-html` only with sanitized input (DOMPurify) and a comment naming the source. Validate the scheme of any user-supplied URL bound to `:href` or `:src`.
- Only `VITE_*` variables reach the bundle, and they are public.
- Lint with `eslint-plugin-vue` (recommended) and `eslint-plugin-vuejs-accessibility`. Type-check with `vue-tsc --noEmit`: plain `tsc` does not read `.vue` files.
