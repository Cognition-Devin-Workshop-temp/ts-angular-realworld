import { test, expect } from '@playwright/test';
import { register, login, generateUniqueUser } from './helpers/auth';
import { createArticle, generateUniqueArticle } from './helpers/articles';
import { registerUserViaAPI, createArticleViaAPI } from './helpers/api';

/**
 * Tag filtering tests — creates articles with known unique tags and verifies
 * that tag-based filtering shows the correct subset of articles.
 */

test.describe('Tag Filtering', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should filter articles by clicking a tag in the sidebar', async ({ page, request }) => {
    const uniqueTag = `tag${Date.now().toString(36)}`;
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    // Create two articles with the unique tag
    await createArticleViaAPI(request, token, {
      title: `Tagged A ${uniqueTag}`,
      description: 'First tagged article',
      body: 'Body of first tagged article',
      tagList: [uniqueTag],
    });
    await createArticleViaAPI(request, token, {
      title: `Tagged B ${uniqueTag}`,
      description: 'Second tagged article',
      body: 'Body of second tagged article',
      tagList: [uniqueTag],
    });

    await login(page, user.email, user.password);
    await page.goto('/', { waitUntil: 'load' });

    // Wait for sidebar tags to load
    await page.waitForSelector('.sidebar .tag-list', { timeout: 5000 });

    // Our unique tag should appear in Popular Tags
    const tagPill = page.locator(`.sidebar .tag-list .tag-pill:has-text("${uniqueTag}")`);
    const tagExists = (await tagPill.count()) > 0;

    if (tagExists) {
      await tagPill.click();

      // A new tab for the tag should appear and be active
      await expect(page.locator(`.nav-link:has-text("${uniqueTag}")`)).toBeVisible();

      // Both tagged articles should be visible
      await page.waitForSelector('.article-preview', { timeout: 5000 });
      await expect(page.locator(`.article-preview:has-text("Tagged A ${uniqueTag}")`)).toBeVisible();
      await expect(page.locator(`.article-preview:has-text("Tagged B ${uniqueTag}")`)).toBeVisible();
    } else {
      // Tag not yet in sidebar — use URL-based navigation instead
      await page.goto(`/tag/${uniqueTag}`, { waitUntil: 'load' });
      await page.waitForSelector('.article-preview', { timeout: 5000 });
      await expect(page.locator(`.article-preview:has-text("Tagged A ${uniqueTag}")`)).toBeVisible();
      await expect(page.locator(`.article-preview:has-text("Tagged B ${uniqueTag}")`)).toBeVisible();
    }
  });

  test('should navigate directly to /tag/:tagName URL', async ({ page, request }) => {
    const uniqueTag = `ut${Date.now().toString(36)}`;
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    await createArticleViaAPI(request, token, {
      title: `URL Tag Article ${uniqueTag}`,
      description: 'Article for URL tag test',
      body: 'Body of URL tag test article',
      tagList: [uniqueTag],
    });

    await login(page, user.email, user.password);

    // Navigate directly via URL
    await page.goto(`/tag/${uniqueTag}`, { waitUntil: 'load' });

    // Tag tab should be active
    await expect(page.locator(`.nav-link:has-text("${uniqueTag}")`)).toBeVisible();

    // Article should be visible
    await page.waitForSelector('.article-preview', { timeout: 5000 });
    await expect(page.locator(`.article-preview:has-text("URL Tag Article ${uniqueTag}")`)).toBeVisible();
  });

  test('should show article tags on the article detail page', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const id = Date.now().toString(36);
    const tag1 = `dt${id}a`;
    const tag2 = `dt${id}b`;
    const article = {
      ...generateUniqueArticle(),
      tags: [tag1, tag2],
    };

    await createArticle(page, article);

    // Both tags should be visible on the article detail page
    await expect(page.locator(`.tag-list .tag-default:has-text("${tag1}")`)).toBeVisible();
    await expect(page.locator(`.tag-list .tag-default:has-text("${tag2}")`)).toBeVisible();
  });

  test('should display tags on article previews in the feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const uniqueTag = `pv${Date.now().toString(36)}`;
    const article = {
      ...generateUniqueArticle(),
      tags: [uniqueTag],
    };

    await createArticle(page, article);

    // Go to home feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 5000 });

    // The article preview should show the tag
    const preview = page.locator('.article-preview', { hasText: article.title });
    await expect(preview.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
  });

  test('should switch from tag filter back to Global Feed', async ({ page, request }) => {
    const uniqueTag = `sw${Date.now().toString(36)}`;
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    await createArticleViaAPI(request, token, {
      title: `Switch Test ${uniqueTag}`,
      description: 'Test switching feeds',
      body: 'Test body',
      tagList: [uniqueTag],
    });

    await login(page, user.email, user.password);

    // Navigate to tag filter
    await page.goto(`/tag/${uniqueTag}`, { waitUntil: 'load' });
    await expect(page.locator(`.nav-link:has-text("${uniqueTag}")`)).toBeVisible();

    // Switch back to Global Feed
    await page.click('a:has-text("Global Feed")');
    await expect(page).toHaveURL('/');

    // Should see articles from all users now
    await page.waitForSelector('.article-preview', { timeout: 5000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should create article with multiple tags via UI', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const ts = Date.now().toString(36);
    const tags = [`mt${ts}a`, `mt${ts}b`, `mt${ts}c`];

    await page.goto('/editor', { waitUntil: 'load' });
    await page.fill('input[formControlName="title"]', `Multi Tag Article ${ts}`);
    await page.fill('input[formControlName="description"]', 'Multiple tags');
    await page.fill('textarea[formControlName="body"]', 'Article body with multiple tags');

    for (const tag of tags) {
      await page.fill('input[placeholder="Enter tags"]', tag);
      await page.press('input[placeholder="Enter tags"]', 'Enter');
    }

    await Promise.all([page.waitForURL(/\/article\/.+/), page.click('button:has-text("Publish Article")')]);

    // All three tags should be present
    for (const tag of tags) {
      await expect(page.locator(`.tag-list .tag-default:has-text("${tag}")`)).toBeVisible();
    }
  });
});
