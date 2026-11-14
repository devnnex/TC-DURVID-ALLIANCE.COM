import {expect,type Page} from '@playwright/test';
export async function chooseWaiterTable(page:Page,id?:string){
  if(await page.locator('#waiterTablesStep').count())await page.locator(id?'[data-waiter-table="'+id+'"]':'[data-waiter-table]').first().click();
  else await page.locator('#waiterTable').selectOption(id||{index:1});
}
export async function reviewWaiterOrder(page:Page){if(await page.locator('#waiterReviewNext').count())await page.locator('#waiterReviewNext').click();}
export async function closeWaiterSuccess(page:Page){if(await page.locator('#waiterSuccessDialog').count()){await expect(page.locator('#waiterSuccessDialog')).toBeVisible();await page.locator('[data-success-next=tables]').click();}}
