import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, generateUniqueArticle } from './helpers/articles';
import { registerUserViaAPI, createArticleViaAPI } from './helpers/api';

/**
 * Tag Filtering Tests
 *
 * Verifies tag-based article filtering: creating tagged articles,
 * sidebar tag display, clicking tags to filter, and URL-based
 * tag navigation.
 */

test.describe('Tag Filtering', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should display popular tags in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.sidebar .tag-list', { timeout: 10000 });

    const tagCount = await page.locator('.sidebar .tag-list .tag-pill').count();
    expect(tagCount).toBeGreaterThan(0);
  });

  test('should filter articles when clicking a tag in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Get the text of the first tag
    const tagText = await page.locator('.sidebar .tag-list .tag-pill').first().textContent();
    expect(tagText).toBeTruthy();

    // Click the tag
    await page.click('.sidebar .tag-list .tag-pill:first-child');

    // Should show the tag as an active tab
    await expect(page.locator(`.nav-link:has-text("${tagText?.trim()}")`)).toBeVisible();
    await expect(page.locator(`.nav-link:has-text("${tagText?.trim()}")`)).toHaveClass(/active/);
  });

  test('should filter articles by tag via URL navigation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.sidebar .tag-list', { timeout: 10000 });

    // Get a tag from the sidebar
    const tagText = await page.locator('.sidebar .tag-list .tag-pill').first().textContent();
    expect(tagText).toBeTruthy();

    // Navigate directly to tag URL
    await page.goto(`/tag/${tagText?.trim()}`, { waitUntil: 'load' });

    // Should show the tag filter active
    await expect(page.locator(`.nav-link:has-text("${tagText?.trim()}")`)).toBeVisible();
    await expect(page.locator(`.nav-link:has-text("${tagText?.trim()}")`)).toHaveClass(/active/);
  });

  test('should create articles with tags and verify they appear', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const uniqueTag = `e2etag${Date.now()}`;
    const article = {
      ...generateUniqueArticle(),
      tags: [uniqueTag, 'test'],
    };

    await createArticle(page, article);

    // Verify tags are shown on the article page
    await expect(page.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
    await expect(page.locator('.tag-list .tag-default:has-text("test")')).toBeVisible();
  });

  test('should show articles with specific tag via API-created articles', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);
    const uniqueTag = `filtertag${Date.now()}`;

    // Create 2 articles with the unique tag via API
    await createArticleViaAPI(request, token, {
      title: `Tagged Article One ${Date.now()}`,
      description: 'First tagged article',
      body: 'Body of first tagged article',
      tagList: [uniqueTag],
    });
    await createArticleViaAPI(request, token, {
      title: `Tagged Article Two ${Date.now()}`,
      description: 'Second tagged article',
      body: 'Body of second tagged article',
      tagList: [uniqueTag],
    });

    // Navigate to the tag page
    await page.goto(`/tag/${uniqueTag}`, { waitUntil: 'load' });

    // Should show the tag filter active
    await expect(page.locator(`.nav-link:has-text("${uniqueTag}")`)).toHaveClass(/active/);

    // Should show articles with this tag
    await expect(page.locator('.article-preview').first()).toBeVisible({ timeout: 10000 });
    const articleCount = await page.locator('.article-preview').count();
    expect(articleCount).toBeGreaterThanOrEqual(2);
  });

  test('should switch from tag filter back to Global Feed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Click a tag
    await page.click('.sidebar .tag-list .tag-pill:first-child');

    // Verify tag tab is active
    const tagLinks = page.locator('.feed-toggle .nav-link');
    const tagTabCount = await tagLinks.count();
    expect(tagTabCount).toBeGreaterThanOrEqual(2);

    // Switch back to Global Feed
    await page.click('a:has-text("Global Feed")');
    await expect(page.locator('.nav-link:has-text("Global Feed")')).toHaveClass(/active/);
    await expect(page).toHaveURL('/');
  });

  test('should display tags on article previews in the feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = {
      ...generateUniqueArticle(),
      tags: ['visible-tag-1', 'visible-tag-2'],
    };
    await createArticle(page, article);

    // Go to home feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Find our article preview
    const preview = page.locator('.article-preview', { has: page.locator(`h1:has-text("${article.title}")`) });
    await expect(preview).toBeVisible();

    // Tags should be displayed in the preview
    await expect(preview.locator('.tag-list .tag-default:has-text("visible-tag-1")')).toBeVisible();
    await expect(preview.locator('.tag-list .tag-default:has-text("visible-tag-2")')).toBeVisible();
  });
});
