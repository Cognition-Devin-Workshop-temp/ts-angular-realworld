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

async function mockLoggedInUser(page: Page, username = 'testuser') {
  await page.route(`${API_BASE}/user`, route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            username,
            email: `${username}@test.com`,
            token: 'fake-token',
            bio: null,
            image: null,
          },
        }),
      });
    } else {
      route.continue();
    }
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('jwtToken', 'fake-token'));
}

test.describe('Error Scenarios - 401 Unauthorized', () => {
  test('should handle 401 on article creation when token expires mid-session', async ({ page }) => {
    await mockLoggedInUser(page);

    // Mock article creation returning 401 (expired token)
    await mockApiError(page, '/articles', 401, { errors: { message: ['Token has expired'] } }, 'POST');

    await page.goto('/editor');
    await page.fill('input[formControlName="title"]', 'Test Article');
    await page.fill('input[formControlName="description"]', 'Description');
    await page.fill('textarea[formControlName="body"]', 'Body content');
    await page.click('button:has-text("Publish")');

    // Should show error, not crash
    await expect(page.locator('.error-messages')).toBeVisible();
    // Form should still be usable (user can re-authenticate)
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 401 on article deletion', async ({ page }) => {
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
      author: { username: 'testuser', bio: '', image: '', following: false },
    };

    await mockLoggedInUser(page);

    await page.route(`${API_BASE}/articles/test-article`, route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ article: mockArticle }),
        });
      } else if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { message: ['Token has expired'] } }),
        });
      } else {
        route.continue();
      }
    });
    await page.route(`${API_BASE}/articles/test-article/comments`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });

    await page.goto('/article/test-article');
    await expect(page.locator('h1')).toHaveText('Test Article');

    // Try to delete — should fail gracefully
    await page.click('button:has-text("Delete Article")');

    // App should not crash — navbar still visible
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 401 on favorite action', async ({ page }) => {
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
      author: { username: 'otheruser', bio: '', image: '', following: false },
    };

    await mockLoggedInUser(page);

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
    await page.route(`${API_BASE}/articles/test-article/comments`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });
    await page.route(`${API_BASE}/articles/test-article/favorite`, route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { message: ['Must be logged in'] } }),
      });
    });

    await page.goto('/article/test-article');
    await page.locator('button:has-text("Favorite Article")').first().click();

    // 401 on non-/user endpoint triggers purgeAuth → user is logged out
    // The app should show unauthenticated state (Sign in / Sign up links)
    await expect(page.locator('a:has-text("Sign in")')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error Scenarios - 404 Not Found', () => {
  test('should handle 404 when loading article detail', async ({ page }) => {
    await mockApiError(page, '/articles/does-not-exist-slug', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/article/does-not-exist-slug');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.article-page')).toBeVisible();
  });

  test('should handle 404 when loading user profile', async ({ page }) => {
    await mockApiError(page, '/profiles/ghost_user_xyz', 404, {
      errors: { profile: ['not found'] },
    });

    await page.goto('/profile/ghost_user_xyz');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.profile-page, .user-info')).toBeVisible();
  });

  test('should handle 404 when editing non-existent article', async ({ page }) => {
    await mockLoggedInUser(page);

    await mockApiError(page, '/articles/no-such-article', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/editor/no-such-article');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle unknown frontend routes gracefully', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    // App should not crash — redirect to home or show content
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});

test.describe('Error Scenarios - 500 Internal Server Error', () => {
  test('should handle 500 on article creation', async ({ page }) => {
    await mockLoggedInUser(page);

    await mockApiError(page, '/articles', 500, { errors: { server: ['Internal server error'] } }, 'POST');

    await page.goto('/editor');
    await page.fill('input[formControlName="title"]', 'Server Error Article');
    await page.fill('input[formControlName="description"]', 'Description');
    await page.fill('textarea[formControlName="body"]', 'Body');
    await page.click('button:has-text("Publish")');

    // Should show error, form should remain usable
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 500 on comment posting', async ({ page }) => {
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
      author: { username: 'otheruser', bio: '', image: '', following: false },
    };

    await mockLoggedInUser(page);

    await page.route(`${API_BASE}/articles/test-article`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ article: mockArticle }),
      });
    });
    await page.route(`${API_BASE}/articles/test-article/comments`, route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ comments: [] }),
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { server: ['Database write failed'] } }),
        });
      }
    });

    await page.goto('/article/test-article');
    await page.fill('textarea[placeholder="Write a comment..."]', 'Test comment');
    await page.click('button:has-text("Post Comment")');

    // App should not crash — article content still visible
    await expect(page.locator('.article-content')).toBeVisible();
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle simultaneous 500 on both articles and tags', async ({ page }) => {
    await mockApiError(page, '/articles*', 500, {
      errors: { server: ['Internal server error'] },
    });
    await mockApiError(page, '/tags', 500, {
      errors: { server: ['Internal server error'] },
    });

    await page.goto('/');

    // App should not crash even when both endpoints fail
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.banner')).toBeVisible();
  });

  test('should handle 500 on follow user action', async ({ page }) => {
    const mockProfile = {
      username: 'otheruser',
      bio: 'Test bio',
      image: '',
      following: false,
    };

    await mockLoggedInUser(page);

    await page.route(`${API_BASE}/profiles/otheruser`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: mockProfile }),
      });
    });
    await page.route(`${API_BASE}/articles?author=otheruser*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });
    await page.route(`${API_BASE}/profiles/otheruser/follow`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Failed to follow'] } }),
      });
    });

    await page.goto('/profile/otheruser');
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
    await page.click('button:has-text("Follow")');

    // App should not crash, button should still show Follow
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
    await expect(page.locator('.user-info')).toBeVisible();
  });
});
