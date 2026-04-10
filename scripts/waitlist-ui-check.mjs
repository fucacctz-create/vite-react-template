import { chromium } from "playwright";
import fs from "node:fs/promises";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/opt/cursor/artifacts";
const runId = Date.now();
const testEmail = `ui.script.${runId}@example.com`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
	await page.goto(`${baseUrl}/flatfinder-landing.html`, { waitUntil: "networkidle" });
	await page.click('button:has-text("Get Early Access")');
	await page.waitForSelector(".modal-overlay.open");

	const cityOptions = await page.$$eval("#wl-city option", (options) =>
		options.map((option) => ({ value: option.getAttribute("value"), text: option.textContent?.trim() })),
	);
	await page.selectOption('select:near(:text("City"))', "other");
	await page.waitForSelector('input[placeholder="Enter your city"]');
	await page.fill('input[placeholder="Enter your city"]', "Ottawa");
	await page.fill('input[placeholder="Jane Smith"]', "UI Script Demo");
	await page.fill('input[placeholder="jane@email.com"]', testEmail);
	await page.fill("#wl-date", "2026-08");
	await page.selectOption("#wl-household", "2");
	await page.fill("#wl-budget", "2750");
	await page.selectOption("#wl-beds", "1");
	await page.selectOption("#wl-baths", "1");
	await page.selectOption("#wl-type", "condo");

	const cityOptionStyles = await page.evaluate(() => {
		const citySelect = document.querySelector("#wl-city");
		const option = citySelect?.querySelector("option[value='paris']");
		if (!option) return null;
		const style = window.getComputedStyle(option);
		return { color: style.color, backgroundColor: style.backgroundColor };
	});

	await page.screenshot({
		path: `${outDir}/waitlist_dropdown_readable_after_fix.png`,
		fullPage: true,
	});

	const waitlistResponsePromise = page.waitForResponse(
		(response) =>
			response.url().includes("/api/waitlist") && response.request().method() === "POST",
		{ timeout: 15000 },
	);
	await page.click('button:has-text("Join the Waitlist")');
	const waitlistResponse = await waitlistResponsePromise;
	const waitlistResponseBody = await waitlistResponse.text();
	await page.waitForTimeout(700);
	const isSuccessVisible = await page
		.locator("text=You're on the list.")
		.isVisible()
		.catch(() => false);
	if (!isSuccessVisible) {
		const currentError = await page
			.locator(".form-error")
			.textContent()
			.catch(() => null);
		throw new Error(
			`Waitlist submit did not reach success state. response=${waitlistResponse.status()} body=${waitlistResponseBody} formError=${currentError}`,
		);
	}

	await page.screenshot({
		path: `${outDir}/waitlist_success_after_fix.png`,
		fullPage: true,
	});

	await fs.writeFile(
		`${outDir}/waitlist_ui_check.log`,
		`email=${testEmail}
city_option_styles=${JSON.stringify(cityOptionStyles)}
city_options=${JSON.stringify(cityOptions)}
waitlist_response_status=${waitlistResponse.status()}
waitlist_response_body=${waitlistResponseBody}
`,
		"utf8",
	);
} finally {
	await browser.close();
}
