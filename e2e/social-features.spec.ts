import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, favoriteArticle, unfavoriteArticle, generateUniqueArticle } from './helpers/articles';
import { addComment, deleteComment, getCommentCount } from './helpers/comments';
import { followUser, unfollowUser } from './helpers/profile';

test.describe('Social Features - Integrated', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should follow a user and see their articles in personal feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe (demo backend user)
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Navigate to home and check "Your Feed" tab
    await page.goto('/', { waitUntil: 'load' });
    await page.click('a:has-text("Your Feed")');

    // Should see articles from followed user (johndoe has articles on demo backend)
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should favorite an article and verify it appears in favorites tab', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Go to global feed and find an article from another user
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });

    // Get the title of the first article
    const firstArticleTitle = await page.locator('.article-preview h1').first().textContent();

    // Click on first article
    await page.locator('.article-preview h1').first().click();
    await page.waitForURL(/\/article\/.+/);
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });

    // Favorite it
    await favoriteArticle(page);
    await expect(page.locator('button:has-text("Unfavorite")').first()).toBeVisible();

    // Navigate to profile and check Favorited Articles tab
    await page.goto(`/profile/${user.username}`, { waitUntil: 'load' });
    await page.waitForSelector('a:has-text("Favorited")', { timeout: 10000 });
    await page.click('a:has-text("Favorited")');
    await expect(page).toHaveURL(`/profile/${user.username}/favorites`);
    await expect(page.locator('.article-preview').first()).toBeVisible({ timeout: 10000 });
  });

  test('should comment on an article and verify comment persistence', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Create an article
    const article = generateUniqueArticle();
    await createArticle(page, article);

    // Add a comment
    const commentText = `Test comment ${Date.now()}`;
    await addComment(page, commentText);

    // Verify comment is visible
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();

    // Reload the page and verify comment persists
    await page.reload();
    await page.waitForSelector('.card:not(.comment-form) .card-block', { timeout: 10000 });
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();
  });

  test('should add and delete a comment on own article', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const commentText = `Comment to delete ${Date.now()}`;
    await addComment(page, commentText);

    // Verify comment exists
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();
    const countBefore = await getCommentCount(page);

    // Delete the comment
    await deleteComment(page, commentText);

    // Verify comment is gone
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).not.toBeVisible();
  });

  test('should unfavorite a previously favorited article', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Go to global feed and favorite an article
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.locator('.article-preview h1').first().click();
    await page.waitForURL(/\/article\/.+/);
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', { timeout: 10000 });

    await favoriteArticle(page);
    await expect(page.locator('button:has-text("Unfavorite")').first()).toBeVisible();

    // Now unfavorite
    await unfavoriteArticle(page);
    await expect(page.locator('button:has-text("Favorite")').first()).toBeVisible();
  });

  test('should unfollow a previously followed user', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Unfollow johndoe
    await unfollowUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();
  });
});
