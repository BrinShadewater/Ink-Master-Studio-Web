import { test } from '@playwright/test';
import {
  verifyOrderedLookStackFlow,
} from './support/editor-helpers';

test('Look stacks remain ordered across preview and export on desktop', async ({ page }) => {
  await verifyOrderedLookStackFlow(page, { width: 1440, height: 900 }, 'look-stack-desktop');
});

test('Look stacks remain ordered across preview and export on mobile', async ({ page }) => {
  await verifyOrderedLookStackFlow(page, { width: 390, height: 844 }, 'look-stack-mobile');
});
