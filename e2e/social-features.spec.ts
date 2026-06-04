import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, generateUniqueArticle, favoriteArticle, unfavoriteArticle } from './helpers/articles';
import { followUser, unfollowUser } from './helpers/profile';
import { addComment, deleteComment, getCommentCount } from './helpers/comments';

/**
 * Social Features Tests
 *
 * Covers follow/unfollow users, favorite/unfavorite articles,
 * and commenting on articles as integrated social workflows.
 */

test.describe('Social Features - Follow User', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should follow a user and see their articles in Your Feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe (demo backend user with articles)
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Go to Your Feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.feed-toggle', { timeout: 10000 });
    await page.click('a:has-text("Your Feed")');
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Should see johndoe's articles
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should unfollow a user and not see their articles in Your Feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow then unfollow
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();
    await unfollowUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();

    // Your Feed should be empty now
    await page.goto('/?feed=following', { waitUntil: 'load' });
    await page.waitForSelector('.empty-feed-message', { timeout: 10000 });
    await expect(page.locator('.empty-feed-message')).toContainText('Your feed is empty');
  });

  test('should not show follow button on own profile', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });
    await page.waitForSelector('h4', { timeout: 10000 });
    await expect(page.locator('h4')).toHaveText(user.username);
    await expect(page.locator('button:has-text("Follow")')).not.toBeVisible();
  });
});

test.describe('Social Features - Favorite Article', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should favorite an article and see updated count', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Go to global feed and click on an article from another user
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.click('.article-preview h1');
    await page.waitForURL(/\/article\/.+/);
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });

    // If already favorited, unfavorite first to get a clean state
    const alreadyFavorited = (await page.locator('button:has-text("Unfavorite")').count()) > 0;
    if (alreadyFavorited) {
      await unfavoriteArticle(page);
    }

    // Get initial count
    const btnText = await page.locator('button:has-text("Favorite")').first().textContent();
    const initialCount = parseInt(btnText?.match(/\((\d+)\)/)?.[1] || '0');

    // Favorite the article
    await favoriteArticle(page);
    await expect(page.locator('button:has-text("Unfavorite")').first()).toBeVisible();

    // Count should increase
    const updatedText = await page.locator('button:has-text("Unfavorite")').first().textContent();
    const updatedCount = parseInt(updatedText?.match(/\((\d+)\)/)?.[1] || '0');
    expect(updatedCount).toBe(initialCount + 1);
  });

  test('should unfavorite an article and see updated count', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.click('.article-preview h1');
    await page.waitForURL(/\/article\/.+/);
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });

    // Ensure the article is favorited
    const isFavorited = (await page.locator('button:has-text("Unfavorite")').count()) > 0;
    if (!isFavorited) {
      await favoriteArticle(page);
    }

    // Get count before unfavoriting
    const btnText = await page.locator('button:has-text("Unfavorite")').first().textContent();
    const countBefore = parseInt(btnText?.match(/\((\d+)\)/)?.[1] || '0');

    // Unfavorite
    await unfavoriteArticle(page);
    await expect(page.locator('button:has-text("Favorite")').first()).toBeVisible();

    const updatedText = await page.locator('button:has-text("Favorite")').first().textContent();
    const updatedCount = parseInt(updatedText?.match(/\((\d+)\)/)?.[1] || '0');
    expect(updatedCount).toBe(countBefore - 1);
  });

  test('should show favorited articles on profile Favorited tab', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Favorite an article from the global feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.click('.article-preview h1');
    await page.waitForURL(/\/article\/.+/);
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });

    const isFavorited = (await page.locator('button:has-text("Unfavorite")').count()) > 0;
    if (!isFavorited) {
      await favoriteArticle(page);
    }

    // Go to profile Favorited tab
    await page.goto(`/profile/${user.username}/favorites`, { waitUntil: 'load' });
    await expect(page.locator('.article-preview').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Social Features - Comments', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should add a comment to an article', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const commentText = `Social features comment ${Date.now()}`;
    await addComment(page, commentText);
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();
  });

  test('should delete own comment', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const commentText = `Comment to delete ${Date.now()}`;
    await addComment(page, commentText);
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();

    await deleteComment(page, commentText);
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).not.toBeVisible();
  });

  test('should add multiple comments and verify count', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    await addComment(page, 'First social comment');
    await addComment(page, 'Second social comment');
    await addComment(page, 'Third social comment');

    const count = await getCommentCount(page);
    expect(count).toBe(3);
  });

  test('should show sign-in prompt for unauthenticated users', async ({ page, browser }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);
    const articleUrl = page.url();

    // View article as unauthenticated user
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(articleUrl, { waitUntil: 'load' });
    await page2.waitForSelector('a[href="/login"], textarea[placeholder="Write a comment..."]', { timeout: 10000 });

    await expect(page2.locator('a[href="/login"]')).toBeVisible();
    await expect(page2.locator('textarea[placeholder="Write a comment..."]')).not.toBeVisible();
    await context2.close();
  });
});
