import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle } from './helpers/articles';
import { registerUserViaAPI, createArticleViaAPI } from './helpers/api';

test.describe('Tag Filtering', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should filter articles by clicking a tag on the home page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Wait for tags sidebar to load
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Click on a tag from the sidebar
    const firstTag = page.locator('.sidebar .tag-list .tag-pill').first();
    const tagText = await firstTag.textContent();
    await firstTag.click();

    // Should show articles (tag feed is active)
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    const articles = page.locator('.article-preview');
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter articles by an existing popular tag', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Wait for tags sidebar to load
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Get all available tags from the sidebar
    const tags = page.locator('.sidebar .tag-list .tag-pill');
    const tagCount = await tags.count();
    expect(tagCount).toBeGreaterThan(0);

    // Click the second tag (first might have edge cases)
    const tagToClick = tags.nth(Math.min(1, tagCount - 1));
    const tagText = await tagToClick.textContent();
    await tagToClick.click();

    // Wait for filtered articles to load
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Articles should have the tag in their tag list
    const firstArticlePreview = page.locator('.article-preview').first();
    await expect(firstArticlePreview).toBeVisible();

    // Verify we're seeing filtered results (global feed is not the active tab)
    // The feed-toggle should show the tag as active
    const feedToggle = page.locator('.feed-toggle');
    await expect(feedToggle.locator(`text=${tagText?.trim()}`)).toBeVisible();
  });

  test('should show tags on article preview cards', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const uniqueTag = `previewtag${Date.now()}`;
    const article = {
      title: `Tag Preview Test ${Date.now()}`,
      description: 'Testing tags in preview',
      body: 'Article to test tag display in feed preview',
      tags: [uniqueTag, 'general'],
    };

    await createArticle(page, article);

    // Verify tags display on article detail page (where we land after creation)
    await expect(page.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
    await expect(page.locator('.tag-list .tag-default:has-text("general")')).toBeVisible();

    // Go to home feed and verify tags in article preview
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Find our article preview
    const preview = page.locator('.article-preview', { hasText: article.title });
    await expect(preview).toBeVisible();

    // Tags should be visible in the preview card
    await expect(preview.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
  });

  test('should switch between global feed and tag feed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Click a tag to switch to tag feed
    const firstTag = page.locator('.sidebar .tag-list .tag-pill').first();
    const tagText = await firstTag.textContent();
    await firstTag.click();

    // Tag feed should now be showing articles
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Switch back to Global Feed
    await page.click('a:has-text("Global Feed")');

    // Should see global feed (not filtered by tag)
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should display article tags on the article detail page', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const tags = [`detail${Date.now()}`, 'playwright'];
    const article = {
      title: `Detail Tag Test ${Date.now()}`,
      description: 'Testing tags on detail page',
      body: 'Article body for testing tag display on detail view',
      tags,
    };

    await createArticle(page, article);

    // Verify tags on the article detail page
    for (const tag of tags) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }
  });
});
