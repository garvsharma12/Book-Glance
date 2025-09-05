# Test info

- Name: Simple E2E Tests >> should handle basic interactions
- Location: /home/grv/Downloads/ShelfScanner-main/tests/e2e/simple.spec.ts:9:3

# Error details

```
Error: browserType.launch: Executable doesn't exist at /home/grv/.cache/ms-playwright/firefox-1482/firefox/firefox
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | test.describe('Simple E2E Tests', () => {
   4 |   test('should be able to visit google', async ({ page }) => {
   5 |     await page.goto('https://google.com');
   6 |     await expect(page).toHaveTitle(/Google/);
   7 |   });
   8 |
>  9 |   test('should handle basic interactions', async ({ page }) => {
     |   ^ Error: browserType.launch: Executable doesn't exist at /home/grv/.cache/ms-playwright/firefox-1482/firefox/firefox
  10 |     await page.goto('https://example.com');
  11 |     await expect(page.getByText('Example Domain')).toBeVisible();
  12 |   });
  13 | }); 
```