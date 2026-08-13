import { expect, test } from '@playwright/test';

/**
 * Regression guard for a real defect: at 390px the "Manage variation" disclosure sat on
 * top of the Basic/Advanced toggle and swallowed its clicks, so mobile users could not
 * switch editor mode at all.
 *
 * The cause was flex sizing — the variation group carried `min-w-0` and so collapsed,
 * while its children were `shrink-0` and overflowed past its box onto the commands
 * group. The fix lets the variation select shrink and reserves the commands group's
 * width. This checks the property that matters (the controls do not overlap and the
 * toggle is hit-testable), not the specific classes, so it survives restyling.
 */
for (const width of [320, 390, 768, 1440]) {
  test(`topbar controls do not overlap at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/editor');

    const buffer = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 300;
      const c = canvas.getContext('2d')!;
      c.fillStyle = '#3366ff'; c.fillRect(0, 0, 400, 300);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await blob!.arrayBuffer()));
    });
    await page.locator('input[type="file"][aria-label="Import artwork file"]').setInputFiles({
      name: 'probe.png', mimeType: 'image/png', buffer: Buffer.from(buffer),
    });
    await page.getByRole('navigation', { name: 'Editor tools' }).waitFor();

    const data = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const adv = box('[role="radio"][aria-label="Advanced"]');
      const mgr = box('summary[aria-label="Manage variation"]');
      const overlaps = !!(adv && mgr &&
        adv.x < mgr.x + mgr.w && mgr.x < adv.x + adv.w &&
        adv.y < mgr.y + mgr.h && mgr.y < adv.y + adv.h);
      const el = document.querySelector('[role="radio"][aria-label="Advanced"]')!;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { adv, mgr, overlaps, hitIsRadio: el.contains(hit) };
    });
    console.log(`W${width}:` + JSON.stringify(data));

    expect(data.overlaps, `controls overlap at ${width}px`).toBe(false);
    expect(data.hitIsRadio, `mode toggle is hit-testable at ${width}px`).toBe(true);
    await page.getByRole('radio', { name: 'Advanced', exact: true }).click({ timeout: 8000 });
  });
}
