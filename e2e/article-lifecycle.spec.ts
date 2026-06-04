import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, editArticle, deleteArticle, generateUniqueArticle } from './helpers/articles';
import { registerUserViaAPI, createArticleViaAPI } from './helpers/api';

/**
 * Article Lifecycle tests — verifies the complete CRUD cycle for articles.
 * Each test exercises create → read → update → delete as an integrated flow,
 * complementing the individual operation tests in articles.spec.ts.
 */

test.describe('Article Lifecycle — Full CRUD', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should complete full create → read → update → delete lifecycle', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // --- CREATE ---
    const article = generateUniqueArticle();
    await createArticle(page, article);

    await expect(page).toHaveURL(/\/article\/.+/);
    await expect(page.locator('h1')).toHaveText(article.title);
    await expect(page.locator('.article-content p')).toContainText(article.body);

    const slug = page.url().split('/article/')[1];

    // --- READ (navigate away and come back) ---
    await page.goto('/');
    await page.goto(`/article/${slug}`, { waitUntil: 'load' });
    await expect(page.locator('h1')).toHaveText(article.title);

    // --- UPDATE ---
    const updatedTitle = `Updated ${article.title}`;
    const updatedBody = `Updated body content for ${article.title}`;
    await editArticle(page, slug, { title: updatedTitle, body: updatedBody });

    await expect(page.locator('h1')).toHaveText(updatedTitle);
    await expect(page.locator('.article-content p')).toContainText(updatedBody);

    // --- DELETE ---
    await deleteArticle(page);
    await expect(page).toHaveURL('/');
  });

  test('should create article with tags and verify they persist', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const uniqueTag = `lc${Date.now().toString(36)}`;
    const article = {
      ...generateUniqueArticle(),
      tags: [uniqueTag],
    };

    await createArticle(page, article);
    await expect(page).toHaveURL(/\/article\/.+/);

    // Tags should be visible on the article page
    await expect(page.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();

    // Reload and verify tags persist
    await page.reload();
    await expect(page.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
  });

  test('should create article via API and read it via UI', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    const uniqueId = Date.now();
    const slug = await createArticleViaAPI(request, token, {
      title: `API Article ${uniqueId}`,
      description: `API-created article ${uniqueId}`,
      body: `This article was created via the API for lifecycle testing ${uniqueId}.`,
      tagList: ['api-created'],
    });

    // Inject token and navigate to the article
    await page.goto('/');
    await page.evaluate(t => {
      localStorage.setItem('jwtToken', t);
    }, token);
    await page.goto(`/article/${slug}`, { waitUntil: 'load' });

    await expect(page.locator('h1')).toHaveText(`API Article ${uniqueId}`);
    await expect(page.locator('.article-content p')).toContainText('created via the API');
    await expect(page.locator('.tag-list .tag-default:has-text("api-created")')).toBeVisible();
  });

  test('should update article title and description', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const slug = page.url().split('/article/')[1];
    const updatedTitle = `Renamed ${article.title}`;
    const updatedDescription = `New description at ${Date.now()}`;
    await editArticle(page, slug, { title: updatedTitle, description: updatedDescription });

    await expect(page.locator('h1')).toHaveText(updatedTitle);
  });

  test('should show article in author profile after creation', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Navigate to author profile
    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });

    // Article should appear in the user's article list
    await expect(page.locator(`.article-preview h1:has-text("${article.title}")`).first()).toBeVisible();
  });

  test('should not show deleted article in author profile', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    await deleteArticle(page);

    // Navigate to author profile
    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });

    // Wait for profile to load
    await page.waitForSelector('.user-info', { timeout: 5000 });

    // Article should not appear
    await expect(page.locator(`h1:has-text("${article.title}")`)).not.toBeVisible();
  });
});
