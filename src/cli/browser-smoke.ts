import { chromium } from 'playwright';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ locale: 'en-GB', timezoneId: 'Europe/London' });
    const page = await context.newPage();
    await page.goto('data:text/html,<title>smoke</title><p>ok</p>');
    const title = await page.title();
    if (title !== 'smoke') throw new Error(`unexpected title: ${title}`);
    process.stdout.write(
      `${JSON.stringify({ chromium: browser.version(), node: process.version, title })}\n`,
    );
  } finally {
    await browser.close();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(
      `browser smoke failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
    );
    process.exit(1);
  },
);
