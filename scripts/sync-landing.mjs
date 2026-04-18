import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootLanding = path.resolve(process.cwd(), "flatfinder-landing.html");
const publicDir = path.resolve(process.cwd(), "public");
const publicLanding = path.resolve(publicDir, "flatfinder-landing.html");
const publicIndex = path.resolve(publicDir, "index.html");
const viteIndex = path.resolve(process.cwd(), "index.html");
const bennySrc = path.resolve(process.cwd(), "Benny!.png");
const bennyDest = path.resolve(publicDir, "Benny!.png");

try {
	const html = await fs.readFile(rootLanding, "utf8");
	await fs.mkdir(publicDir, { recursive: true });
	await fs.writeFile(publicLanding, html, "utf8");
	await fs.writeFile(publicIndex, html, "utf8");
	// Vite uses repo-root index.html as the client HTML entry; keep it aligned with the landing page for deploy.
	await fs.writeFile(viteIndex, html, "utf8");
	await fs.copyFile(bennySrc, bennyDest);
	console.log("synced flatfinder-landing.html -> public/flatfinder-landing.html");
	console.log("synced flatfinder-landing.html -> public/index.html");
	console.log("synced flatfinder-landing.html -> index.html (Vite entry)");
	console.log("synced Benny!.png -> public/Benny!.png");
} catch (error) {
	console.error("failed to sync landing page", error);
	process.exit(1);
}
