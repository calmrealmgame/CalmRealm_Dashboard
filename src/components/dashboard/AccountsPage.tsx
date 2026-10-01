"use client";

import { Plus, ShieldCheck, ShieldUser, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { DashboardAccount } from "@/lib/supabase";
import { DataTable, MetricCard, PageHeader } from "./shared";

export function AccountsPage({ session }: { session: Session }) {
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "", role: "admin" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAccounts() {
    const response = await fetch("/api/admin/accounts", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (response.ok) setAccounts(payload.accounts);
    else setMessage(payload.error ?? "Could not load accounts.");
  }

  useEffect(() => {
    let ignore = false;
    async function run() {
      const response = await fetch("/api/admin/accounts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json();
      if (ignore) return;
      if (response.ok) setAccounts(payload.accounts);
      else setMessage(payload.error ?? "Could not load accounts.");
    }
    run();
    return () => {
      ignore = true;
    };
  }, [session.access_token]);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Account created." : payload.error ?? "Could not create account.");
    setLoading(false);
    if (response.ok) {
      setForm({ username: "", email: "", name: "", password: "", role: "admin" });
      loadAccounts();
    }
  }

  return (
    <>
      <PageHeader title="Accounts" description="Manage back office users and view access roles." />
      <div className="page-body">
        <section className="metric-grid account-metrics">
          <MetricCard label="Dashboard Accounts" value={accounts.length} icon={Users} />
          <MetricCard label="Super Admins" value={accounts.filter((item) => item.role === "super_admin").length} icon={ShieldCheck} />
          <MetricCard label="View-only Admins" value={accounts.filter((item) => item.role === "admin").length} icon={ShieldUser} />
        </section>
      <section className="account-layout">
        <form className="account-form" onSubmit={createAccount}>
          <h2>Create Account</h2>
          <label>
            Username
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="admin">Admin - view only</option>
              <option value="super_admin">Super admin - full dashboard access</option>
            </select>
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          {message ? <p className="hint">{message}</p> : null}
          <button className="primary-button" disabled={loading}>
            <Plus size={16} /> {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
        <div className="account-table">
          <div className="table-heading">
            <h2>Account List</h2>
          </div>
          <DataTable
            rows={accounts.map((item) => ({
              Username: item.username,
              Name: item.name,
              Email: item.email,
              Role: item.role,
              Created: item.created_at,
            }))}
          />
        </div>
      </section>
    </div>
  </>
);
}
