import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, editArticle, deleteArticle, generateUniqueArticle } from './helpers/articles';

test.describe('Article Lifecycle — Full CRUD', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should complete full article lifecycle: create → read → update → delete', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // --- CREATE ---
    const article = generateUniqueArticle();
    await createArticle(page, article);
    await expect(page).toHaveURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);

    const slug = page.url().split('/article/')[1];

    // --- READ ---
    // Navigate away and come back to verify persistence
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.goto(`/article/${slug}`, { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(article.body);
    for (const tag of article.tags || []) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }

    // --- UPDATE ---
    const updates = {
      title: `Updated ${article.title}`,
      body: `Updated body for ${article.title}`,
    };
    await editArticle(page, slug, updates);
    await expect(page.locator('h1')).toHaveText(updates.title);
    await expect(page.locator('.article-content p')).toContainText(updates.body);

    // --- DELETE ---
    await deleteArticle(page);
    await expect(page).toHaveURL('/');

    // Verify the article no longer exists by navigating to its URL
    await page.goto(`/article/${slug}`, { waitUntil: 'load' });
    // Article should not render its original title
    await expect(page.locator(`h1:has-text("${updates.title}")`)).not.toBeVisible({ timeout: 3000 });
  });

  test('should create article with multiple tags', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = {
      ...generateUniqueArticle(),
      tags: ['alpha', 'beta', 'gamma'],
    };
    await createArticle(page, article);

    await expect(page).toHaveURL(/\/article\/.+/);
    for (const tag of article.tags) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }
  });

  test('should create article without tags', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = {
      title: `No Tags Article ${Date.now()}`,
      description: 'Article without tags',
      body: 'This article has no tags attached.',
      tags: [],
    };
    await createArticle(page, article);

    await expect(page).toHaveURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);
  });

  test('should show created article on author profile', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Navigate to profile
    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });

    // Wait for the specific article to appear (profile loads articles asynchronously)
    await expect(page.locator(`h1:has-text("${article.title}")`).first()).toBeVisible({ timeout: 10000 });
  });

  test('should update both title and body of an article', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const slug = page.url().split('/article/')[1];

    // Edit both title and body
    const updates = {
      title: `Updated Title ${Date.now()}`,
      body: `Updated body content ${Date.now()}`,
    };
    await editArticle(page, slug, updates);
    await expect(page.locator('h1')).toHaveText(updates.title);
  });
});
