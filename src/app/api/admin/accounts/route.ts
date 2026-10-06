import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createUserClient(accessToken: string) {
  if (!url || !anon) {
    throw new Error("Missing Supabase URL or anon key.");
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function createAdminClient() {
  if (!url || !serviceRole) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local and restart npm run dev.");
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const DASHBOARD_ROLES = ["admin", "Staff", "viewer"] as const;

function normalizeRole(value: unknown) {
  return DASHBOARD_ROLES.includes(value as (typeof DASHBOARD_ROLES)[number])
    ? (value as (typeof DASHBOARD_ROLES)[number])
    : "viewer";
}

async function requireAdmin(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing authorization token." };
  const userClient = createUserClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return { error: "Invalid session." };
  const { data: account, error: accountError } = await userClient
    .from("DashboardAccount")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (accountError || account?.role !== "admin") {
    return {
      error: accountError
        ? `Could not verify dashboard role: ${accountError.message}`
        : "Admin access required. Check DashboardAccount.role is exactly admin.",
    };
  }
  return { userClient, user: userData.user };
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: 403 });
    const { data, error } = await guard.userClient
      .from("DashboardAccount")
      .select("id, username, email, name, role, created_at")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ accounts: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: 403 });
    const adminClient = createAdminClient();
    const body = await request.json();
    const username = String(body.username ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const role = normalizeRole(body.role);

    if (!username || !email || !name || password.length < 6) {
      return NextResponse.json({ error: "Username, email, name, and a 6+ character password are required." }, { status: 400 });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, name, role },
    });
    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message ?? "Could not create auth user." }, { status: 400 });
    }

    const { error: insertError } = await adminClient.from("DashboardAccount").insert({
      id: created.user.id,
      username,
      email,
      name,
      role,
    });
    if (insertError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ account: { id: created.user.id, username, email, name, role } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: 403 });
    const adminClient = createAdminClient();
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const name = String(body.name ?? "").trim();
    const role = normalizeRole(body.role);

    if (!id || !name) {
      return NextResponse.json({ error: "Account id and name are required." }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from("DashboardAccount")
      .update({ name, role })
      .eq("id", id)
      .select("id, username, email, name, role, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await adminClient.auth.admin.updateUserById(id, {
      user_metadata: { name, role },
    });

    return NextResponse.json({ account: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: 403 });
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") ?? "").trim();

    if (!id) return NextResponse.json({ error: "Account id is required." }, { status: 400 });
    if (id === guard.user.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });

    const { error: deleteProfileError } = await adminClient.from("DashboardAccount").delete().eq("id", id);
    if (deleteProfileError) return NextResponse.json({ error: deleteProfileError.message }, { status: 400 });

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(id);
    if (deleteAuthError) return NextResponse.json({ error: deleteAuthError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 500 });
  }
}
