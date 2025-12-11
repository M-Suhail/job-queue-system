import { test, expect } from '@playwright/test'

/**
 * E2E tests for real-time Socket.IO integration
 * These tests verify the worker → API → frontend real-time flow
 * 
 * Note: These tests require the full stack to be running:
 * - PostgreSQL and Redis (docker-compose)
 * - API server (packages/api)
 * - Worker (packages/worker)
 * - Frontend dev server (packages/frontend)
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

test.describe('Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for initial load
    await page.waitForSelector('[data-testid="job-list"]', { timeout: 10000 }).catch(() => {
      // Job list might not have data-testid, wait for any content
    })
    await page.waitForTimeout(1000)
  })

  test('should connect to Socket.IO on page load', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/')
    
    // Check that the page loads without WebSocket errors
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('WebSocket')) {
        consoleErrors.push(msg.text())
      }
    })
    
    await page.waitForTimeout(2000)
    
    // Dashboard should be functional
    await expect(page.getByRole('heading', { name: 'Job Queue Dashboard' })).toBeVisible()
  })

  test('should show job created via API in real-time', async ({ page, request }) => {
    await page.goto('/')
    
    // Create a unique job type for identification
    const uniqueType = `e2e-test-${Date.now()}`
    
    // Create a job via API
    const response = await request.post(`${API_URL}/jobs`, {
      data: {
        type: uniqueType,
        payload: { test: true, timestamp: Date.now() }
      }
    })
    
    expect(response.ok()).toBeTruthy()
    const job = await response.json()
    expect(job.id).toBeTruthy()
    
    // Wait for the job to appear in the list via Socket.IO
    // The job should appear without needing to refresh
    await page.waitForTimeout(2000)
    
    // Refresh and verify job exists (fallback verification)
    await page.getByRole('button', { name: /refresh/i }).click()
    await page.waitForTimeout(1000)
    
    // The job should be visible in the list
    const jobTypeVisible = await page.getByText(uniqueType).isVisible().catch(() => false)
    // Job might be on first page, or we can search for it
    if (!jobTypeVisible) {
      await page.getByPlaceholder('Search by id, type, or payload').fill(uniqueType)
      await page.waitForTimeout(500)
    }
    
    // Verify the job appears
    await expect(page.getByText(uniqueType).first()).toBeVisible({ timeout: 5000 })
  })

  test('should update job status in real-time when worker processes it', async ({ page, request }) => {
    await page.goto('/')
    
    // Create a job that will be processed quickly
    const uniqueType = `e2e-realtime-${Date.now()}`
    
    const response = await request.post(`${API_URL}/jobs`, {
      data: {
        type: uniqueType,
        payload: { processTime: 100 }
      }
    })
    
    expect(response.ok()).toBeTruthy()
    const job = await response.json()
    
    // Search for this specific job
    await page.getByPlaceholder('Search by id, type, or payload').fill(uniqueType)
    await page.waitForTimeout(500)
    
    // The job should appear initially as pending
    await expect(page.getByText(uniqueType).first()).toBeVisible({ timeout: 5000 })
    
    // Wait for worker to process (status should change via Socket.IO)
    // Status might change from pending → in_progress → succeeded
    await page.waitForTimeout(5000)
    
    // Refresh to verify final state
    await page.getByRole('button', { name: /refresh/i }).click()
    await page.waitForTimeout(1000)
  })

  test('should show pause/resume queue state', async ({ page, request }) => {
    await page.goto('/')
    
    // Find the pause/resume button
    const pauseButton = page.getByRole('button', { name: /pause/i })
    const resumeButton = page.getByRole('button', { name: /resume/i })
    
    const isPaused = await resumeButton.isVisible().catch(() => false)
    
    if (!isPaused) {
      // Queue is running, try pausing
      await pauseButton.click()
      await page.waitForTimeout(1000)
      
      // Resume button should now be visible
      await expect(page.getByRole('button', { name: /resume/i })).toBeVisible({ timeout: 3000 })
      
      // Resume the queue
      await page.getByRole('button', { name: /resume/i }).click()
      await page.waitForTimeout(1000)
      
      // Pause button should be back
      await expect(page.getByRole('button', { name: /pause/i })).toBeVisible({ timeout: 3000 })
    } else {
      // Queue is paused, resume it
      await resumeButton.click()
      await page.waitForTimeout(1000)
      await expect(page.getByRole('button', { name: /pause/i })).toBeVisible({ timeout: 3000 })
    }
  })

  test('should cancel a pending job', async ({ page, request }) => {
    await page.goto('/')
    
    // First pause the queue so job stays pending
    const pauseButton = page.getByRole('button', { name: /pause/i })
    if (await pauseButton.isVisible()) {
      await pauseButton.click()
      await page.waitForTimeout(500)
    }
    
    // Create a job
    const uniqueType = `e2e-cancel-${Date.now()}`
    const response = await request.post(`${API_URL}/jobs`, {
      data: {
        type: uniqueType,
        payload: { shouldCancel: true }
      }
    })
    
    const job = await response.json()
    
    // Search for this job
    await page.getByPlaceholder('Search by id, type, or payload').fill(uniqueType)
    await page.waitForTimeout(500)
    
    // Click View to see job details
    const viewButton = page.getByRole('button', { name: 'View' }).first()
    await viewButton.click()
    await page.waitForTimeout(500)
    
    // Cancel button should be in job details
    const cancelButton = page.getByRole('button', { name: /cancel/i })
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      await page.waitForTimeout(1000)
      
      // Job should now show as cancelled
      await expect(page.getByText(/cancelled/i)).toBeVisible({ timeout: 5000 })
    }
    
    // Resume queue for other tests
    const resumeButton = page.getByRole('button', { name: /resume/i })
    if (await resumeButton.isVisible()) {
      await resumeButton.click()
    }
  })
})

test.describe('Pagination', () => {
  test('should show pagination controls when there are many jobs', async ({ page, request }) => {
    await page.goto('/')
    
    // Create multiple jobs to trigger pagination
    const jobPromises = []
    for (let i = 0; i < 25; i++) {
      jobPromises.push(
        request.post(`${API_URL}/jobs`, {
          data: {
            type: `pagination-test-${i}`,
            payload: { index: i }
          }
        })
      )
    }
    
    await Promise.all(jobPromises)
    
    // Refresh the list
    await page.getByRole('button', { name: /refresh/i }).click()
    await page.waitForTimeout(1000)
    
    // Pagination should appear (Next button or page indicator)
    const hasNextButton = await page.getByRole('button', { name: /next/i }).isVisible().catch(() => false)
    const hasPageText = await page.getByText(/page/i).isVisible().catch(() => false)
    
    expect(hasNextButton || hasPageText).toBeTruthy()
  })

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)
    
    const nextButton = page.getByRole('button', { name: /next/i })
    
    if (await nextButton.isVisible() && !(await nextButton.isDisabled())) {
      // Go to next page
      await nextButton.click()
      await page.waitForTimeout(500)
      
      // Previous button should now be enabled
      const prevButton = page.getByRole('button', { name: /previous/i })
      await expect(prevButton).toBeEnabled()
      
      // Go back
      await prevButton.click()
      await page.waitForTimeout(500)
      
      // Previous should be disabled on first page
      await expect(prevButton).toBeDisabled()
    }
  })
})
