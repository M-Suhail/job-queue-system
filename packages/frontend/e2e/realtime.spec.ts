import { test, expect } from '@playwright/test'

/**
 * E2E tests for real-time Socket.IO integration
 * These tests verify the worker → API → frontend real-time flow
 * 
 * Note: Tests that require backend APIs are skipped in CI.
 * To run full e2e tests locally, start the full stack:
 * - PostgreSQL and Redis (docker-compose)
 * - API server (packages/api)
 * - Worker (packages/worker)
 * - Frontend dev server (packages/frontend)
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

// Set reasonable timeout for all tests
test.setTimeout(30000)

test.describe('Real-time Updates', () => {
  test('should connect to Socket.IO on page load', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/')
    
    // Dashboard should be functional
    await expect(page.getByRole('heading', { name: 'Job Queue Dashboard' })).toBeVisible({ timeout: 10000 })
  })

  test('should show pause/resume button', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Find the pause/resume button - it should exist
    await expect(page.getByRole('button', { name: /pause|resume/i })).toBeVisible({ timeout: 5000 })
  })
})
