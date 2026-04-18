import { Hono } from "hono";
type Bindings = Env & {
	SUPABASE_URL?: string;
	NEXT_PUBLIC_SUPABASE_URL?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;
	SUPABASE_ANON_KEY?: string;
	NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
	SUPABASE_KEY?: string;
	SUPABASE_TOKEN?: string;
	RESEND_API_KEY?: string;
	FROM_EMAIL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

type WaitlistRequest = {
	name?: string;
	email?: string;
	city?: string | null;
	city_other?: string | null;
	moving_date?: string | null;
	household_size?: string | null;
	budget?: number | null;
	bedrooms?: string | null;
	bathrooms?: string | null;
	property_type?: string | null;
};

const TABLE_NOT_FOUND_CODES = new Set(["42P01", "PGRST205"]);

type SupabaseErrorPayload = {
	code?: string;
	message?: string;
	details?: string;
	hint?: string;
};

const parseSupabaseError = (payload: SupabaseErrorPayload | null) => {
	if (!payload) {
		return "Unknown Supabase error.";
	}
	return [payload.message, payload.details, payload.hint].filter(Boolean).join(" ");
};

const insertIntoSupabaseTable = async (
	supabaseUrl: string,
	supabaseKey: string,
	table: string,
	payload: Record<string, unknown>,
) => {
	const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			apikey: supabaseKey,
			Authorization: `Bearer ${supabaseKey}`,
			Prefer: "return=minimal",
		},
		body: JSON.stringify(payload),
	});

	const errorPayload = (await response.json().catch(() => null)) as SupabaseErrorPayload | null;
	return { response, errorPayload };
};

const getMissingColumnFromError = (payload: SupabaseErrorPayload | null) => {
	const message = payload?.message ?? "";
	const match = message.match(/Could not find the '([^']+)' column/i);
	return match?.[1] ?? null;
};

const insertIntoWaitlistWithSchemaFallback = async (
	supabaseUrl: string,
	supabaseKey: string,
	payload: Record<string, unknown>,
) => {
	const mutablePayload: Record<string, unknown> = { ...payload };
	let lastResult = await insertIntoSupabaseTable(
		supabaseUrl,
		supabaseKey,
		"waitlist",
		mutablePayload,
	);

	// Backward compatibility: if the project has an older waitlist schema,
	// remove unknown columns and retry until it can insert or a non-schema error occurs.
	while (!lastResult.response.ok) {
		const missingColumn = getMissingColumnFromError(lastResult.errorPayload);
		if (!missingColumn || !(missingColumn in mutablePayload)) {
			return lastResult;
		}
		delete mutablePayload[missingColumn];
		lastResult = await insertIntoSupabaseTable(
			supabaseUrl,
			supabaseKey,
			"waitlist",
			mutablePayload,
		);
	}

	return lastResult;
};

const checkEmailExistsInTable = async (
	supabaseUrl: string,
	supabaseKey: string,
	table: string,
	email: string,
) => {
	const response = await fetch(
		`${supabaseUrl}/rest/v1/${table}?select=email&email=eq.${encodeURIComponent(email)}&limit=1`,
		{
			headers: {
				apikey: supabaseKey,
				Authorization: `Bearer ${supabaseKey}`,
			},
		},
	);

	if (!response.ok) {
		const errorPayload = (await response.json().catch(() => null)) as SupabaseErrorPayload | null;
		return { exists: false, response, errorPayload };
	}

	const rows = (await response.json().catch(() => [])) as Array<{ email: string }>;
	return { exists: rows.length > 0, response, errorPayload: null as SupabaseErrorPayload | null };
};

const isMissingTableError = (status: number, payload: SupabaseErrorPayload | null) => {
	if (status === 404) {
		return true;
	}
	if (payload?.code && TABLE_NOT_FOUND_CODES.has(payload.code)) {
		return true;
	}
	// Newer PostgREST sometimes returns this message without a known code in our set.
	const msg = payload?.message ?? "";
	if (/Could not find the table/i.test(msg) && /schema cache/i.test(msg)) {
		return true;
	}
	return false;
};

const resolveSupabaseConfig = (env: Bindings) => {
	const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, "");
	const supabaseKey =
		env.SUPABASE_SERVICE_ROLE_KEY ||
		env.SUPABASE_ANON_KEY ||
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
		env.SUPABASE_KEY ||
		env.SUPABASE_TOKEN;
	return { supabaseUrl, supabaseKey };
};

