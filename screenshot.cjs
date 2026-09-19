const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } });
  
  try {
      // 1. Landing Page
      await page.goto('http://localhost:3000/');
      await page.waitForTimeout(2000); // wait for load
      await page.screenshot({ path: 'da6_assignment/landing_page.png' });
      console.log("Saved landing_page.png");

      // 2. Go to Dashboard
      await page.goto('http://localhost:3000/dashboard');
      await page.waitForTimeout(2000);
      
      // 3. Connect Wallet
      await page.click('text=Connect Wallet', { timeout: 5000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'da6_assignment/dashboard_connected.png' });
      console.log("Saved dashboard_connected.png");

      // 4. Interact with map (Optional)
      try {
          const mapLocator = page.locator('.leaflet-container');
          await mapLocator.click({ position: { x: 200, y: 200 }, timeout: 5000 });
          await page.waitForTimeout(1000);
      } catch (e) {
          console.log("Map interaction skipped:", e.message);
      }
      
      await page.screenshot({ path: 'da6_assignment/map_visualizer.png' });
      console.log("Saved map_visualizer.png");

      // 5. Fill form and Commit Policy
      try {
          await page.fill('input[placeholder="John Doe"]', 'Adhithya Singa Narendran');
          await page.fill('input[placeholder="50"]', '10.5');
          await page.fill('input[placeholder="Wheat"]', 'Wheat');
          await page.selectOption('select', '1'); // Basic Tier
      } catch(e) {
          console.log("Form fill error:", e.message);
      }
      
      try {
          await page.click('text=Commit Policy', { timeout: 5000 });
          // Wait for mock transaction to finish (4-5 seconds)
          await page.waitForTimeout(6000);
      } catch (e) {
          console.log("Commit policy click error:", e.message);
      }
      
      // 6. Screenshot bottom
      // Scroll down to see the events
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'da6_assignment/dashboard_bottom.png' });
      console.log("Saved dashboard_bottom.png");
      
      try {
          const eventsLocator = page.locator('.space-y-4').first(); // the first list of events
          if (await eventsLocator.isVisible()) {
              await eventsLocator.screenshot({ path: 'da6_assignment/transaction_receipt.png' });
              console.log("Saved transaction_receipt.png");
          }
      } catch (e) {
          console.log("Transaction receipt error:", e.message);
      }

  } catch (error) {
      console.error("Global error:", error);
  } finally {
      await browser.close();
  }
})();
