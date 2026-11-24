<script setup lang="ts">
const { data, error, status } = await useFetch("/api/items", { key: "items", query: { limit: 3 } });
</script>

<template>
  <main>
    <h1>Items</h1>
    <p v-if="status === 'pending'">Loading…</p>
    <p v-else-if="error" role="alert">Could not load the items. Try again.</p>
    <p v-else-if="!data?.items.length">No items yet.</p>
    <ul v-else>
      <li v-for="item in data.items" :key="item.id">{{ item.name }}</li>
    </ul>
  </main>
</template>
