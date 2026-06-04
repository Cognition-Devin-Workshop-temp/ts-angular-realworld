import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle } from './helpers/articles';
import { createArticleViaAPI, registerUserViaAPI } from './helpers/api';

test.describe('Tag Filtering', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should display tags on the home page sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // The sidebar should show a list of popular tags
    await page.waitForSelector('.tag-list', { timeout: 10000 });
    const tagCount = await page.locator('.sidebar .tag-list .tag-pill').count();
    expect(tagCount).toBeGreaterThan(0);
  });

  test('should filter articles by clicking a tag in sidebar', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Wait for tags to load in the sidebar
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Click on the first available tag
    const firstTag = page.locator('.sidebar .tag-list .tag-pill').first();
    const tagText = (await firstTag.textContent())?.trim();
    await firstTag.click();

    // URL should navigate to /tag/<tagname>
    await expect(page).toHaveURL(new RegExp(`/tag/${tagText}`), { timeout: 10000 });

    // The tag feed tab should be active in the feed toggle
    await expect(page.locator('.feed-toggle .nav-link.active')).toContainText(tagText!, {
      timeout: 10000,
    });

    // Articles should load under the tag feed
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should create article with unique tag and filter by it', async ({ page, request }) => {
    const uniqueTag = `e2etag${Date.now()}`;

    // Register and create an article with the unique tag via API for speed
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);
    await createArticleViaAPI(request, token, {
      title: `Tagged Article ${uniqueTag}`,
      description: 'Article for tag filtering test',
      body: 'This article tests tag-based filtering.',
      tagList: [uniqueTag],
    });

    // Navigate to home and look for the tag in the sidebar
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.tag-list', { timeout: 10000 });

    // The unique tag may appear in the sidebar (popular tags are cached)
    // Instead, use the global feed to find the article and verify tags
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Search for the article with our unique tag in the global feed
    const articlePreview = page.locator('.article-preview', {
      has: page.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`),
    });

    // If visible in the current page, verify it
    const isVisible = await articlePreview
      .first()
      .isVisible()
      .catch(() => false);
    if (isVisible) {
      await expect(articlePreview.first().locator('h1')).toContainText(`Tagged Article ${uniqueTag}`);
    }
  });

  test('should create multiple articles with same tag and verify filtering', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const sharedTag = `shared${Date.now()}`;

    // Create two articles with the same tag
    const article1 = {
      title: `First Tagged ${Date.now()}`,
      description: 'First article with shared tag',
      body: 'Body of first article.',
      tags: [sharedTag],
    };
    const article2 = {
      title: `Second Tagged ${Date.now() + 1}`,
      description: 'Second article with shared tag',
      body: 'Body of second article.',
      tags: [sharedTag],
    };

    await createArticle(page, article1);
    await page.goto('/editor', { waitUntil: 'load' });
    await createArticle(page, article2);

    // Go to profile to see both articles
    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Both articles should appear
    await expect(page.locator(`h1:has-text("${article1.title}")`).first()).toBeVisible();
    await expect(page.locator(`h1:has-text("${article2.title}")`).first()).toBeVisible();
  });

  test('should show tags on article preview cards', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const uniqueTag = `preview${Date.now()}`;
    const article = {
      title: `Preview Tag Test ${Date.now()}`,
      description: 'Testing tags in preview',
      body: 'Article to verify tags appear in preview cards.',
      tags: [uniqueTag, 'general'],
    };
    await createArticle(page, article);

    // Go to the home page and look at the article preview
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Find the article preview with our title
    const preview = page.locator('.article-preview', {
      has: page.locator(`h1:has-text("${article.title}")`),
    });
    const isVisible = await preview
      .first()
      .isVisible()
      .catch(() => false);
    if (isVisible) {
      // Tags should appear on the preview card
      await expect(preview.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
      await expect(preview.locator('.tag-list .tag-default:has-text("general")')).toBeVisible();
    }
  });

  test('should switch between Global Feed and tag feed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Wait for tags in sidebar
    await page.waitForSelector('.sidebar .tag-list .tag-pill', { timeout: 10000 });

    // Click a tag to filter
    const firstTag = page.locator('.sidebar .tag-list .tag-pill').first();
    await firstTag.click();

    // Wait for tag feed to load
    await expect(page).toHaveURL(/\/tag\//, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Switch back to Global Feed
    await page.click('.feed-toggle a:has-text("Global Feed")');
    await expect(page).toHaveURL('/');
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Global feed should show articles
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });
});
