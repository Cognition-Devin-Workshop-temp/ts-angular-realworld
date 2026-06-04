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

async function mockLoggedInUser(page: Page, username = 'testuser') {
  await page.route(`${API_BASE}/user`, route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { username, email: `${username}@test.com`, token: 'fake-token', bio: null, image: null },
        }),
      });
    } else {
      route.continue();
    }
  });
}

test.describe('Error Scenarios — 401 Unauthorized', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should handle 401 when creating an article (expired session)', async ({ page }) => {
    await page.goto('/');
    await setFakeAuthToken(page);
    await mockLoggedInUser(page);

    await mockApiError(page, '/articles', 401, { errors: { message: ['Token expired'] } }, 'POST');

    await page.goto('/editor');
    await page.fill('input[formControlName="title"]', 'Test Article');
    await page.fill('input[formControlName="description"]', 'Test description');
    await page.fill('textarea[formControlName="body"]', 'Test body');
    await page.click('button:has-text("Publish")');

    // Should show error, not crash
    await expect(page.locator('.error-messages')).toBeVisible();
    // Editor form should still be usable
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 401 when deleting an article', async ({ page }) => {
    const mockArticle = {
      slug: 'test-article-401',
      title: 'Test Article 401',
      description: 'Test',
      body: 'Test body content',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'testuser', bio: null, image: null, following: false },
    };

    await page.goto('/');
    await setFakeAuthToken(page);
    await mockLoggedInUser(page);

    await page.route(`${API_BASE}/articles/test-article-401`, route => {
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
          body: JSON.stringify({ errors: { message: ['Unauthorized'] } }),
        });
      } else {
        route.continue();
      }
    });

    await page.route(`${API_BASE}/articles/test-article-401/comments`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });

    await page.goto('/article/test-article-401');
    await expect(page.locator('h1')).toHaveText('Test Article 401');

    // Click delete — should handle gracefully
    await page.click('button:has-text("Delete Article")');

    // App should not crash; nav should still be visible
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 401 when favoriting an article', async ({ page }) => {
    const mockArticle = {
      slug: 'test-fav-401',
      title: 'Favorite 401 Test',
      description: 'Test',
      body: 'Body',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 5,
      author: { username: 'otheruser', bio: null, image: null, following: false },
    };

    await page.goto('/');
    await setFakeAuthToken(page);
    await mockLoggedInUser(page);

    await page.route(`${API_BASE}/articles/test-fav-401`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ article: mockArticle }),
      });
    });
    await page.route(`${API_BASE}/articles/test-fav-401/comments`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });
    await page.route(`${API_BASE}/articles/test-fav-401/favorite`, route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { message: ['Must be logged in'] } }),
      });
    });

    await page.goto('/article/test-fav-401');
    await expect(page.locator('h1')).toHaveText('Favorite 401 Test');

    // Try to favorite
    await page.click('button:has-text("Favorite")');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.article-content')).toBeVisible();
  });
});

test.describe('Error Scenarios — 404 Not Found', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should handle 404 for non-existent article', async ({ page }) => {
    await mockApiError(page, '/articles/this-article-does-not-exist-ever', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/article/this-article-does-not-exist-ever');

    // App should not crash — navbar should still be visible
    await expect(page.locator('nav.navbar')).toBeVisible();
    // Should not show article content
    await expect(page.locator('.article-content')).not.toBeVisible({ timeout: 3000 });
  });

  test('should handle 404 for non-existent user profile', async ({ page }) => {
    await mockApiError(page, '/profiles/nonexistent-user-xyz', 404, {
      errors: { profile: ['not found'] },
    });

    await page.goto('/profile/nonexistent-user-xyz');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 404 when editing non-existent article', async ({ page }) => {
    await page.goto('/');
    await setFakeAuthToken(page);
    await mockLoggedInUser(page);

    await mockApiError(page, '/articles/deleted-article-slug', 404, {
      errors: { article: ['not found'] },
    });

    await page.goto('/editor/deleted-article-slug');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});

test.describe('Error Scenarios — 500 Internal Server Error', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should handle 500 when loading the home feed', async ({ page }) => {
    await mockApiError(page, '/articles*', 500, {
      errors: { server: ['Internal Server Error'] },
    });

    await page.goto('/', { waitUntil: 'load' });

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 500 when creating an article', async ({ page }) => {
    await page.goto('/');
    await setFakeAuthToken(page);
    await mockLoggedInUser(page);

    await mockApiError(page, '/articles', 500, { errors: { server: ['Internal Server Error'] } }, 'POST');

    await page.goto('/editor');
    await page.fill('input[formControlName="title"]', 'Test');
    await page.fill('input[formControlName="description"]', 'Desc');
    await page.fill('textarea[formControlName="body"]', 'Body');
    await page.click('button:has-text("Publish")');

    // Should show error, not crash
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 500 on login attempt', async ({ page }) => {
    await mockApiError(page, '/users/login', 500, {
      errors: { server: ['Internal Server Error'] },
    });

    await page.goto('/login');
    await page.fill('input[formControlName="email"]', 'user@test.com');
    await page.fill('input[formControlName="password"]', 'password');
    await page.click('button[type="submit"]');

    // Should show error message and stay on login page
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should handle 500 on registration attempt', async ({ page }) => {
    await mockApiError(
      page,
      '/users',
      500,
      {
        errors: { server: ['Internal Server Error'] },
      },
      'POST',
    );

    await page.goto('/register');
    await page.fill('input[formControlName="username"]', 'testuser');
    await page.fill('input[formControlName="email"]', 'test@test.com');
    await page.fill('input[formControlName="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should show error and stay on register page
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('should handle 500 when loading comments', async ({ page }) => {
    const mockArticle = {
      slug: 'test-comments-500',
      title: 'Comments 500 Test',
      description: 'Test',
      body: 'Body',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'author', bio: null, image: null, following: false },
    };

    // Use exact URL matching to avoid route conflicts
    await page.route(`${API_BASE}/articles/test-comments-500/comments`, route => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { server: ['Internal Server Error'] } }),
        });
      } else {
        route.continue();
      }
    });

    await page.route(
      url => {
        const urlStr = url.toString();
        return urlStr.includes('/articles/test-comments-500') && !urlStr.includes('/comments');
      },
      route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ article: mockArticle }),
        });
      },
    );

    await page.goto('/article/test-comments-500');

    // App should not crash; navbar should still be visible
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle intermittent 500 then success on retry', async ({ page }) => {
    let callCount = 0;
    await page.route(`${API_BASE}/tags`, route => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { server: ['Internal Server Error'] } }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/', { waitUntil: 'load' });

    // App should not crash on first 500
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});