app.post("/api/waitlist", async (c) => {
	let body: WaitlistRequest;
	try {
		body = await c.req.json<WaitlistRequest>();
	} catch {
		return c.json({ error: "Invalid request body." }, 400);
	}

	const name = body.name?.trim();
	const email = body.email?.trim().toLowerCase();

	if (!name || !email) {
		return c.json({ error: "Name and email are required." }, 400);
	}

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return c.json({ error: "Please enter a valid email." }, 400);
	}

	const { supabaseUrl, supabaseKey } = resolveSupabaseConfig(c.env);

	if (!supabaseUrl || !supabaseKey) {
		return c.json(
			{
				error:
					"Waitlist is not configured yet. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).",
			},
			500,
		);
	}

	const city =
		body.city === "other"
			? body.city_other?.trim() || null
			: body.city?.trim() || null;
	const waitlistPayload = {
		name,
		email,
		city,
		moving_date: body.moving_date || null,
		household_size: body.household_size || null,
		budget: body.budget ?? null,
		bedrooms: body.bedrooms || null,
		bathrooms: body.bathrooms || null,
		property_type: body.property_type || null,
	};

	// Enforce one-signup-per-email across both possible tables.
	const waitlistDuplicateCheck = await checkEmailExistsInTable(
		supabaseUrl,
		supabaseKey,
		"waitlist",
		email,
	);
	if (waitlistDuplicateCheck.response.ok && waitlistDuplicateCheck.exists) {
		return c.json({ error: "You're already on the list!" }, 409);
	}
	if (
		!waitlistDuplicateCheck.response.ok &&
		!isMissingTableError(waitlistDuplicateCheck.response.status, waitlistDuplicateCheck.errorPayload)
	) {
		const errorDetail = parseSupabaseError(waitlistDuplicateCheck.errorPayload);
		return c.json(
			{
				error: `Could not validate existing email in Supabase. ${errorDetail}`,
			},
			500,
		);
	}

	const betaDuplicateCheck = await checkEmailExistsInTable(
		supabaseUrl,
		supabaseKey,
		"beta_signups",
		email,
	);
	if (betaDuplicateCheck.response.ok && betaDuplicateCheck.exists) {
		return c.json({ error: "You're already on the list!" }, 409);
	}
	if (
		!betaDuplicateCheck.response.ok &&
		!isMissingTableError(betaDuplicateCheck.response.status, betaDuplicateCheck.errorPayload)
	) {
		const errorDetail = parseSupabaseError(betaDuplicateCheck.errorPayload);
		return c.json(
			{
				error: `Could not validate existing email in Supabase. ${errorDetail}`,
			},
			500,
		);
	}

	// Primary write path: `waitlist` table (new schema).
	const waitlistInsert = await insertIntoWaitlistWithSchemaFallback(
		supabaseUrl,
		supabaseKey,
		waitlistPayload,
	);

	let insertSucceeded = waitlistInsert.response.ok;

	// Compatibility path: if the project still uses the old `beta_signups` table.
	if (
		!insertSucceeded &&
		isMissingTableError(waitlistInsert.response.status, waitlistInsert.errorPayload)
	) {
		const betaPayload = {
			email,
			city,
			bedrooms: body.bedrooms || null,
			budget: body.budget ?? null,
			created_at: new Date().toISOString(),
		};
		const betaInsert = await insertIntoSupabaseTable(
			supabaseUrl,
			supabaseKey,
			"beta_signups",
			betaPayload,
		);
		insertSucceeded = betaInsert.response.ok;

		if (!insertSucceeded) {
			if (betaInsert.errorPayload?.code === "23505") {
				return c.json({ error: "You're already on the list!" }, 409);
			}
			if (isMissingTableError(betaInsert.response.status, betaInsert.errorPayload)) {
				return c.json(
					{
						error:
							"Waitlist table is not set up yet. In Supabase: SQL Editor → paste and run the SQL from `supabase_migration.sql` in your project repo (creates `public.waitlist`). Then try again.",
					},
					503,
				);
			}
			const errorDetail = parseSupabaseError(betaInsert.errorPayload);
			console.error("beta_signups insert failed", betaInsert.errorPayload);
			return c.json(
				{
					error: `Could not save signup in Supabase. ${errorDetail} Check table name and RLS insert policy.`,
				},
				500,
			);
		}
	} else if (!insertSucceeded) {
		if (waitlistInsert.errorPayload?.code === "23505") {
			return c.json({ error: "You're already on the list!" }, 409);
		}
		const errorDetail = parseSupabaseError(waitlistInsert.errorPayload);
		console.error("waitlist insert failed", waitlistInsert.errorPayload);
		return c.json(
			{
				error: `Could not save signup in Supabase. ${errorDetail} Check API key and RLS insert policy.`,
			},
			500,
		);
	}

	const resendApiKey = c.env.RESEND_API_KEY;
	const fromEmail = c.env.FROM_EMAIL;

	if (resendApiKey && fromEmail) {
		try {
			await fetch("https://api.resend.com/emails", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${resendApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: fromEmail,
					to: email,
					subject: "You're on the FlatFinder waitlist",
					html: `<div style="font-family:sans-serif;background:#1a1a1e;color:#f2f0eb;padding:40px 32px;max-width:480px">
						<p style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#f07c2a">FlatFinder</p>
						<h1 style="font-size:26px;margin:12px 0">You're on the list, ${name.split(" ")[0]}.</h1>
						<p style="color:#9090a0;line-height:1.7">Benny is getting ready. You'll be the first to know when we launch.</p>
						<p style="color:#9090a0;font-size:13px;margin-top:24px">- The FlatFinder Team</p>
					</div>`,
				}),
			});
		} catch (emailError) {
			// Non-fatal: signup still succeeds even if confirmation email fails.
			console.error("waitlist email failed", emailError);
		}
	}

	return c.json({ success: true }, 201);
});

app.get("/api/waitlist/health", async (c) => {
	const { supabaseUrl, supabaseKey } = resolveSupabaseConfig(c.env);
	const usingServiceRole = Boolean(c.env.SUPABASE_SERVICE_ROLE_KEY);
	const urlHost = supabaseUrl ? new URL(supabaseUrl).host : null;

	return c.json({
		ok: Boolean(supabaseUrl && supabaseKey),
		urlConfigured: Boolean(supabaseUrl),
		keyConfigured: Boolean(supabaseKey),
		usingServiceRole,
		supabaseHost: urlHost,
		expectedTables: ["waitlist", "beta_signups"],
	});
});

export default app;
