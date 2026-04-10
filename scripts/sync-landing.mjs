import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootLanding = path.resolve(process.cwd(), "flatfinder-landing.html");
const publicLanding = path.resolve(process.cwd(), "public", "flatfinder-landing.html");

try {
	const html = await fs.readFile(rootLanding, "utf8");
	await fs.mkdir(path.dirname(publicLanding), { recursive: true });
	await fs.writeFile(publicLanding, html, "utf8");
	console.log("synced flatfinder-landing.html -> public/flatfinder-landing.html");
} catch (error) {
	console.error("failed to sync landing page", error);
	process.exit(1);
}
