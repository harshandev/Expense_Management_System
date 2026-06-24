"use client";
import { useState, useEffect, useCallback } from "react";
import { TIERS, Tier, canAddMore, getLimit, limitLabel } from "@/lib/tier-config";

type WaEntry   = { phone: string; label: string };
type UserEntry = { name: string; email: string; password: string };
type TenantRow = {
  id: string; name: string; slug: string; tier: string;
  active: boolean; created_at: string; user_count: number; wa_count: number;
};

const EMPTY_USER = (): UserEntry => ({ name: "", email: "", password: "" });
const EMPTY_WA   = (): WaEntry  => ({ phone: "", label: "" });

const inputCls =
  "w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white " +
  "placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors";

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function PasswordGate({
  pw, setPw, onUnlock, error, checking,
}: {
  pw: string; setPw: (s: string) => void;
  onUnlock: () => void; error: string; checking: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-xl font-bold mx-auto mb-4">
            E
          </div>
          <h1 className="text-xl font-bold text-white">Admin Console</h1>
          <p className="text-gray-500 text-sm mt-1">ExpenseArc internal portal</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <Field label="Admin Password">
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onUnlock()}
              placeholder="••••••••••"
              className={inputCls}
              autoFocus
            />
          </Field>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={onUnlock}
            disabled={checking || !pw}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold text-white transition-colors"
          >
            {checking ? "Checking…" : "Enter →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessCard({
  slug, name, tier, admin, viewers, waNumbers, onNew,
}: {
  slug: string; name: string; tier: Tier;
  admin: UserEntry; viewers: UserEntry[]; waNumbers: WaEntry[];
  onNew: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const credText = [
    `ExpenseArc — ${name}`,
    `Tier: ${TIERS[tier].label}`,
    `Dashboard: https://your-app.vercel.app?tenant=${slug}`,
    "",
    "Admin Login:",
    `  Email:    ${admin.email}`,
    `  Password: ${admin.password}`,
    "",
    ...viewers.filter(v => v.email).map((v, i) => `Viewer ${i + 1}: ${v.email} / ${v.password}`),
    "",
    "WhatsApp Numbers (registered):",
    ...waNumbers.filter(w => w.phone).map(w => `  ${w.phone}${w.label ? ` (${w.label})` : ""}`),
  ].join("\n").trim();

  const copy = () => {
    navigator.clipboard.writeText(credText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-emerald-900/50 border border-emerald-700 flex items-center justify-center text-3xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-xl font-bold text-white">{name} onboarded!</h1>
          <p className="text-gray-400 text-sm mt-1">
            Save these credentials — passwords cannot be recovered later.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
            {credText}
          </pre>
        </div>

        <div className="flex gap-3">
          <button
            onClick={copy}
            className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium text-white transition-colors"
          >
            {copied ? "Copied!" : "Copy Credentials"}
          </button>
          <button
            onClick={onNew}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
          >
            Onboard Another →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  // Auth
  const [locked,    setLocked]    = useState(true);
  const [pw,        setPw]        = useState("");
  const [authError, setAuthError] = useState("");
  const [checking,  setChecking]  = useState(false);

  // Form
  const [name,            setName]            = useState("");
  const [slug,            setSlug]            = useState("");
  const [tier,            setTier]            = useState<Tier>("basic");
  const [supabaseUrl,     setSupabaseUrl]     = useState("");
  const [supabaseAnon,    setSupabaseAnon]    = useState("");
  const [supabaseService, setSupabaseService] = useState("");
  const [waNumbers, setWaNumbers] = useState<WaEntry[]>([EMPTY_WA()]);
  const [admin,     setAdmin]     = useState<UserEntry>(EMPTY_USER());
  const [viewers,   setViewers]   = useState<UserEntry[]>([EMPTY_USER()]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");
  const [success,    setSuccess]    = useState<{ slug: string } | null>(null);

  // Tenants list
  const [tenants,        setTenants]        = useState<TenantRow[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Edit modal
  const [editTenant,    setEditTenant]    = useState<TenantRow | null>(null);
  const [editName,      setEditName]      = useState("");
  const [editTier,      setEditTier]      = useState<Tier>("basic");
  const [editActive,    setEditActive]    = useState(true);
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState("");

  // Auto-slug from name
  useEffect(() => {
    setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }, [name]);

  // Clamp rows when tier changes
  useEffect(() => {
    const waLimit = getLimit(tier, "whatsapp_slots");
    if (waLimit !== -1 && waNumbers.length > waLimit) setWaNumbers(w => w.slice(0, waLimit));
    const vLimit = getLimit(tier, "dashboard_viewers");
    if (vLimit !== -1 && viewers.length > vLimit) setViewers(v => v.slice(0, vLimit));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  const loadTenants = useCallback(async () => {
    setLoadingTenants(true);
    const res = await fetch("/api/superadmin/tenants");
    if (res.ok) {
      const data = await res.json();
      setTenants(data.tenants ?? []);
    }
    setLoadingTenants(false);
  }, []);

  const openEdit = (t: TenantRow) => {
    setEditTenant(t);
    setEditName(t.name);
    setEditTier(t.tier as Tier);
    setEditActive(t.active);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editTenant) return;
    setEditSaving(true);
    setEditError("");
    const res = await fetch(`/api/superadmin/tenants/${editTenant.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, tier: editTier, active: editActive }),
    });
    setEditSaving(false);
    if (res.ok) {
      setEditTenant(null);
      loadTenants();
    } else {
      const d = await res.json().catch(() => ({}));
      setEditError(d.error || "Update failed");
    }
  };

  const unlock = async () => {
    setChecking(true);
    setAuthError("");
    const res = await fetch("/api/superadmin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setChecking(false);
    if (res.ok) { setLocked(false); loadTenants(); }
    else        { setAuthError("Wrong password."); }
  };

  const submit = async () => {
    setSubmitting(true);
    setFormError("");
    const res = await fetch("/api/superadmin/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, slug, tier,
        supabase_url:         supabaseUrl,
        supabase_anon_key:    supabaseAnon,
        supabase_service_key: supabaseService,
        whatsapp_numbers:     waNumbers.filter(w => w.phone.trim()),
        admin,
        viewers:              viewers.filter(v => v.email.trim() && v.password.trim()),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(data.error ?? "Something went wrong"); return; }
    setSuccess({ slug: data.slug });
    loadTenants();
  };

  const resetForm = () => {
    setSuccess(null); setFormError("");
    setName(""); setSlug(""); setTier("basic");
    setSupabaseUrl(""); setSupabaseAnon(""); setSupabaseService("");
    setWaNumbers([EMPTY_WA()]); setAdmin(EMPTY_USER()); setViewers([EMPTY_USER()]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (locked) {
    return <PasswordGate pw={pw} setPw={setPw} onUnlock={unlock} error={authError} checking={checking} />;
  }

  if (success) {
    return (
      <SuccessCard
        slug={success.slug} name={name} tier={tier}
        admin={admin} viewers={viewers} waNumbers={waNumbers}
        onNew={resetForm}
      />
    );
  }

  const tierCfg = TIERS[tier];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold">E</div>
              <span className="text-xs text-gray-500 font-medium tracking-widest uppercase">ExpenseArc Admin</span>
            </div>
            <h1 className="text-2xl font-bold">New Client Onboarding</h1>
          </div>
          {tenants.length > 0 && (
            <span className="text-sm text-gray-500">{tenants.length} client{tenants.length !== 1 ? "s" : ""} active</span>
          )}
        </div>

        {formError && (
          <div className="mb-5 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* ── Left column ── */}
          <div className="space-y-5">

            {/* Client Info */}
            <Section title="Client Info">
              <Field label="Company Name">
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Acme Corp" className={inputCls} />
              </Field>
              <Field label="Slug (URL identifier)">
                <input value={slug} onChange={e => setSlug(e.target.value)}
                  placeholder="acme-corp" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Plan Tier">
                <select value={tier} onChange={e => setTier(e.target.value as Tier)} className={inputCls}>
                  {(Object.entries(TIERS) as [Tier, typeof TIERS[Tier]][]).map(([key, t]) => (
                    <option key={key} value={key}>
                      {t.label} — WA: {limitLabel(t.whatsapp_slots)} · Admins: {limitLabel(t.dashboard_admins)} · Viewers: {limitLabel(t.dashboard_viewers)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-2 pt-1">
                {(Object.entries(tierCfg.features) as [string, boolean][]).map(([feat, on]) => (
                  <span
                    key={feat}
                    className={`px-2 py-0.5 rounded-full text-xs border ${
                      on
                        ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                        : "bg-gray-900 text-gray-600 border-gray-800"
                    }`}
                  >
                    {feat.replace(/_/g, " ")}: {on ? "✓" : "✗"}
                  </span>
                ))}
              </div>
            </Section>

            {/* Supabase Creds */}
            <Section title="Client's Supabase Project">
              <Field label="Project URL">
                <input value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxxxxxx.supabase.co" className={inputCls} />
              </Field>
              <Field label="Anon / Public Key">
                <input value={supabaseAnon} onChange={e => setSupabaseAnon(e.target.value)}
                  placeholder="eyJ…" className={inputCls} />
              </Field>
              <Field label="Service Role Key">
                <input type="password" value={supabaseService} onChange={e => setSupabaseService(e.target.value)}
                  placeholder="eyJ…" className={inputCls} />
              </Field>
              <p className="text-xs text-gray-600">
                Supabase → Settings → API. Service role key is secret — store it safely.
              </p>
            </Section>

          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">

            {/* WhatsApp Numbers */}
            <Section title={`WhatsApp Numbers  ${waNumbers.length} / ${limitLabel(tierCfg.whatsapp_slots)}`}>
              {waNumbers.map((wa, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={wa.phone}
                    onChange={e => { const a = [...waNumbers]; a[i] = { ...a[i], phone: e.target.value }; setWaNumbers(a); }}
                    placeholder="+91 98765 43210"
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    value={wa.label}
                    onChange={e => { const a = [...waNumbers]; a[i] = { ...a[i], label: e.target.value }; setWaNumbers(a); }}
                    placeholder="Label"
                    className={`${inputCls} w-28`}
                  />
                  {waNumbers.length > 1 && (
                    <button
                      onClick={() => setWaNumbers(waNumbers.filter((_, j) => j !== i))}
                      className="text-red-600 hover:text-red-400 text-lg leading-none px-1"
                    >×</button>
                  )}
                </div>
              ))}
              {canAddMore(tier, "whatsapp_slots", waNumbers.length) && (
                <button
                  onClick={() => setWaNumbers([...waNumbers, EMPTY_WA()])}
                  className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  + Add Number
                </button>
              )}
            </Section>

            {/* Admin User */}
            <Section title="Admin User (Read + Write)">
              <Field label="Name">
                <input value={admin.name} onChange={e => setAdmin({ ...admin, name: e.target.value })}
                  placeholder="Admin Name" className={inputCls} />
              </Field>
              <Field label="Email">
                <input value={admin.email} onChange={e => setAdmin({ ...admin, email: e.target.value })}
                  placeholder="admin@company.com" className={inputCls} />
              </Field>
              <Field label="Password">
                <input type="password" value={admin.password} onChange={e => setAdmin({ ...admin, password: e.target.value })}
                  placeholder="Strong password" className={inputCls} />
              </Field>
            </Section>

            {/* Viewers */}
            <Section title={`Viewers (Read Only)  ${viewers.length} / ${limitLabel(tierCfg.dashboard_viewers)}`}>
              {viewers.map((v, i) => (
                <div key={i} className="space-y-2 pb-3 border-b border-gray-800 last:border-0 last:pb-0">
                  <div className="flex gap-2 items-center">
                    <input
                      value={v.name}
                      onChange={e => { const a = [...viewers]; a[i] = { ...a[i], name: e.target.value }; setViewers(a); }}
                      placeholder="Name"
                      className={`${inputCls} flex-1`}
                    />
                    {viewers.length > 1 && (
                      <button
                        onClick={() => setViewers(viewers.filter((_, j) => j !== i))}
                        className="text-red-600 hover:text-red-400 text-lg leading-none px-1"
                      >×</button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={v.email}
                      onChange={e => { const a = [...viewers]; a[i] = { ...a[i], email: e.target.value }; setViewers(a); }}
                      placeholder="email@company.com"
                      className={`${inputCls} flex-1`}
                    />
                    <input
                      type="password"
                      value={v.password}
                      onChange={e => { const a = [...viewers]; a[i] = { ...a[i], password: e.target.value }; setViewers(a); }}
                      placeholder="Password"
                      className={`${inputCls} flex-1`}
                    />
                  </div>
                </div>
              ))}
              {canAddMore(tier, "dashboard_viewers", viewers.length) && (
                <button
                  onClick={() => setViewers([...viewers, EMPTY_USER()])}
                  className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  + Add Viewer
                </button>
              )}
            </Section>

          </div>
        </div>

        {/* Submit */}
        <div className="mt-6">
          <button
            onClick={submit}
            disabled={submitting || !name.trim() || !supabaseUrl.trim() || !admin.email.trim() || !admin.password.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white transition-colors"
          >
            {submitting ? "Onboarding…" : "Onboard Client →"}
          </button>
        </div>

        {/* Existing Clients */}
        {(loadingTenants || tenants.length > 0) && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold mb-4 text-gray-200">
              Existing Clients {tenants.length > 0 && `(${tenants.length})`}
            </h2>
            {loadingTenants ? (
              <p className="text-gray-600 text-sm">Loading…</p>
            ) : (
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900">
                    <tr>
                      {["Company", "Slug", "Tier", "Users", "WA Numbers", "Created", "Status", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-gray-400 font-semibold uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {tenants.map(t => (
                      <tr key={t.id} className="hover:bg-gray-900/40 transition-colors">
                        <td className="px-4 py-3 font-medium">{t.name}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.slug}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 capitalize">
                            {t.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{t.user_count}</td>
                        <td className="px-4 py-3 text-gray-400">{t.wa_count}</td>
                        <td className="px-4 py-3 text-gray-400">
                          {new Date(t.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${t.active ? "text-emerald-400" : "text-red-400"}`}>
                            {t.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openEdit(t)}
                            className="text-xs text-indigo-400 hover:text-indigo-200 border border-indigo-800 hover:border-indigo-600 px-2.5 py-1 rounded-lg transition-colors">
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Edit Tenant Modal ──────────────────────────────────────────────── */}
      {editTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setEditTenant(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg">Edit — {editTenant.slug}</h3>
              <button onClick={() => setEditTenant(null)} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Company Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} className={inputCls}/>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Subscription Tier</label>
              <select value={editTier} onChange={e => setEditTier(e.target.value as Tier)} className={inputCls}>
                {(Object.keys(TIERS) as Tier[]).map(t => (
                  <option key={t} value={t}>
                    {TIERS[t].label} — {TIERS[t].whatsapp_slots === -1 ? "Unlimited" : TIERS[t].whatsapp_slots} WA · {TIERS[t].dashboard_viewers === -1 ? "Unlimited" : TIERS[t].dashboard_viewers} viewers
                  </option>
                ))}
              </select>
              <div className="flex gap-2 flex-wrap pt-1">
                {(Object.entries(TIERS[editTier].features) as [string, boolean][]).map(([feat, on]) => (
                  <span key={feat} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${on ? "bg-emerald-900 text-emerald-300" : "bg-gray-800 text-gray-500 line-through"}`}>
                    {feat.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-800/60 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm text-white font-medium">Account Status</p>
                <p className="text-xs text-gray-500 mt-0.5">{editActive ? "Tenant can log in and use the dashboard" : "All access blocked"}</p>
              </div>
              <button
                onClick={() => setEditActive(v => !v)}
                className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 ${editActive ? "bg-emerald-500" : "bg-gray-600"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${editActive ? "translate-x-5" : "translate-x-0"}`}/>
              </button>
            </div>

            {editError && <p className="text-xs text-red-400">{editError}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditTenant(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving || !editName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
