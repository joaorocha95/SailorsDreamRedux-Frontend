import { test, expect } from '@playwright/test'

/**
 * Smoke test for the shell. Deliberately asserts only what renders without the backend running,
 * so a failure here means the front end is broken rather than that Spring is not up.
 */
test('the browse page renders the shell', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Vessels worth the conversation.',
  )
  await expect(page.getByRole('link', { name: "Sailor's Dream" })).toBeVisible()
})

test('an unknown path shows the not-found view', async ({ page }) => {
  await page.goto('/nope')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found')
})
