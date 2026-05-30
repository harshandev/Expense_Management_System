"use client";
import { useEffect, useState, useRef } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, ShoppingBag, Activity, MessageCircle,
  X, Send, Sparkles, AlertTriangle, Lightbulb, Trophy, Zap,
  ArrowUpRight, ArrowDownRight, RefreshCw, ChevronRight, Target,
  BarChart2, Receipt, Brain, Clock, Flame,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────
const COLORS  = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];
const CAT_EMOJI: Record<string,string> = {
  Food:"🍔",Transport:"🚗",Shopping:"🛍",Entertainment:"🎬",
  Health:"💊",Utilities:"⚡",Education:"📚",Investment:"📈",Other:"📦",
};
const INSIGHT_CFG: Record<string,{bg:string;border:string;badge:string;Icon:React.ElementType}> = {
  warning:    {bg:"bg-red-50",   border:"border-red-200",   badge:"bg-red-100 text-red-700",    Icon:AlertTriangle},
  tip:        {bg:"bg-blue-50",  border:"border-blue-200",  badge:"bg-blue-100 text-blue-700",  Icon:Lightbulb},
  achievement:{bg:"bg-green-50", border:"border-green-200", badge:"bg-green-100 text-green-700",Icon:Trophy},
  prediction: {bg:"bg-purple-50",border:"border-purple-200",badge:"bg-purple-100 text-purple-700",Icon:Zap},
};
const TABS = ["Overview","Analytics","Budget","Intelligence"] as const;
type Tab = typeof TABS[number];

// ── Types ─────────────────────────────────────────────────────────────────
interface Summary {
  total:number; count:number; prevTotal:number; momChange:number;
  healthScore:number; dailyAvg:number; projectedEnd:number;
  maxExpense:number; avgExpense:number; month:string; yearMonth:string;
  categoryChart:{name:string;value:number}[];
  trend:{date:string;amount:number}[];
  heatmap:{day:string;amount:number}[];
  monthComparison:{category:string;current:number;previous:number}[];
  budgetTracker:{category:string;spent:number;budget:number;pct:number;over:boolean}[];
  topMerchants:{name:string;total:number;count:number;avg:number}[];
  recent:{id:string;merchant:string;amount:number;category:string;description:string;created_at:string}[];
  scoreBreakdown:{budgetAdherence:number;diversity:number;spendControl:number};
}
interface Insight {type:string;icon:string;title:string;message:string;}
interface ChatMsg  {role:"user"|"assistant";content:string;}

