// HTTP-level smoke test against a running production build.
// Usage: node scripts/smoke.mjs http://localhost:3000
const base = process.argv[2] ?? "http://localhost:3000";
const failures = [];

async function check(name, run) {
	try {
		await run();
		console.log(`ok   ${name}`);
	} catch (error) {
		failures.push(name);
		console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
	}
}

function expect(condition, message) {
	if (!condition) throw new Error(message);
}

await check("landing page renders", async () => {
	const response = await fetch(`${base}/`);
	expect(response.status === 200, `status ${response.status}`);
	expect((await response.text()).includes("Sketchflow"), "missing product name");
});

await check("help page renders", async () => {
	const response = await fetch(`${base}/help`);
	expect(response.status === 200, `status ${response.status}`);
});

await check("app pages cannot be framed", async () => {
	const response = await fetch(`${base}/help`);
	expect(response.headers.get("x-frame-options") === "DENY", "missing X-Frame-Options");
	expect(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "missing frame-ancestors");
	expect(response.headers.get("x-content-type-options") === "nosniff", "missing nosniff");
});

await check("embed pages can be framed", async () => {
	const response = await fetch(`${base}/embed/-/-/-`);
	expect(!response.headers.get("x-frame-options"), "embed must not send X-Frame-Options");
});

await check("health does not expose internals", async () => {
	const response = await fetch(`${base}/api/health`);
	const body = await response.json();
	expect(response.status === 200, `status ${response.status}`);
	expect(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["ok", "service"]), `unexpected keys ${Object.keys(body)}`);
});

await check("malformed share URL is a 404", async () => {
	const response = await fetch(`${base}/share/bad$owner/repo/project`);
	expect(response.status === 404, `status ${response.status}`);
});

await check("API requires authentication", async () => {
	const response = await fetch(`${base}/api/workspaces`);
	expect(response.status === 401, `status ${response.status}`);
});

await check("cross-site POST is rejected", async () => {
	const response = await fetch(`${base}/api/workspaces/bootstrap`, {
		method: "POST",
		headers: { origin: "https://evil.example", "content-type": "text/plain" },
		body: "{}",
	});
	expect(response.status === 403, `status ${response.status}`);
});

if (failures.length > 0) {
	console.error(`\n${failures.length} smoke check(s) failed`);
	process.exit(1);
}
console.log("\nall smoke checks passed");
