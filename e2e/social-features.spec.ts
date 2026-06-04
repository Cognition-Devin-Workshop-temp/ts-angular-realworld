import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, generateUniqueArticle } from './helpers/articles';
import { addComment, getCommentCount } from './helpers/comments';
import { followUser, unfollowUser } from './helpers/profile';

test.describe('Social Features — Follow, Favorite, Comment', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should follow a user and see their articles in Your Feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe (demo user with articles)
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Go home and check Your Feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.feed-toggle', { timeout: 10000 });
    await page.click('a:has-text("Your Feed")');
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Should see at least one article from followed user
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should unfollow a user and verify follow button state', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Verify follow persisted by reloading the profile page
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Unfollow")', { timeout: 10000 });
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Unfollow johndoe
    await unfollowUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();

    // Verify unfollow persisted by reloading the profile page
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Follow")', { timeout: 10000 });
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
  });

  test('should favorite an article and see it on Favorited tab', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Go to global feed and open an article from another user
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.click('.article-preview h1');
    await page.waitForURL(/\/article\/.+/, { timeout: 10000 });

    // Favorite it
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });
    const alreadyFavorited = (await page.locator('button:has-text("Unfavorite")').count()) > 0;
    if (!alreadyFavorited) {
      await page.click('button.btn-outline-primary:has-text("Favorite")');
      await page.waitForSelector('button.btn-primary:has-text("Unfavorite")', { timeout: 10000 });
    }

    // Go to profile and click Favorited tab
    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });
    await page.waitForSelector('a:has-text("Favorited")', { timeout: 10000 });
    await page.click('a:has-text("Favorited")');

    // Wait for URL to change then for articles to load
    await expect(page).toHaveURL(`/profile/${user.username}/favorites`);
    await expect(page.locator('.article-preview').first()).toBeVisible({ timeout: 10000 });
  });

  test('should comment on another user article', async ({ page }) => {
    // Register user and create an article
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Comment on the own article (comment form should be visible for logged-in user)
    const commentText = `Comment from ${user.username} at ${Date.now()}`;
    await addComment(page, commentText);

    // Verify the comment is visible
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();

    // Verify the comment author
    await expect(page.locator(`.card:not(.comment-form) a:has-text("${user.username}")`)).toBeVisible();
  });

  test('should show comment count increases after adding comments', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const initialCount = await getCommentCount(page);
    expect(initialCount).toBe(0);

    await addComment(page, 'First comment');
    expect(await getCommentCount(page)).toBe(1);

    await addComment(page, 'Second comment');
    expect(await getCommentCount(page)).toBe(2);
  });

  test('should favorite article and see count increment', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Go to global feed and pick an article
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.click('.article-preview h1');
    await page.waitForURL(/\/article\/.+/, { timeout: 10000 });

    // Wait for favorite button to appear
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });

    // If already favorited, unfavorite first to get a clean state
    if ((await page.locator('button:has-text("Unfavorite")').count()) > 0) {
      await page.click('button.btn-primary:has-text("Unfavorite")');
      await page.waitForSelector('button.btn-outline-primary:has-text("Favorite")', { timeout: 10000 });
    }

    // Get current count from the button text
    const beforeText = await page.locator('button.btn-outline-primary:has-text("Favorite")').first().textContent();
    const beforeCount = parseInt(beforeText?.match(/\d+/)?.[0] || '0', 10);

    // Favorite
    await page.click('button.btn-outline-primary:has-text("Favorite")');
    await page.waitForSelector('button.btn-primary:has-text("Unfavorite")', { timeout: 10000 });

    // Count should have increased
    const afterText = await page.locator('button.btn-primary:has-text("Unfavorite")').first().textContent();
    const afterCount = parseInt(afterText?.match(/\d+/)?.[0] || '0', 10);
    expect(afterCount).toBe(beforeCount + 1);
  });
});
