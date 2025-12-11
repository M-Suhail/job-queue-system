import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('should display the dashboard header', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Job Queue Dashboard' })).toBeVisible()
  })

  test('should show job list tabs', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'All Jobs' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dead Letter' })).toBeVisible()
  })

  test('should show filters section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder('Search by id, type, or payload')).toBeVisible()
    await expect(page.getByRole('combobox')).toBeVisible()
  })

  test('should show metrics panel', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Queue Metrics')).toBeVisible()
  })

  test('should show controls section', async ({ page }) => {
    await page.goto('/')
    // Controls should have pause/resume functionality
    const controlsExist = await page.getByRole('button', { name: /pause|resume/i }).isVisible()
    expect(controlsExist).toBeTruthy()
  })
})

test.describe('Navigation', () => {
  test('should switch between All Jobs and Dead Letter tabs', async ({ page }) => {
    await page.goto('/')
    
    // Click Dead Letter tab
    await page.getByRole('button', { name: 'Dead Letter' }).click()
    await expect(page.getByRole('button', { name: 'Dead Letter' })).toHaveClass(/border-red-600/)
    
    // Click All Jobs tab
    await page.getByRole('button', { name: 'All Jobs' }).click()
    await expect(page.getByRole('button', { name: 'All Jobs' })).toHaveClass(/border-blue-600/)
  })
})

test.describe('Filters', () => {
  test('should filter by status', async ({ page }) => {
    await page.goto('/')
    
    const select = page.getByRole('combobox')
    await select.selectOption('pending')
    
    // Verify filter was applied (URL or state change)
    await expect(select).toHaveValue('pending')
  })

  test('should search by text', async ({ page }) => {
    await page.goto('/')
    
    const searchInput = page.getByPlaceholder('Search by id, type, or payload')
    await searchInput.fill('email')
    
    // Give time for debounced search
    await page.waitForTimeout(500)
    await expect(searchInput).toHaveValue('email')
  })

  test('should show advanced filters when clicking More Filters', async ({ page }) => {
    await page.goto('/')
    
    // Click More Filters
    await page.getByText('▶ More Filters').click()
    
    // Advanced filters should appear
    await expect(page.getByText('Created after:')).toBeVisible()
    await expect(page.getByText('Created before:')).toBeVisible()
    await expect(page.getByText('Min attempts:')).toBeVisible()
    await expect(page.getByText('Max attempts:')).toBeVisible()
  })
})
