"use client";

import { Save, Trash2, Plus, ShieldCheck, ShieldUser, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { DashboardAccount } from "@/lib/supabase";
import { MetricCard, PageHeader } from "./shared";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin - full access" },
  { value: "Staff", label: "Staff - view and export" },
  { value: "viewer", label: "Viewer - view only" },
] as const;

export function AccountsPage({ session }: { session: Session }) {
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "", role: "admin" });
  const [editing, setEditing] = useState<Record<string, { name: string; role: string }>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAccounts() {
    const response = await fetch("/api/admin/accounts", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (response.ok) {
      setAccounts(payload.accounts);
      setEditing(Object.fromEntries(payload.accounts.map((item: DashboardAccount) => [item.id, { name: item.name, role: item.role }])));
    }
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
      if (response.ok) {
        setAccounts(payload.accounts);
        setEditing(Object.fromEntries(payload.accounts.map((item: DashboardAccount) => [item.id, { name: item.name, role: item.role }])));
      }
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

  async function updateAccount(accountId: string) {
    const next = editing[accountId];
    if (!next) return;
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: accountId, name: next.name, role: next.role }),
    });
    const payload = await response.json();
    setMessage(response.ok ? "Account updated." : payload.error ?? "Could not update account.");
    setLoading(false);
    if (response.ok) loadAccounts();
  }

  async function deleteAccount(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account || !window.confirm(`Delete ${account.name}?`)) return;
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/admin/accounts?id=${encodeURIComponent(accountId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    setMessage(response.ok ? "Account deleted." : payload.error ?? "Could not delete account.");
    setLoading(false);
    if (response.ok) loadAccounts();
  }

  return (
    <>
      <PageHeader title="Accounts" description="Manage back office users and view access roles." />
      <div className="page-body">
        <section className="metric-grid account-metrics">
          <MetricCard label="Dashboard Accounts" value={accounts.length} icon={Users} />
          <MetricCard label="Admins" value={accounts.filter((item) => item.role === "admin").length} icon={ShieldCheck} />
          <MetricCard label="staff / Viewers" value={accounts.filter((item) => item.role !== "admin").length} icon={ShieldUser} />
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
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
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
            <section className="table-card account-edit-table">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.length ? (
                      accounts.map((item) => {
                        const draft = editing[item.id] ?? { name: item.name, role: item.role };
                        return (
                          <tr key={item.id}>
                            <td>{item.username}</td>
                            <td>
                              <input
                                value={draft.name}
                                onChange={(event) =>
                                  setEditing({ ...editing, [item.id]: { ...draft, name: event.target.value } })
                                }
                              />
                            </td>
                            <td>{item.email}</td>
                            <td>
                              <select
                                value={draft.role}
                                onChange={(event) =>
                                  setEditing({ ...editing, [item.id]: { ...draft, role: event.target.value } })
                                }
                              >
                                {ROLE_OPTIONS.map((role) => (
                                  <option key={role.value} value={role.value}>
                                    {role.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>{item.created_at}</td>
                            <td>
                              <div className="account-row-actions">
                                <button className="icon-action-button" disabled={loading} onClick={() => updateAccount(item.id)} title="Save" type="button">
                                  <Save size={15} />
                                </button>
                                <button className="icon-action-button danger" disabled={loading} onClick={() => deleteAccount(item.id)} title="Delete" type="button">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          No accounts
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}
