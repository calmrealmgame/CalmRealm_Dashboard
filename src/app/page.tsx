"use client";

import { BarChart3, Eye, EyeOff, Lock, LogOut, Shield, Users } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AccountsPage,
  OverviewPage,
  emptyFilters,
  type Filters,
} from "@/components/dashboard";
import { supabase } from "@/lib/supabase";
import type { DashboardAccount, Participant, SceneData, WatchLog } from "@/lib/supabase";

type PageName = "overview" | "accounts";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<DashboardAccount | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<PageName>("overview");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sceneData, setSceneData] = useState<SceneData[]>([]);
  const [watchLogs, setWatchLogs] = useState<WatchLog[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadAccount() {
      if (!session?.user) {
        setAccount(null);
        return;
      }
      const { data, error } = await supabase
        .from("DashboardAccount")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (error) {
        setAccount(null);
        setDataError(
          "Signed in, but no DashboardAccount profile was found. Run supabase-dashboard-setup.sql and add this auth user as admin/stuff/viewer.",
        );
        return;
      }
      setAccount(data as DashboardAccount);
      setDataError("");
    }
    loadAccount();
  }, [session]);

  useEffect(() => {
    async function loadDashboardData() {
      if (!session) return;
      const [usersResult, scenesResult, watchResult] = await Promise.all([
        supabase.from("User").select("*").order("created_at", { ascending: false }),
        supabase.from("SceneData").select("*").order("createdAt", { ascending: false }),
        supabase.from("Watch Log").select("*").order("timestamp", { ascending: false }),
      ]);

      const error = usersResult.error || scenesResult.error || watchResult.error;
      if (error) {
        setDataError(error.message);
        return;
      }

      setParticipants((usersResult.data ?? []) as Participant[]);
      setSceneData((scenesResult.data ?? []) as SceneData[]);
      setWatchLogs((watchResult.data ?? []) as WatchLog[]);
    }
    loadDashboardData();
  }, [session]);

  const canExport = account?.role === "admin" || account?.role === "stuff";

  if (authLoading) {
    return <div className="center-screen">Loading dashboard...</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  const showAccounts = account?.role === "admin";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <strong>Calm Realm</strong>
            <span>Back office</span>
          </div>
        </div>
        <nav className="nav-list">
          <button className={page === "overview" ? "active" : ""} onClick={() => setPage("overview")}>
            <BarChart3 size={18} /> Overview
          </button>
          {showAccounts ? (
            <button className={page === "accounts" ? "active" : ""} onClick={() => setPage("accounts")}>
              <Users size={18} /> Accounts
            </button>
          ) : null}
        </nav>
        <div className="sidebar-footer">
          <div className="signed-in">
            <Shield size={16} />
            <span>{account?.name ?? session.user.email}</span>
            <small>{formatDashboardRole(account?.role)}</small>
          </div>
          <button className="ghost-button" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {dataError ? <div className="error-banner">{dataError}</div> : null}
        {page === "overview" ? (
          <OverviewPage
            participants={participants}
            sceneData={sceneData}
            watchLogs={watchLogs}
            filters={filters}
            setFilters={setFilters}
            canExport={canExport}
          />
        ) : null}
        {page === "accounts" && showAccounts ? <AccountsPage session={session} /> : null}
      </main>
    </div>
  );
}

function formatDashboardRole(role: DashboardAccount["role"] | undefined) {
  if (role === "admin") return "Admin";
  if (role === "stuff") return "Stuff";
  if (role === "viewer") return "Viewer";
  return "No role";
}

function LoginScreen() {
  const [accountNameOrEmail, setAccountNameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    let email = accountNameOrEmail.trim();
    if (!email.includes("@")) {
      const { data, error: lookupError } = await supabase.rpc("resolve_dashboard_account_email", {
        account_name: email,
      });
      if (lookupError || !data) {
        setError("Account name not found.");
        setLoading(false);
        return;
      }
      email = data;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setLoading(false);
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <Image src="/LOGO.png" alt="Calm Realm Logo" width={300} height={105} style={{ objectFit: "fill" }} priority />
        </div>
        <h1>Back office Login</h1>
        <label>
          Account name or email
          <input value={accountNameOrEmail} onChange={(event) => setAccountNameOrEmail(event.target.value)} required />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={loading}>
          <Lock size={16} /> {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
