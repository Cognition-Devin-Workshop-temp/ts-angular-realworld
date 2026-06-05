import { test, expect } from '@playwright/test';
import { generateUniqueUser } from './helpers/auth';
import { registerUserViaAPI, createArticleViaAPI } from './helpers/api';

function shortId(): string {
  return Math.random().toString(36).substring(2, 8);
}

async function loginViaToken(page: import('@playwright/test').Page, token: string) {
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(t => {
    window.localStorage['jwtToken'] = t;
  }, token);
  await page.reload({ waitUntil: 'load' });
}

test.describe('Tag Filtering', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should filter articles by clicking a tag in the sidebar', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    const uniqueTag = `ftag${shortId()}`;
    const articleTitle = `Tagged ${shortId()}`;
    await createArticleViaAPI(request, token, {
      title: articleTitle,
      description: 'Article with a unique tag',
      body: 'Body for tagged article',
      tagList: [uniqueTag],
    });

    // Inject auth and go home
    await loginViaToken(page, token);
    await page.waitForSelector('.sidebar .tag-list', { timeout: 15000 });

    // Our unique tag should appear in the sidebar
    const tagLink = page.locator(`.sidebar .tag-list a:has-text("${uniqueTag}")`);
    await expect(tagLink).toBeVisible({ timeout: 10000 });

    // Click the tag to filter
    await tagLink.click();

    // A new tab should appear in the feed toggle for this tag
    await expect(page.locator(`.feed-toggle a:has-text("${uniqueTag}")`)).toBeVisible({
      timeout: 10000,
    });

    // The tagged article should be visible
    await page.waitForSelector('.article-preview', { timeout: 10000 });
  });

  test('should return to global feed after clearing tag filter', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    const uniqueTag = `ctag${shortId()}`;
    await createArticleViaAPI(request, token, {
      title: `ClearFilter ${shortId()}`,
      description: 'Article for clear filter test',
      body: 'Body content',
      tagList: [uniqueTag],
    });

    await loginViaToken(page, token);
    await page.waitForSelector('.sidebar .tag-list', { timeout: 15000 });

    // Click the tag
    const tagLink = page.locator(`.sidebar .tag-list a:has-text("${uniqueTag}")`);
    await expect(tagLink).toBeVisible({ timeout: 10000 });
    await tagLink.click();
    await expect(page.locator(`.feed-toggle a:has-text("${uniqueTag}")`)).toBeVisible({
      timeout: 10000,
    });

    // Click "Global Feed" to clear the filter
    await page.click('a:has-text("Global Feed")');

    // Tag tab should no longer be active / feed shows all articles
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should show articles with multiple tags', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    const tag1 = `ma${shortId()}`;
    const tag2 = `mb${shortId()}`;
    const articleTitle = `MultiTag ${shortId()}`;
    const slug = await createArticleViaAPI(request, token, {
      title: articleTitle,
      description: 'Article with multiple tags',
      body: 'Body content for multi-tag article',
      tagList: [tag1, tag2],
    });

    // Navigate to the article to verify both tags
    await loginViaToken(page, token);
    await page.goto(`/article/${slug}`, { waitUntil: 'load' });
    await expect(page.locator(`.tag-list .tag-default:has-text("${tag1}")`)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator(`.tag-list .tag-default:has-text("${tag2}")`)).toBeVisible({
      timeout: 10000,
    });

    // Go home and filter by first tag
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.sidebar .tag-list', { timeout: 15000 });
    const tagLink = page.locator(`.sidebar .tag-list a:has-text("${tag1}")`);
    await expect(tagLink).toBeVisible({ timeout: 10000 });
    await tagLink.click();

    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator(`.article-preview h1:has-text("${articleTitle}")`)).toBeVisible();
  });

  test('should show tags in the article preview on the feed', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    const uniqueTag = `ptag${shortId()}`;
    const articleTitle = `Preview ${shortId()}`;
    await createArticleViaAPI(request, token, {
      title: articleTitle,
      description: 'Testing tag display in preview',
      body: 'Body content',
      tagList: [uniqueTag],
    });

    // Go to global feed
    await loginViaToken(page, token);
    await page.waitForSelector('.article-preview', { timeout: 15000 });

    // Find our article's preview
    const preview = page.locator('.article-preview').filter({ hasText: articleTitle });
    await expect(preview).toBeVisible({ timeout: 10000 });
    // Tag should be visible in the preview's tag list
    await expect(preview.locator(`.tag-list .tag-default:has-text("${uniqueTag}")`)).toBeVisible();
  });

  test('should filter by existing popular tag from sidebar', async ({ page, request }) => {
    const user = generateUniqueUser();
    const token = await registerUserViaAPI(request, user);

    await loginViaToken(page, token);
    await page.waitForSelector('.sidebar .tag-list a', { timeout: 15000 });

    // Click the first available tag in the sidebar
    const firstTag = page.locator('.sidebar .tag-list a').first();
    const tagText = await firstTag.textContent();
    await firstTag.click();

    // Should show the tag tab and filtered results
    await expect(page.locator(`.feed-toggle a:has-text("${tagText?.trim()}")`)).toBeVisible({
      timeout: 10000,
    });
    // Articles should appear (popular tags have content)
    await expect(page.locator('.article-preview').first()).toBeVisible({ timeout: 10000 });
  });
});
