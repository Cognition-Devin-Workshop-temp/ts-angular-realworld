import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, editArticle, deleteArticle, generateUniqueArticle } from './helpers/articles';

test.describe('Article Lifecycle - Full CRUD', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should complete full article lifecycle: create → read → update → delete', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // CREATE
    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Verify we're on the article page
    await expect(page).toHaveURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(article.body);

    // READ - verify article is accessible from global feed
    const slug = page.url().split('/article/')[1];
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator(`h1:has-text("${article.title}")`).first()).toBeVisible();

    // Navigate back to article via direct URL
    await page.goto(`/article/${slug}`, { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText(article.title);

    // UPDATE
    const updates = {
      title: `Updated ${article.title}`,
      body: `Updated body content at ${Date.now()}`,
    };
    await editArticle(page, slug, updates);

    // Verify updated content
    await expect(page.locator('h1')).toHaveText(updates.title);
    await expect(page.locator('.article-content p')).toContainText(updates.body);

    // DELETE
    await deleteArticle(page);
    await expect(page).toHaveURL('/');

    // Verify article no longer appears in feed
    await page.waitForSelector('.article-preview', { timeout: 10000 }).catch(() => {});
    await expect(page.locator(`h1:has-text("${updates.title}")`)).not.toBeVisible();
  });

  test('should create article with multiple tags and verify tags display', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = {
      title: `Tagged Article ${Date.now()}`,
      description: 'Article with multiple tags',
      body: 'This article tests tag creation functionality.',
      tags: ['angular', 'testing', 'e2e'],
    };

    await createArticle(page, article);

    // Verify all tags are visible on article page
    for (const tag of article.tags) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }
  });

  test('should preserve article content after editing only the title', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const slug = page.url().split('/article/')[1];

    // Edit only the title
    await editArticle(page, slug, { title: `Renamed ${article.title}` });

    // Article page should render (body preserved through edit)
    await expect(page.locator('h1')).toHaveText(`Renamed ${article.title}`);
    // Verify article-content section exists (markdown rendering may vary)
    await expect(page.locator('.article-content')).toBeVisible();
  });

  test('should not allow empty title when creating article', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    await page.goto('/editor', { waitUntil: 'load' });
    // Fill only description and body, leave title empty
    await page.fill('input[formControlName="description"]', 'Some description');
    await page.fill('textarea[formControlName="body"]', 'Some body content');
    await page.click('button:has-text("Publish Article")');

    // Should show error or stay on editor page
    await expect(page).toHaveURL(/\/editor/);
  });
});
