import { test, expect } from '@playwright/test';
import { register, generateUniqueUser } from './helpers/auth';
import { addComment } from './helpers/comments';
import { followUser } from './helpers/profile';

test.describe('Social Workflow', () => {
  test.afterEach(async ({ context }) => {
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('should follow a user, favorite their article, and comment on it', async ({ page }) => {
    test.setTimeout(60000);

    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible({ timeout: 10000 });

    // Navigate to johndoe's article from global feed
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    const articleLink = page.locator('.article-preview a.preview-link').first();
    const articleTitle = await articleLink.locator('h1').textContent();
    await articleLink.click();
    await page.waitForSelector('.article-page', { timeout: 10000 });

    // Favorite the article
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', {
      timeout: 10000,
    });
    const favoriteBtn = page.locator('button.btn-outline-primary:has-text("Favorite")').first();
    if (await favoriteBtn.isVisible()) {
      await favoriteBtn.click();
      await expect(page.locator('button:has-text("Unfavorite")').first()).toBeVisible({
        timeout: 10000,
      });
    }

    // Comment on the article
    const commentText = `Test comment from ${user.username} at ${Date.now()}`;
    await addComment(page, commentText);
    await expect(page.locator(`.card:not(.comment-form) .card-block:has-text("${commentText}")`)).toBeVisible({
      timeout: 10000,
    });

    // Verify Your Feed shows followed user's content
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.feed-toggle', { timeout: 10000 });
    await page.click('a:has-text("Your Feed")');
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();
  });

  test('should favorite and unfavorite an article', async ({ page }) => {
    test.setTimeout(60000);

    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Navigate to an article from the global feed
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.locator('.article-preview a.preview-link').first().click();
    await page.waitForSelector('.article-page', { timeout: 10000 });

    // Favorite the article
    await page.waitForSelector('button:has-text("Favorite"), button:has-text("Unfavorite")', {
      timeout: 10000,
    });
    const favBtn = page.locator('button.btn-outline-primary:has-text("Favorite")').first();
    await favBtn.click();
    const unfavBtn = page.locator('button.btn-primary:has-text("Unfavorite")').first();
    await expect(unfavBtn).toBeVisible({ timeout: 10000 });

    // Unfavorite the article
    await unfavBtn.click();
    await expect(page.locator('button.btn-outline-primary:has-text("Favorite")').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('should display comment with correct author info', async ({ page }) => {
    test.setTimeout(60000);

    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Navigate to an article from the global feed
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await page.locator('.article-preview a.preview-link').first().click();
    await page.waitForSelector('.article-page', { timeout: 10000 });
    await page.waitForSelector('textarea[placeholder="Write a comment..."]', { timeout: 10000 });

    // Post a comment
    const commentText = `Author check ${user.username} ${Date.now()}`;
    await addComment(page, commentText);

    // Verify the comment shows the correct author
    const commentCard = page.locator('.card', { has: page.locator(`text="${commentText}"`) });
    await expect(commentCard.locator(`a[href="/profile/${user.username}"]`).first()).toBeVisible({ timeout: 10000 });
  });

  test('should unfollow user and remove their articles from Your Feed', async ({ page }) => {
    const user = generateUniqueUser();
    await register(page, user.username, user.email, user.password);

    // Follow johndoe
    await followUser(page, 'johndoe');
    await expect(page.locator('button:has-text("Unfollow")')).toBeVisible();

    // Verify Your Feed has content
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.feed-toggle', { timeout: 10000 });
    await page.click('a:has-text("Your Feed")');
    await page.waitForSelector('.article-preview', { timeout: 10000 });
    await expect(page.locator('.article-preview').first()).toBeVisible();

    // Unfollow johndoe
    await page.goto('/profile/johndoe', { waitUntil: 'load' });
    await page.waitForSelector('button:has-text("Unfollow")', { timeout: 10000 });
    await page.click('button:has-text("Unfollow")');
    await expect(page.locator('button:has-text("Follow")')).toBeVisible();

    // Your Feed should now be empty
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('.feed-toggle', { timeout: 10000 });
    await page.click('a:has-text("Your Feed")');
    await expect(page.locator('text=Your feed is empty')).toBeVisible({ timeout: 5000 });
  });
});