// ── Reusable Components ───────────────────────────────────────────────────
function KpiCard({icon:Icon,label,value,sub,color,trend,trendVal}:{
  icon:React.ElementType;label:string;value:string;sub?:string;
  color:string;trend?:"up"|"down"|"neutral";trendVal?:string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white"/>
        </div>
        {trendVal && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 px-2 py-1 rounded-full ${
            trend==="up" ? "bg-red-50 text-red-600" : trend==="down" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
          }`}>
            {trend==="up"?<ArrowUpRight size={12}/>:trend==="down"?<ArrowDownRight size={12}/>:null}
            {trendVal}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeader({icon:Icon,title,sub}:{icon:React.ElementType;title:string;sub?:string}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
        <Icon size={16} className="text-indigo-600"/>
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,       setData]       = useState<Summary|null>(null);
  const [insights,   setInsights]   = useState<Insight[]>([]);
  const [firstLoad,  setFirstLoad]  = useState(true);   // full-page spinner on initial load only
  const [dataLoading,setDataLoading]= useState(false);  // subtle spinner on month change
  const [iLoading,   setILoading]   = useState(true);
  const [tab,        setTab]        = useState<Tab>("Overview");
  const [chatOpen,   setChatOpen]   = useState(false);
  const [history,    setHistory]    = useState<ChatMsg[]>([{
    role:"assistant",
    content:"Hi! I'm your EMSI AI assistant 👋 I can see all your spending data. Ask me anything about your finances!"
  }]);
  const [input,      setInput]      = useState("");
  const [chatBusy,   setChatBusy]   = useState(false);
  const [selMonth,   setSelMonth]   = useState(()=>new Date().toISOString().slice(0,7));
  const chatEnd = useRef<HTMLDivElement>(null);

  const currentMonth = new Date().toISOString().slice(0,7);
  // Compute display label directly from selMonth — updates instantly on arrow click
  const monthLabel = new Date(selMonth + "-02").toLocaleString("default",{month:"long",year:"numeric"});

  const load = (month: string, initial = false) => {
    initial ? setFirstLoad(true) : setDataLoading(true);
    fetch(`/api/summary?month=${month}`)
      .then(r=>r.json())
      .then(d=>{ setData(d); setFirstLoad(false); setDataLoading(false); });
  };
  const loadInsights = () => {
    setILoading(true);
    fetch("/api/insights").then(r=>r.json()).then(d=>{setInsights(d.insights||[]);setILoading(false);});
  };

  const changeMonth = (dir: -1|1) => {
    const [y,m] = selMonth.split("-").map(Number);
    const nd = new Date(y, m - 1 + dir, 1);
    const nm = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`;
    if (nm > currentMonth) return;
    setSelMonth(nm);
    load(nm);
  };

  useEffect(()=>{load(selMonth, true); loadInsights();},[]);
  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[history]);

  const sendChat = async (quickMsg?: string) => {
    const msg = (quickMsg ?? input).trim();
    if (!msg||chatBusy) return;
    setInput(""); setChatBusy(true);
    const next:ChatMsg[] = [...history,{role:"user",content:msg}];
    setHistory(next);
    const res  = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,history:next})});
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let out="";
    setHistory(p=>[...p,{role:"assistant",content:""}]);
    while(true){const{done,value}=await reader.read();if(done)break;out+=dec.decode(value);setHistory(p=>{const u=[...p];u[u.length-1]={role:"assistant",content:out};return u;});}
    setChatBusy(false);
  };

  if (firstLoad) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg animate-pulse">
          <Wallet size={28} className="text-white"/>
        </div>
        <div>
          <p className="font-semibold text-gray-800">EMSI</p>
          <p className="text-sm text-gray-400">Loading financial intelligence...</p>
        </div>
      </div>
    </div>
  );
  if (!data) return null;

  const scoreGauge = [
    {name:"Budget Control",  value:data.scoreBreakdown.budgetAdherence, fill:"#6366f1"},
    {name:"Spend Diversity",  value:data.scoreBreakdown.diversity,       fill:"#10b981"},
    {name:"Spend Control",    value:data.scoreBreakdown.spendControl,    fill:"#f59e0b"},
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow">
              <Wallet size={17} className="text-white"/>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-none">EMSI</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Expense Management System Intelligence</p>
            </div>
          </div>
          <nav className="hidden md:flex bg-gray-100 rounded-xl p-1 gap-0.5">
            {TABS.map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===t?"bg-white text-indigo-600 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
                {t}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={()=>{load(selMonth);loadInsights();}}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <RefreshCw size={16}/>
            </button>
            <a href="https://wa.me/14155238886" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
              <MessageCircle size={15}/><span className="hidden sm:inline">WhatsApp</span>
            </a>
          </div>
        </div>
        {/* Mobile tabs */}
        <div className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${tab===t?"bg-indigo-600 text-white":"bg-gray-100 text-gray-500"}`}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-1">

        {/* ── Page title + Month Navigator ───────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={()=>changeMonth(-1)} disabled={dataLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 transition-colors text-gray-500 disabled:opacity-40">
              <ChevronRight size={16} className="rotate-180"/>
            </button>
            <div>
              {/* monthLabel from state — updates instantly before API responds */}
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">{monthLabel}</h2>
                {dataLoading && <RefreshCw size={14} className="text-indigo-400 animate-spin"/>}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">
                {dataLoading ? "Loading…" : `${data.count} transactions · Updated just now`}
              </p>
            </div>
            <button onClick={()=>changeMonth(1)} disabled={selMonth>=currentMonth||dataLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 transition-colors text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16}/>
            </button>
          </div>
          <div className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 ${
            data.momChange>0?"bg-red-50 text-red-600":"bg-green-50 text-green-600"
          }`}>
            {data.momChange>0?<TrendingUp size={16}/>:<TrendingDown size={16}/>}
            {data.momChange>0?"+":""}{data.momChange}% vs last month
          </div>
        </div>

        {/* ── KPI Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <KpiCard icon={Wallet}   label="Total Spent"   color="bg-indigo-500"
            value={`₹${data.total.toLocaleString("en-IN")}`}
            sub={`${data.count} transactions`}
            trend={data.momChange>0?"up":"down"} trendVal={`${Math.abs(data.momChange)}%`}/>
          <KpiCard icon={Target}   label="Daily Average" color="bg-violet-500"
            value={`₹${data.dailyAvg.toLocaleString("en-IN")}`} sub="per day"/>
          <KpiCard icon={Flame}    label="Projected"     color="bg-orange-500"
            value={`₹${data.projectedEnd.toLocaleString("en-IN")}`} sub="by month end"/>
          <KpiCard icon={Receipt}  label="Avg Transaction" color="bg-amber-500"
            value={`₹${data.avgExpense.toLocaleString("en-IN")}`}
            sub={`Max ₹${data.maxExpense.toLocaleString("en-IN")}`}/>
          <KpiCard icon={Activity} label="Health Score"  color="bg-emerald-500"
            value={`${data.healthScore}/100`}
            sub={data.healthScore>=70?"Excellent 🎉":data.healthScore>=50?"Fair 📈":"Needs Work 💪"}/>
        </div>

        {/* ══════════════════ OVERVIEW TAB ══════════════════════════════ */}
        {tab==="Overview" && (
          <div className="space-y-5">
            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <SectionHeader icon={BarChart2} title="Spending Trend" sub="Day-by-day this month"/>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.trend} margin={{top:0,right:0,left:-20,bottom:0}}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25}/>
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="date" tick={{fontSize:10}} tickFormatter={d=>d.slice(5)}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={(v)=>[`₹${Number(v).toLocaleString("en-IN")}`,"Spent"]}/>
                    <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2.5} fill="url(#areaGrad)"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <SectionHeader icon={ShoppingBag} title="Categories" sub="This month"/>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={data.categoryChart} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                      {data.categoryChart.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={(v)=>[`₹${Number(v).toLocaleString("en-IN")}`]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {data.categoryChart.slice(0,4).map((c,i)=>(
                    <div key={c.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{background:COLORS[i%COLORS.length]}}/>
                        <span className="text-xs text-gray-600">{CAT_EMOJI[c.name]||"📦"} {c.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800">₹{c.value.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Insights */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                    <Brain size={18} className="text-indigo-300"/>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">AI Financial Insights</h3>
                    <p className="text-indigo-400 text-xs">GPT-4o mini · Personalised for your data</p>
                  </div>
                </div>
                <button onClick={loadInsights} className="text-xs text-indigo-300 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={11}/> Regenerate
                </button>
              </div>
              {iLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[1,2,3,4].map(i=>(
                    <div key={i} className="bg-white/5 rounded-xl p-4 animate-pulse space-y-2">
                      <div className="w-8 h-8 bg-white/10 rounded-lg"/>
                      <div className="h-3 bg-white/10 rounded w-3/4"/>
                      <div className="h-2 bg-white/10 rounded w-full"/>
                      <div className="h-2 bg-white/10 rounded w-2/3"/>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {insights.map((ins,i)=>{
                    const cfg = INSIGHT_CFG[ins.type]||INSIGHT_CFG.tip;
                    return (
                      <div key={i} className={`rounded-xl p-4 border ${cfg.bg} ${cfg.border}`}>
                        <span className="text-2xl">{ins.icon}</span>
                        <div className="mt-2 mb-1 flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{ins.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{ins.type}</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{ins.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Top Merchants */}
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <SectionHeader icon={Receipt} title="Top Merchants" sub="By spend this month"/>
                <div className="space-y-3">
                  {data.topMerchants.length===0 ? (
                    <p className="text-gray-300 text-sm text-center py-6">No data yet</p>
                  ) : data.topMerchants.map((m,i)=>(
                    <div key={m.name} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                        style={{background:COLORS[i%COLORS.length]}}>
                        {m.name.slice(0,1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                          <span className="text-sm font-bold text-gray-900 ml-2">₹{m.total.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${Math.min((m.total/data.total)*100,100)}%`,background:COLORS[i%COLORS.length]}}/>
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{m.count}× · avg ₹{m.avg.toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Transactions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-indigo-500"/>
                    <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{data.count} total</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-[280px] overflow-y-auto">
                  {data.recent.map(t=>(
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-base">{CAT_EMOJI[t.category]||"📦"}</div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{t.merchant||"Unknown"}</p>
                          <p className="text-xs text-gray-400">{t.category} · {new Date(t.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">₹{Number(t.amount).toLocaleString("en-IN")}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ ANALYTICS TAB ═════════════════════════════ */}
        {tab==="Analytics" && (
          <div className="space-y-5">
            {/* Month comparison */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <SectionHeader icon={BarChart2} title="Month-over-Month Comparison" sub="This month vs last month by category"/>
              {data.monthComparison.length===0 ? (
                <div className="h-56 flex items-center justify-center text-gray-300">No data to compare yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.monthComparison} margin={{top:0,right:0,left:-10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="category" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={(v,n)=>[`₹${Number(v).toLocaleString("en-IN")}`,n==="current"?"This Month":"Last Month"]}/>
                    <Bar dataKey="current"  name="This Month" fill="#6366f1" radius={[4,4,0,0]}/>
                    <Bar dataKey="previous" name="Last Month"  fill="#e0e7ff" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Heatmap + health breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <SectionHeader icon={Flame} title="Spending by Day of Week" sub="Which days you spend most"/>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.heatmap} margin={{top:0,right:0,left:-15,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="day" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={(v)=>[`₹${Number(v).toLocaleString("en-IN")}`,"Spent"]}/>
                    <Bar dataKey="amount" radius={[4,4,0,0]}>
                      {data.heatmap.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <SectionHeader icon={Activity} title="Health Score Breakdown" sub="What drives your score"/>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="45%" height={160}>
                    <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="100%" data={scoreGauge} startAngle={90} endAngle={-270}>
                      <RadialBar dataKey="value" cornerRadius={4} background={{fill:"#f1f5f9"}}/>
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold" fill="#1e1b4b">{data.healthScore}</text>
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {scoreGauge.map(g=>(
                      <div key={g.name}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-gray-500">{g.name}</span>
                          <span className="text-xs font-bold" style={{color:g.fill}}>{g.value}/100</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:`${g.value}%`,background:g.fill}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Category progress */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <SectionHeader icon={TrendingUp} title="Full Category Breakdown" sub="Percentage of total spend"/>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
                {data.categoryChart.map((c,i)=>{
                  const pct = data.total>0?Math.round(c.value/data.total*100):0;
                  return (
                    <div key={c.name}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700">{CAT_EMOJI[c.name]||"📦"} {c.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{pct}%</span>
                          <span className="text-sm font-bold text-gray-900">₹{c.value.toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${pct}%`,background:COLORS[i%COLORS.length]}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ BUDGET TAB ════════════════════════════════ */}
        {tab==="Budget" && (
          <div className="space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <Target size={18} className="text-amber-600 flex-shrink-0"/>
              <p className="text-sm text-amber-800">Budgets are AI-suggested based on healthy spending ratios. You'll be able to customize them soon.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.budgetTracker.map((b,i)=>(
                <div key={b.category} className={`bg-white rounded-2xl p-5 border shadow-sm ${b.over?"border-red-200":"border-gray-100"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{CAT_EMOJI[b.category]||"📦"}</span>
                      <span className="font-semibold text-gray-900">{b.category}</span>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${b.over?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>
                      {b.over?"Over budget":"On track"}
                    </span>
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">₹{b.spent.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-gray-400">of ₹{b.budget.toLocaleString("en-IN")} budget</p>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{width:`${Math.min(b.pct,100)}%`,background:b.over?"#ef4444":COLORS[i%COLORS.length]}}/>
                  </div>
                  {!b.over && (
                    <p className="text-xs text-green-600 mt-1.5">₹{(b.budget-b.spent).toLocaleString("en-IN")} remaining</p>
                  )}
                  {b.over && (
                    <p className="text-xs text-red-600 mt-1.5">₹{(b.spent-b.budget).toLocaleString("en-IN")} over budget</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════ INTELLIGENCE TAB ═════════════════════════ */}
        {tab==="Intelligence" && (
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Brain size={20} className="text-indigo-300"/>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-lg">AI Financial Intelligence</h3>
                  <p className="text-indigo-400 text-sm">Powered by GPT-4o mini · Analysing your real spending data</p>
                </div>
                <button onClick={loadInsights} className="ml-auto text-xs text-indigo-300 hover:text-white bg-white/10 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={12}/> Regenerate
                </button>
              </div>
              {iLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1,2,3,4].map(i=>(
                    <div key={i} className="bg-white/5 rounded-xl p-5 animate-pulse space-y-3">
                      <div className="w-10 h-10 bg-white/10 rounded-xl"/>
                      <div className="h-4 bg-white/10 rounded w-2/3"/>
                      <div className="space-y-1.5">
                        <div className="h-2.5 bg-white/10 rounded w-full"/>
                        <div className="h-2.5 bg-white/10 rounded w-4/5"/>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {insights.map((ins,i)=>{
                    const cfg = INSIGHT_CFG[ins.type]||INSIGHT_CFG.tip;
                    return (
                      <div key={i} className={`rounded-xl p-5 border ${cfg.bg} ${cfg.border}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-3xl leading-none">{ins.icon}</span>
                          <div>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="font-semibold text-gray-900">{ins.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{ins.type}</span>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">{ins.message}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Key financial metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {label:"Projected Month End", value:`₹${data.projectedEnd.toLocaleString("en-IN")}`, icon:TrendingUp, color:"bg-violet-500"},
                {label:"Largest Expense",     value:`₹${data.maxExpense.toLocaleString("en-IN")}`,   icon:AlertTriangle, color:"bg-red-500"},
                {label:"Avg Transaction",     value:`₹${data.avgExpense.toLocaleString("en-IN")}`,   icon:Receipt, color:"bg-amber-500"},
                {label:"Over-Budget Items",   value:`${data.budgetTracker.filter(b=>b.over).length}`, icon:Target, color:"bg-orange-500"},
              ].map(m=>(
                <div key={m.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className={`w-9 h-9 ${m.color} rounded-xl flex items-center justify-center mb-3`}>
                    <m.icon size={17} className="text-white"/>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">{m.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8 pb-4">
          EMSI · Expense Management System Intelligence · Powered by GPT-4o Vision + GPT-4o mini
        </p>
      </main>

      {/* ── Floating Chat Button ──────────────────────────────────────── */}
      {!chatOpen && (
        <button onClick={()=>setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
          <Sparkles size={22} className="text-white"/>
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white animate-pulse"/>
        </button>
      )}

      {/* ── AI Chat Panel ─────────────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[370px] max-h-[580px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
                <Brain size={17} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">EMSI AI Assistant</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"/>
                  <p className="text-indigo-200 text-xs">Knows your spending data</p>
                </div>
              </div>
            </div>
            <button onClick={()=>setChatOpen(false)} className="text-white/70 hover:text-white transition-colors p-1">
              <X size={18}/>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.map((m,i)=>(
              <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                {m.role==="assistant" && (
                  <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                    <Brain size={13} className="text-indigo-600"/>
                  </div>
                )}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role==="user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}>
                  {m.content||<span className="flex gap-1 py-0.5">
                    {[0,150,300].map(d=><span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}
                  </span>}
                </div>
              </div>
            ))}
            <div ref={chatEnd}/>
          </div>

          {history.length<=2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {["Where am I overspending?","How to save ₹5,000?","Biggest expense this month","Compare to last month"].map(q=>(
                <button key={q} onClick={()=>sendChat(q)}
                  className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors flex items-center gap-1">
                  <ChevronRight size={10}/>{q}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 border-t border-gray-100 flex-shrink-0">
            <div className="flex gap-2">
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()}
                placeholder="Ask about your finances..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"/>
              <button onClick={()=>sendChat()} disabled={!input.trim()||chatBusy}
                className="w-11 h-11 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
                <Send size={15} className="text-white"/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
