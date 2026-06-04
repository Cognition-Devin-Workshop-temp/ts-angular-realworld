import { test, expect, Page, Route } from '@playwright/test';

const API_BASE = 'https://api.realworld.show/api';

async function setFakeAuthToken(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('jwtToken', 'fake-token-for-testing');
  });
}

function mockUser(page: Page) {
  return page.route(`${API_BASE}/user`, (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { username: 'testuser', email: 'test@test.com', token: 'fake-token', bio: null, image: null },
      }),
    });
  });
}

/**
 * Error scenario tests focused on verifying graceful handling of
 * 401 Unauthorized, 404 Not Found, and 500 Internal Server Error responses
 * across key user workflows.
 */

test.describe('Error Scenarios — 401 Unauthorized', () => {
  test('should handle 401 when creating an article (expired session)', async ({ page }) => {
    await mockUser(page);
    await page.route(`${API_BASE}/articles`, (route: Route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { message: ['Token has expired'] } }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/editor');

    await page.fill('input[formControlName="title"]', 'Should Fail');
    await page.fill('input[formControlName="description"]', 'Description');
    await page.fill('textarea[formControlName="body"]', 'Body content');
    await page.click('button:has-text("Publish")');

    // App should show error, not crash
    await expect(page.locator('.error-messages')).toBeVisible();
    await expect(page.locator('input[formControlName="title"]')).toBeVisible();
  });

  test('should handle 401 when favoriting an article', async ({ page }) => {
    const mockArticle = {
      slug: 'test-article-401',
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

    await mockUser(page);
    await page.route(`${API_BASE}/articles/test-article-401`, (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ article: mockArticle }),
      });
    });
    await page.route(`${API_BASE}/articles/test-article-401/comments`, (route: Route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ comments: [] }) });
    });
    await page.route(`${API_BASE}/articles/test-article-401/favorite`, (route: Route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { message: ['You must be logged in'] } }),
      });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/article/test-article-401');

    await page.locator('button:has-text("Favorite Article")').first().click();

    // App should not crash — article content should remain visible
    await expect(page.locator('.article-content')).toBeVisible();
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 401 when following a user', async ({ page }) => {
    const mockProfile = {
      username: 'targetuser',
      bio: 'Test bio',
      image: '',
      following: false,
    };

    await mockUser(page);
    await page.route(`${API_BASE}/profiles/targetuser`, (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: mockProfile }),
      });
    });
    await page.route(`${API_BASE}/articles?author=targetuser*`, (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], articlesCount: 0 }),
      });
    });
    await page.route(`${API_BASE}/profiles/targetuser/follow`, (route: Route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { message: ['Session expired'] } }),
      });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/profile/targetuser');

    await page.click('button:has-text("Follow")');

    // Should not crash, button should remain in Follow state
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
    await expect(page.locator('.user-info')).toBeVisible();
  });
});

test.describe('Error Scenarios — 404 Not Found', () => {
  test('should handle 404 for non-existent article gracefully', async ({ page }) => {
    await page.route(`${API_BASE}/articles/does-not-exist-slug`, (route: Route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { article: ['not found'] } }),
      });
    });

    await page.goto('/article/does-not-exist-slug');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.article-page')).toBeVisible();
  });

  test('should handle 404 for non-existent user profile gracefully', async ({ page }) => {
    await page.route(`${API_BASE}/profiles/ghost-user-xyz`, (route: Route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { profile: ['not found'] } }),
      });
    });

    await page.goto('/profile/ghost-user-xyz');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.profile-page')).toBeVisible();
  });

  test('should handle 404 when editing non-existent article', async ({ page }) => {
    await mockUser(page);
    await page.route(`${API_BASE}/articles/nonexistent-edit`, (route: Route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { article: ['not found'] } }),
      });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/editor/nonexistent-edit');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 404 when deleting already-deleted article', async ({ page }) => {
    const mockArticle = {
      slug: 'to-be-deleted',
      title: 'Already Deleted',
      description: 'Gone',
      body: 'This article was already deleted.',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'testuser', bio: '', image: '', following: false },
    };

    await mockUser(page);
    await page.route(`${API_BASE}/articles/to-be-deleted`, (route: Route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ article: mockArticle }),
        });
      } else if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ errors: { article: ['not found'] } }),
        });
      } else {
        route.continue();
      }
    });
    await page.route(`${API_BASE}/articles/to-be-deleted/comments`, (route: Route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ comments: [] }) });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/article/to-be-deleted');

    await expect(page.locator('h1')).toHaveText('Already Deleted');
    await page.click('button:has-text("Delete Article")');

    // App should not crash
    await expect(page.locator('nav.navbar')).toBeVisible();
  });
});

test.describe('Error Scenarios — 500 Internal Server Error', () => {
  test('should handle 500 when loading article comments', async ({ page }) => {
    const mockArticle = {
      slug: 'server-error-article',
      title: 'Article With Broken Comments',
      description: 'Test',
      body: 'The comments endpoint returns 500.',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'testuser', bio: '', image: '', following: false },
    };

    await page.route(`${API_BASE}/articles/server-error-article`, (route: Route) => {
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
    await page.route(`${API_BASE}/articles/server-error-article/comments`, (route: Route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Database connection lost'] } }),
      });
    });

    await page.goto('/article/server-error-article');

    // App should not crash despite comments failing
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.article-page')).toBeVisible();
  });

  test('should handle 500 when favoriting an article', async ({ page }) => {
    const mockArticle = {
      slug: 'fav-500-article',
      title: 'Favorite 500 Test',
      description: 'Test',
      body: 'Favoriting this article triggers a 500.',
      tagList: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorited: false,
      favoritesCount: 0,
      author: { username: 'otheruser', bio: '', image: '', following: false },
    };

    await mockUser(page);
    await page.route(`${API_BASE}/articles/fav-500-article`, (route: Route) => {
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
    await page.route(`${API_BASE}/articles/fav-500-article/comments`, (route: Route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ comments: [] }) });
    });
    await page.route(`${API_BASE}/articles/fav-500-article/favorite`, (route: Route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Internal server error'] } }),
      });
    });

    await page.goto('/');
    await setFakeAuthToken(page);
    await page.goto('/article/fav-500-article');

    await page.locator('button:has-text("Favorite Article")').first().click();

    // App should not crash, article content still visible
    await expect(page.locator('.article-page')).toBeVisible();
    await expect(page.locator('nav.navbar')).toBeVisible();
  });

  test('should handle 500 when loading user profile articles', async ({ page }) => {
    await page.route(`${API_BASE}/profiles/broken-user`, (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: { username: 'broken-user', bio: 'Bio text', image: '', following: false },
        }),
      });
    });
    await page.route(`${API_BASE}/articles?author=broken-user*`, (route: Route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Failed to fetch articles'] } }),
      });
    });

    await page.goto('/profile/broken-user');

    // Profile info should still render despite articles failing
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.profile-page')).toBeVisible();
  });

  test('should recover from 500 on home page and still show navigation', async ({ page }) => {
    // Both articles and tags fail with 500
    await page.route(`${API_BASE}/articles*`, (route: Route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Everything is broken'] } }),
      });
    });
    await page.route(`${API_BASE}/tags`, (route: Route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: { server: ['Tags service down'] } }),
      });
    });

    await page.goto('/');

    // Core layout should survive
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('.banner')).toBeVisible();
    await expect(page.locator('.navbar-brand')).toBeVisible();

    // Sign in / Sign up links should still work
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });
});
