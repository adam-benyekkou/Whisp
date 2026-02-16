import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Whisp File Sharing E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  });

  test('should create and download a file whisp', async ({ page, context }) => {
    // 1. Create a dummy file
    const filePath = path.join(process.cwd(), 'test-artifact.txt');
    const fileContent = 'This is the content of the test file.';
    fs.writeFileSync(filePath, fileContent);

    try {
        await page.goto('/');

        // 2. Upload the file
        // Note: Playwright's setInputFiles works on hidden inputs too if they are present
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#file-upload-zone');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // 3. Verify file preview
        await expect(page.locator('p:text("test-artifact.txt")')).toBeVisible();

        // 4. Create whisp
        await expect(page.locator('#create-btn')).toBeEnabled();
        await page.click('#create-btn');

        // 5. Wait for result
        await expect(page.locator('#result-view')).toBeVisible({ timeout: 10000 });
        const whispLink = await page.locator('#whisp-link').inputValue();
        expect(whispLink).toContain('/reveal#');

        // 6. Open reveal page
        const newPage = await context.newPage();
        await newPage.goto(whispLink);

        // 7. Verify file info is displayed
        await expect(newPage.locator('h3:text("test-artifact.txt")')).toBeVisible({ timeout: 5000 });
        await expect(newPage.locator('text=Ready for secure download')).toBeVisible();

        // 8. Download the file
        const downloadPromise = newPage.waitForEvent('download');
        await newPage.click('text=Download Artifact');
        const download = await downloadPromise;

        // 9. Verify downloaded content
        const downloadPath = path.join(process.cwd(), 'downloaded-test-artifact.txt');
        await download.saveAs(downloadPath);
        const downloadedContent = fs.readFileSync(downloadPath, 'utf8');
        expect(downloadedContent).toBe(fileContent);

        console.log('File whisp flow verified successfully');
        
        // Cleanup download
        if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);

    } finally {
        // Cleanup artifact
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

});
