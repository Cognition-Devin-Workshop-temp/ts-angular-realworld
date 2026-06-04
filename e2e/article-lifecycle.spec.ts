import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, editArticle, deleteArticle, generateUniqueArticle } from './helpers/articles';

/**
 * Article Lifecycle Tests
 *
 * End-to-end coverage of the full article CRUD lifecycle:
 * create -> read -> update -> delete, exercised as a single flow
 * and as isolated operations with edge cases.
 */

test.describe('Article Lifecycle', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('full CRUD lifecycle: create, read, update, delete', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // --- CREATE ---
    const article = generateUniqueArticle();
    await createArticle(page, article);
    await expect(page).toHaveURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(article.body);
    for (const tag of article.tags || []) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }

    // --- READ (verify from global feed) ---
    const slug = page.url().split('/article/')[1];
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator(`h1:has-text("${article.title}")`).first()).toBeVisible();

    // Navigate back to article detail
    await page.locator(`h1:has-text("${article.title}")`).first().click();
    await page.waitForURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);

    // --- UPDATE ---
    const updates = {
      title: `Updated ${article.title}`,
      body: `Updated body content for lifecycle test at ${Date.now()}`,
    };
    await editArticle(page, slug, updates);
    await expect(page.locator('h1')).toHaveText(updates.title);
    await expect(page.locator('.article-content p')).toContainText(updates.body);

    // --- DELETE ---
    await deleteArticle(page);
    await expect(page).toHaveURL('/');
    await expect(page.locator(`h1:has-text("${updates.title}")`)).not.toBeVisible();
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

    const article = { ...generateUniqueArticle(), tags: [] };
    await createArticle(page, article);

    await expect(page).toHaveURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);
  });

  test('should update title and description together', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    const slug = page.url().split('/article/')[1];

    const updates = {
      title: `Updated title ${Date.now()}`,
      description: `Updated description ${Date.now()}`,
    };
    await editArticle(page, slug, updates);
    await expect(page.locator('h1')).toHaveText(updates.title);
    // Body should still be rendered
    await expect(page.locator('.article-content')).toBeVisible();
  });

  test('should navigate to editor via edit button on article page', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Click edit article button (wait for it to appear after article page fully loads)
    await page.waitForSelector('a:has-text("Edit Article")', { timeout: 10000 });
    await page.click('a:has-text("Edit Article")');
    await expect(page).toHaveURL(/\/editor\/.+/);

    // Form should be pre-populated
    await expect(page.locator('input[formControlName="title"]')).toHaveValue(article.title);
    await expect(page.locator('input[formControlName="description"]')).toHaveValue(article.description);
  });
});
