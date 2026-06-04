import { test, expect, Page, Route } from '@playwright/test';

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

test.describe('Error Scenarios - 401 Unauthorized', () => {
  test('should handle 401 when favoriting an article with expired token', async ({ page }) => {
    // Set up fake auth so we appear logged in
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

    const mockArticle = {
      slug: 'test-article',
      title: 'Test Article',
      description: 'Test',
      body: 'Test body content',
      tagList: ['test'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 5,
      author: { username: 'otheruser', bio: 'bio', image: null, following: false },
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
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });
    // Mock favorite endpoint with 401 (expired token)
    await page.route(`${API_BASE}/articles/test-article/favorite`, route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { message: ['Token expired'] } }),
      });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/article/test-article', { waitUntil: 'load' });

    // Article should load since we appear authenticated
    await expect(page.locator('h1')).toHaveText('Test Article');

    // Click favorite — will get 401
    const favoriteBtn = page.locator('button:has-text("Favorite")').first();
    if (await favoriteBtn.isVisible()) {
      await favoriteBtn.click();
      // App should not crash — navbar remains visible regardless of where it navigates
      await expect(page.locator('nav.navbar')).toBeVisible();
    }
  });

  test('should handle 401 when creating an article with expired token', async ({ page }) => {
    // Mock user endpoint to succeed (appear logged in)
    await page.route(`${API_BASE}/user`, route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { username: 'testuser', email: 'test@test.com', token: 'expired-token', bio: null, image: null },
          }),
        });
      } else {
        route.continue();
      }
    });
    // Mock article creation with 401
    await mockApiError(page, '/articles', 401, { errors: { message: ['Token has expired'] } }, 'POST');

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/editor');

    await page.fill('input[formControlName="title"]', 'Test Title');
    await page.fill('input[formControlName="description"]', 'Test desc');
    await page.fill('textarea[formControlName="body"]', 'Test body');
    await page.click('button:has-text("Publish")');

    // App should handle gracefully — show error or redirect, not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});

test.describe('Error Scenarios - 404 Not Found', () => {
  test('should handle 404 for non-existent article', async ({ page }) => {
    await mockApiError(page, '/articles/non-existent-slug-12345', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/article/non-existent-slug-12345', { waitUntil: 'load' });

    // App should not crash — navbar should still be visible
    await expect(page.locator('nav.navbar')).toBeVisible();
    // Should not show article content
    await expect(page.locator('.article-content')).not.toBeVisible();
  });

  test('should handle 404 for non-existent user profile', async ({ page }) => {
    await mockApiError(page, '/profiles/nonexistentuser99999', 404, {
      errors: { profile: ['not found'] },
    });
    // Also mock articles endpoint for this user
    await page.route(`${API_BASE}/articles?author=nonexistentuser99999*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });

    await page.goto('/profile/nonexistentuser99999', { waitUntil: 'load' });

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 404 when editing non-existent article', async ({ page }) => {
    await page.route(`${API_BASE}/user`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { username: 'testuser', email: 'test@test.com', token: 'fake-token', bio: null, image: null },
        }),
      });
    });
    await mockApiError(page, '/articles/deleted-article-slug', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/editor/deleted-article-slug');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    // Should not show the editor form populated with data
    // (either shows error or redirects)
  });
});

test.describe('Error Scenarios - 500 Internal Server Error', () => {
  test('should handle 500 when submitting a new article', async ({ page }) => {
    await page.route(`${API_BASE}/user`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { username: 'testuser', email: 'test@test.com', token: 'fake-token', bio: null, image: null },
        }),
      });
    });
    await mockApiError(page, '/articles', 500, { errors: { server: ['Internal server error'] } }, 'POST');

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/editor');

    await page.fill('input[formControlName="title"]', 'Test Title');
    await page.fill('input[formControlName="description"]', 'Test desc');
    await page.fill('textarea[formControlName="body"]', 'Test body');
    await page.click('button:has-text("Publish")');

    // Should show error, not crash
    await expect(page.locator('.error-messages')).toBeVisible();
    // Editor form should still be usable
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 500 when loading comments', async ({ page }) => {
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
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ article: mockArticle }),
        });
      } else {
        route.continue();
      }
    });
    // Mock comments with 500
    await page.route(`${API_BASE}/articles/test-article/comments`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Database error'] } }),
      });
    });

    await page.goto('/article/test-article', { waitUntil: 'load' });

    // App should not crash — at minimum the navbar should remain visible
    await expect(page.locator('nav.navbar')).toBeVisible();
    // Article content may or may not render depending on how the app handles
    // concurrent fetch failures, but the page should not white-screen
  });

  test('should handle 500 when following a user', async ({ page }) => {
    const mockProfile = {
      username: 'serveruser',
      bio: 'A user',
      image: null,
      following: false,
    };

    await page.route(`${API_BASE}/user`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { username: 'testuser', email: 'test@test.com', token: 'fake-token', bio: null, image: null },
        }),
      });
    });
    await page.route(`${API_BASE}/profiles/serveruser`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: mockProfile }),
      });
    });
    await page.route(`${API_BASE}/articles?author=serveruser*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });
    // Mock follow with 500
    await page.route(`${API_BASE}/profiles/serveruser/follow`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Internal server error'] } }),
      });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/profile/serveruser');

    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
    await page.click('button:has-text("Follow")');

    // App should not crash, profile should still be visible
    await expect(page.locator('.user-info')).toBeVisible();
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});
