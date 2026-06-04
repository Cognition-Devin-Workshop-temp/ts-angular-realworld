import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { createArticle, favoriteArticle, unfavoriteArticle, generateUniqueArticle } from './helpers/articles';
import { addComment, getCommentCount } from './helpers/comments';
import { followUser } from './helpers/profile';

/**
 * Integrated social workflow tests — exercises follow, favorite, and comment
 * features as connected user journeys rather than isolated operations.
 */

test.describe('Social Workflows — Follow', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should see followed user articles in Your Feed', async ({ page }) => {
    const reader = generateUniqueUser();
    await register(page, reader.username, reader.email, reader.password);

    await followUser(page, 'johndoe');

    await page.goto('/?feed=following', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should toggle follow button state on profile page', async ({ page }) => {
    const reader = generateUniqueUser();
    await register(page, reader.username, reader.email, reader.password);

    await page.goto('/profile/johndoe', { waitUntil: 'load' });
    await page.waitForSelector('.user-info', { timeout: 10000 });

    await page.waitForSelector('button:has-text("Follow")', { timeout: 10000 });
    await page.click('button:has-text("Follow")');

    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("Unfollow")');
    await expect(page.locator('button:has-text("Follow")')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Social Workflows — Favorite', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should show favorited article on Favorited tab', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Navigate to global feed and pick an article from another user
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    const articleTitle = await page.locator('.article-preview h1').first().textContent();
    await page.locator('.article-preview h1').first().click();
    await page.waitForURL(/\/article\/.+/, { timeout: 10000 });

    // Favorite the article (authored by someone else — button should be visible)
    await page.waitForSelector('button.btn-outline-primary:has-text("Favorite")', { timeout: 10000 });
    await favoriteArticle(page);

    // Go to Favorited tab
    await page.goto(`/profile/${user.username}/favorites`, { waitUntil: 'load' });
    await expect(page.locator('.article-preview').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`.article-preview:has-text("${articleTitle}")`)).toBeVisible();
  });

  test('should unfavorite article and verify button reverts', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Navigate to global feed and pick an article
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.locator('.article-preview h1').first().click();
    await page.waitForURL(/\/article\/.+/, { timeout: 10000 });

    // Favorite
    await page.waitForSelector('button.btn-outline-primary:has-text("Favorite")', { timeout: 10000 });
    await favoriteArticle(page);

    // Unfavorite
    await unfavoriteArticle(page);

    // Should be back to outline button
    await expect(page.locator('button.btn-outline-primary:has-text("Favorite")').first()).toBeVisible();
  });
});

test.describe('Social Workflows — Comments', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should post comment and verify it persists across reload', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const commentText = `Persistent comment ${Date.now()}`;
    await addComment(page, commentText);

    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();

    // Reload and verify
    await page.reload();
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible();
  });

  test('should post multiple comments on the same article', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const comment1 = `First comment ${Date.now()}`;
    await addComment(page, comment1);
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${comment1}")`)).toBeVisible();

    const comment2 = `Second comment ${Date.now()}`;
    await addComment(page, comment2);
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${comment2}")`)).toBeVisible();

    const count = await getCommentCount(page);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should show comment author username', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    const article = generateUniqueArticle();
    await createArticle(page, article);

    const commentText = `Author info test ${Date.now()}`;
    await addComment(page, commentText);

    const commentCard = page.locator('.card', { has: page.locator(`text="${commentText}"`) });
    await expect(commentCard.locator('.comment-author', { hasText: user.username })).toBeVisible();
  });
});
