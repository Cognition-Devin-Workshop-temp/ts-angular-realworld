import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, editArticle, deleteArticle, generateUniqueArticle } from './helpers/articles';

test.describe('Article Lifecycle', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should complete full CRUD lifecycle: create, read, update, delete', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // CREATE
    const article = generateUniqueArticle();
    await createArticle(page, article);
    await expect(page).toHaveURL(/\/article\/.+/);
    const slug = page.url().split('/article/')[1];

    // READ — verify all fields rendered correctly
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(article.body);
    for (const tag of article.tags ?? []) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }
    await expect(page.locator('.article-meta .author').first()).toHaveText(user.username);

    // UPDATE — change title and body via the helper
    const updatedTitle = `Updated ${article.title}`;
    const updatedBody = `Updated body content for ${article.title}`;
    await editArticle(page, slug, { title: updatedTitle, body: updatedBody });
    await expect(page.locator('h1')).toHaveText(updatedTitle);
    await expect(page.locator('.article-content p')).toContainText(updatedBody);

    // DELETE
    await deleteArticle(page);
    await expect(page).toHaveURL('/');
    await expect(page.locator(`h1:has-text("${updatedTitle}")`)).not.toBeVisible();
  });

  test('should create an article without tags', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = { ...generateUniqueArticle(), tags: [] };
    await page.goto('/editor', { waitUntil: 'load' });
    await page.fill('input[formControlName="title"]', article.title);
    await page.fill('input[formControlName="description"]', article.description);
    await page.fill('textarea[formControlName="body"]', article.body);
    await Promise.all([page.waitForURL(/\/article\/.+/), page.click('button:has-text("Publish Article")')]);

    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.tag-list .tag-default')).toHaveCount(0);
  });

  test('should create an article with markdown body and verify rendering', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const markdownBody = '## Subheading\n\nThis is a **bold** paragraph.\n\n- Item 1\n- Item 2';
    const article = {
      ...generateUniqueArticle(),
      body: markdownBody,
    };

    await createArticle(page, article);

    await expect(page.locator('.article-content h2')).toContainText('Subheading');
    await expect(page.locator('.article-content strong')).toContainText('bold');
  });

  test('should preserve article content after page reload', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    await page.reload();

    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(article.body);
  });

  test('should update article description and verify in feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    const slug = page.url().split('/article/')[1];

    const updatedDescription = `New description ${Date.now()}`;
    await page.goto(`/editor/${slug}`, { waitUntil: 'load' });
    // Wait for form to populate with existing article data before editing
    await expect(page.locator('input[formControlName="title"]')).toHaveValue(article.title, {
      timeout: 10000,
    });
    await page.fill('input[formControlName="description"]', '');
    await page.fill('input[formControlName="description"]', updatedDescription);
    await Promise.all([page.waitForURL(/\/article\/.+/), page.click('button:has-text("Publish Article")')]);

    // Go to home and verify the updated description in feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    const preview = page.locator('.article-preview').filter({ hasText: article.title });
    await expect(preview.locator('p')).toContainText(updatedDescription);
  });
});
