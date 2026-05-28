"use client";

import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Wallet, TrendingUp, ShoppingBag, Activity,
  ArrowUpRight, ArrowDownRight, MessageCircle,
} from "lucide-react";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

const CATEGORY_EMOJI: Record<string, string> = {
  Food: "🍔", Transport: "🚗", Shopping: "🛍",
  Entertainment: "🎬", Health: "💊", Utilities: "⚡",
  Education: "📚", Investment: "📈", Other: "📦",
};

interface SummaryData {
  total: number;
  count: number;
  healthScore: number;
  categoryChart: { name: string; value: number }[];
  trend: { date: string; amount: number }[];
  recent: {
    id: string; merchant: string; amount: number;
    category: string; description: string; created_at: string;
  }[];
  month: string;
}

function StatCard({
  icon: Icon, label, value, sub, color, trend,
}: {
  icon: React.ElementType; label: string; value: string;
  sub?: string; color: string; trend?: "up" | "down";
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        {trend && (
          <span className={`flex items-center text-xs font-medium ${trend === "up" ? "text-red-500" : "text-green-500"}`}>
            {trend === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/summary")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading your finances...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const scoreColor = data.healthScore >= 70 ? "text-green-500" : data.healthScore >= 50 ? "text-yellow-500" : "text-red-500";
  const scoreLabel = data.healthScore >= 70 ? "Great" : data.healthScore >= 50 ? "Fair" : "Needs work";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Wallet size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-none">EMSI</h1>
              <p className="text-xs text-gray-400">Expense Management System Intelligence</p>
            </div>
          </div>
          <a
            href="https://wa.me/14155238886"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <MessageCircle size={16} />
            Open WhatsApp Bot
          </a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Month title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{data.month} Overview</h2>
          <p className="text-gray-500 text-sm mt-1">Your AI-powered expense management intelligence</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={Wallet} label="Total Spent" color="bg-indigo-500"
            value={`₹${data.total.toLocaleString("en-IN")}`}
            sub={`${data.count} transactions`} trend="up"
          />
          <StatCard
            icon={ShoppingBag} label="Top Category" color="bg-amber-500"
            value={data.categoryChart[0]?.name || "—"}
            sub={data.categoryChart[0] ? `₹${data.categoryChart[0].value.toLocaleString("en-IN")}` : ""}
          />
          <StatCard
            icon={Activity} label="Avg per Day" color="bg-emerald-500"
            value={`₹${data.count > 0 ? Math.round(data.total / new Date().getDate()).toLocaleString("en-IN") : 0}`}
            sub="this month"
          />
          <StatCard
            icon={TrendingUp} label="Health Score" color="bg-violet-500"
            value={`${data.healthScore}/100`}
            sub={scoreLabel}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Category Breakdown */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-6">Spending by Category</h3>
            {data.categoryChart.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                No data yet — send a receipt on WhatsApp!
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={data.categoryChart} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                      {data.categoryChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1">
                  {data.categoryChart.slice(0, 5).map((cat, i) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-sm text-gray-600">
                          {CATEGORY_EMOJI[cat.name] || "📦"} {cat.name}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        ₹{cat.value.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Daily Trend */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-6">Daily Spending Trend</h3>
            {data.trend.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                No data yet — send a receipt on WhatsApp!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Spent"]} labelFormatter={(l) => `Date: ${l}`} />
                  <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
          </div>
          {data.recent.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No transactions yet. Send a receipt on WhatsApp to get started!
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recent.map((t) => (
                <div key={t.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-lg">
                      {CATEGORY_EMOJI[t.category] || "📦"}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{t.merchant || "Unknown"}</p>
                      <p className="text-xs text-gray-400">{t.description || t.category} · {new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">₹{Number(t.amount).toLocaleString("en-IN")}</p>
                    <p className="text-xs text-gray-400">{t.category}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          Expense Management System Intelligence · Powered by GPT-4o Vision · Real-time via WhatsApp
        </div>
      </div>
    </div>
  );
}
