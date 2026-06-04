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

  test('should update only article title', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    const slug = page.url().split('/article/')[1];

    const newTitle = `Title-only update ${Date.now()}`;
    await editArticle(page, slug, { title: newTitle });
    await expect(page.locator('h1')).toHaveText(newTitle);
    // Original body should still be present
    await expect(page.locator('.article-content p')).toContainText(article.body);
  });

  test('should update only article body', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    const slug = page.url().split('/article/')[1];

    const newBody = `Body-only update content ${Date.now()}`;
    await editArticle(page, slug, { body: newBody });
    // Title should remain the same
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(newBody);
  });

  test('should show edit and delete buttons only for author', async ({ page, browser }) => {
    const user1 = generateUniqueUser();
    await register(page, user1.username, user1.email, user1.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    const articleUrl = page.url();

    // Author should see edit and delete buttons
    await expect(page.locator('a:has-text("Edit Article")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Delete Article")').first()).toBeVisible();

    // Second user should NOT see edit/delete
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const user2 = generateUniqueUser();
    await register(page2, user2.username, user2.email, user2.password);
    await page2.goto(articleUrl);
    await page2.waitForSelector('h1', { timeout: 10000 });

    await expect(page2.locator('a:has-text("Edit Article")')).not.toBeVisible();
    await expect(page2.locator('button:has-text("Delete Article")')).not.toBeVisible();
    await context2.close();
  });

  test('should navigate to editor via edit button on article page', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Click edit article button
    await page.click('a:has-text("Edit Article")');
    await expect(page).toHaveURL(/\/editor\/.+/);

    // Form should be pre-populated
    await expect(page.locator('input[formControlName="title"]')).toHaveValue(article.title);
    await expect(page.locator('input[formControlName="description"]')).toHaveValue(article.description);
  });
});
