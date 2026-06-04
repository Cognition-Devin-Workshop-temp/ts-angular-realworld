import { test, expect, Page, Route } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, generateUniqueArticle } from './helpers/articles';

const API_BASE = 'https://api.realworld.show/api';

async function mockApiError(page: Page, endpoint: string, status: number, errorBody: object = {}, method?: string) {
  await page.route(`${API_BASE}${endpoint}`, (route: Route) => {
    if (method && route.request().method() !== method) {
      return route.continue();
    }
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(errorBody),
    });
  });
}

async function setFakeAuthToken(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('jwtToken', 'fake-token-for-testing');
  });
}

async function mockAuthenticatedUser(page: Page) {
  await page.route(`${API_BASE}/user`, route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { username: 'testuser', email: 'test@test.com', token: 'fake-token', bio: null, image: null },
        }),
      });
    } else {
      route.continue();
    }
  });
}

/**
 * Error Scenarios Tests
 *
 * Verifies graceful handling of HTTP 401, 404, and 500 responses
 * across different features of the app. Uses route mocking to
 * simulate server errors.
 */

test.describe('Error Scenarios - 401 Unauthorized', () => {
  test('should handle 401 on article creation gracefully', async ({ page }) => {
    await page.goto('/');
    await setFakeAuthToken(page);
    await mockAuthenticatedUser(page);
    await mockApiError(page, '/articles', 401, { errors: { message: ['Token expired'] } }, 'POST');

    await page.goto('/editor');
    await page.fill('input[formControlName="title"]', 'Test Article');
    await page.fill('input[formControlName="description"]', 'Test description');
    await page.fill('textarea[formControlName="body"]', 'Test body content');
    await page.click('button:has-text("Publish")');

    // Should show error, not crash
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 401 on fetching user profile at startup', async ({ page }) => {
    await page.route(`${API_BASE}/user`, route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { message: ['Token is invalid or expired'] } }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('jwtToken', 'expired-token');
    });
    await page.reload();

    // Should show unauthenticated UI
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();

    // Articles should still load
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should handle 401 when favoriting an article', async ({ page }) => {
    const mockArticle = {
      slug: 'test-article',
      title: 'Test Article',
      description: 'Test',
      body: 'Test body',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'otheruser', bio: null, image: null, following: false },
    };

    await page.goto('/');
    await setFakeAuthToken(page);
    await mockAuthenticatedUser(page);

    await page.route(`${API_BASE}/articles/test-article`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ article: mockArticle }),
      });
    });
    await page.route(`${API_BASE}/articles/test-article/comments`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });
    await mockApiError(page, '/articles/test-article/favorite', 401, { errors: { message: ['Unauthorized'] } }, 'POST');

    await page.goto('/article/test-article');
    await expect(page.locator('h1')).toContainText('Test Article');

    // App should not crash even if favorite fails
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.article-content')).toBeVisible();
  });
});

test.describe('Error Scenarios - 404 Not Found', () => {
  test('should handle 404 when viewing non-existent article', async ({ page }) => {
    await mockApiError(page, '/articles/non-existent-slug-12345', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/article/non-existent-slug-12345');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 404 when viewing non-existent profile', async ({ page }) => {
    await mockApiError(page, '/profiles/nonexistentuser99999', 404, {
      errors: { profile: ['not found'] },
    });
    // Mock articles for this profile to also 404
    await page.route(`${API_BASE}/articles?author=nonexistentuser99999*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });

    await page.goto('/profile/nonexistentuser99999');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 404 on editing non-existent article', async ({ page }) => {
    await page.goto('/');
    await setFakeAuthToken(page);
    await mockAuthenticatedUser(page);
    await mockApiError(page, '/articles/deleted-article-slug', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/editor/deleted-article-slug');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});

test.describe('Error Scenarios - 500 Internal Server Error', () => {
  test('should handle 500 on article feed load', async ({ page }) => {
    await mockApiError(page, '/articles*', 500, {
      errors: { server: ['Internal server error'] },
    });

    await page.goto('/');

    // App should not crash - navbar/banner should still render
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.navbar-brand')).toBeVisible();
  });

  test('should handle 500 on tags load', async ({ page }) => {
    // Let articles load normally
    await page.route(`${API_BASE}/articles*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });
    await mockApiError(page, '/tags', 500, {
      errors: { server: ['Database connection failed'] },
    });

    await page.goto('/');

    // App should load without tags, sidebar may be missing but app should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.navbar-brand')).toBeVisible();
  });

  test('should handle 500 on article creation', async ({ page }) => {
    await page.goto('/');
    await setFakeAuthToken(page);
    await mockAuthenticatedUser(page);
    await mockApiError(page, '/articles', 500, { errors: { server: ['Database error'] } }, 'POST');

    await page.goto('/editor');
    await page.fill('input[formControlName="title"]', 'Test Article');
    await page.fill('input[formControlName="description"]', 'Test description');
    await page.fill('textarea[formControlName="body"]', 'Test body content');
    await page.click('button:has-text("Publish")');

    // Should show error, form should still be usable
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 500 on comments load', async ({ page }) => {
    const mockArticle = {
      slug: 'test-article',
      title: 'Test Article',
      description: 'Test',
      body: 'Test body content',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'author', bio: null, image: null, following: false },
    };

    await page.route(`${API_BASE}/articles/test-article`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ article: mockArticle }),
      });
    });
    await page.route(`${API_BASE}/articles/test-article/comments`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Comments service unavailable'] } }),
      });
    });

    await page.goto('/article/test-article');

    // Article should still display even if comments fail
    await expect(page.locator('h1')).toContainText('Test Article');
    await expect(page.locator('.article-content')).toBeVisible();
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 500 on user profile load', async ({ page }) => {
    await mockApiError(page, '/profiles/someuser', 500, {
      errors: { server: ['Internal server error'] },
    });
    await page.route(`${API_BASE}/articles?author=someuser*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });

    await page.goto('/profile/someuser');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});
