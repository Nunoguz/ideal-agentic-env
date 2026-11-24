// Visual and accessibility verification (ideal-agentic-env/design ui-verify).
// UI_VERIFY_ROUTES=/,/items npx playwright test ui-verify
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = (process.env.UI_VERIFY_ROUTES ?? "/").split(",").map((r) => r.trim()).filter(Boolean);
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const;
const SCHEMES = ["light", "dark"] as const;
const slug = (route: string) => route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of SCHEMES) {
      test(`ui-verify ${route} ${viewport.name} ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        await page.screenshot({ path: `artifacts/ui/${slug(route)}-${viewport.name}-${colorScheme}.png`, fullPage: true });

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(axe.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)).toEqual([]);

        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, visible: r.width > 0 && r.height > 0 };
        });
        expect(focused?.visible, "Tab moves focus to a visible element").toBe(true);
      });
    }
  }
}
