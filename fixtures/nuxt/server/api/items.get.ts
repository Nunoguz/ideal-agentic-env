import { z } from "zod";

const Query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });

export default defineEventHandler(async (event) => {
  const { limit } = await getValidatedQuery(event, Query.parse);
  const items = Array.from({ length: limit }, (_, i) => ({ id: `item-${i + 1}`, name: `Item ${i + 1}` }));
  return { items };
});
