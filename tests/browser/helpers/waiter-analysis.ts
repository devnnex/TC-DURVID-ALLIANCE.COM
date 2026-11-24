import type {Page} from '@playwright/test';
export async function openWaiterAnalysis(page:Page){
 await page.locator('.admin-sidebar [href="#income"]').click();
 await page.locator('#openSalesStatistics').click();
 await page.locator('#ss-tab-waiters').click();
}
