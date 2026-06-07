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
  BarChart2, Receipt, Brain, Clock, Flame, CheckCircle, UserCircle, ChevronDown,
  Upload, FileImage, FilePlus,
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
const TABS = ["Overview","Analytics","Budget","Intelligence","Upload"] as const;
type Tab = typeof TABS[number];

const CATEGORIES = ["Food","Transport","Shopping","Entertainment","Health","Utilities","Education","Investment","Other"] as const;

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
  recent:{id:string;merchant:string;amount:number;category:string;description:string;created_at:string;receipt_url:string|null}[];
  scoreBreakdown:{budgetAdherence:number;diversity:number;spendControl:number};
}
interface Insight {type:string;icon:string;title:string;message:string;}
interface ChatMsg  {role:"user"|"assistant";content:string;}
interface Toast    {id:number;type:"success"|"error"|"info";message:string;}

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
  const [data,          setData]          = useState<Summary|null>(null);
  const [insights,      setInsights]      = useState<Insight[]>([]);
  const [firstLoad,     setFirstLoad]     = useState(true);
  const [dataLoading,   setDataLoading]   = useState(false);
  const [iLoading,      setILoading]      = useState(true);
  const [tab,           setTab]           = useState<Tab>("Overview");
  const [chatOpen,      setChatOpen]      = useState(false);
  const [history,       setHistory]       = useState<ChatMsg[]>([{
    role:"assistant",
    content:"Hi! I'm your EMSI AI assistant 👋 I can see all your spending data. Ask me anything about your finances!"
  }]);
  const [input,         setInput]         = useState("");
  const [chatBusy,      setChatBusy]      = useState(false);
  const [selMonth,      setSelMonth]      = useState(()=>new Date().toISOString().slice(0,7));
  const [catFilter,     setCatFilter]     = useState("All");
  const [toasts,        setToasts]        = useState<Toast[]>([]);
  const [userName,      setUserName]      = useState("");
  const [nameInput,     setNameInput]     = useState("");
  const [showNameModal,  setShowNameModal]  = useState(false);

  // Upload tab state
  type UploadStage = "idle"|"analyzing"|"review"|"saving"|"success"|"error";
  interface EditableExpense {
    merchant: string; amount: string; category: string;
    subcategory: string; date: string; description: string; confidence: number;
  }
  interface UploadDuplicate {
    id: string; merchant: string; amount: number;
    expense_date: string; receipt_url: string | null;
  }
  const [uploadStage,      setUploadStage]      = useState<UploadStage>("idle");
  const [uploadFile,       setUploadFile]        = useState<File|null>(null);
  const [uploadPreview,    setUploadPreview]     = useState<string|null>(null);
  const [uploadReceiptUrl, setUploadReceiptUrl]  = useState<string|null>(null);
  const [uploadFileName,   setUploadFileName]    = useState<string>("");
  const [editedExpense,    setEditedExpense]     = useState<EditableExpense|null>(null);
  const [uploadError,      setUploadError]       = useState<string>("");
  const [uploadDrag,       setUploadDrag]        = useState(false);
  const [uploadDuplicate,  setUploadDuplicate]  = useState<UploadDuplicate|null>(null);
  const [uploadMetadata,   setUploadMetadata]   = useState<Record<string,unknown>|null>(null);
  const [uploadFileHash,   setUploadFileHash]   = useState<string>("");
  const [showMetadata,     setShowMetadata]     = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const selMonthRef = useRef(selMonth);
  const chatEnd     = useRef<HTMLDivElement>(null);

  const currentMonth = new Date().toISOString().slice(0,7);
  const monthLabel   = new Date(selMonth + "-02").toLocaleString("default",{month:"long",year:"numeric"});

  // Generate month options from March 2026 → current
  const monthOptions = (() => {
    const opts: {val:string;label:string}[] = [];
    let cur = new Date(2026, 2, 1); // March 2026
    const end = new Date(currentMonth + "-02");
    while (cur <= end) {
      const val = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;
      opts.push({ val, label: cur.toLocaleString("default",{month:"long",year:"numeric"}) });
      cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
    }
    return opts.reverse(); // newest first
  })();

  // ── Toast helper ───────────────────────────────────────────────────────
  const showToast = (message: string, type: Toast["type"] = "info") => {
    const id = Date.now();
    setToasts(p => [...p, {id, type, message}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  };

  // ── Name helpers ───────────────────────────────────────────────────────
  const saveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    setUserName(n);
    localStorage.setItem("emsi_username", n);
    setShowNameModal(false);
    setNameInput("");
    showToast(`Welcome, ${n}! 👋`, "success");
  };

  // ── Upload helpers ─────────────────────────────────────────────────────
  const resetUpload = () => {
    setUploadStage("idle"); setUploadFile(null); setUploadPreview(null);
    setUploadReceiptUrl(null); setEditedExpense(null); setUploadError(""); setUploadFileName("");
    setUploadDuplicate(null); setUploadMetadata(null); setUploadFileHash(""); setShowMetadata(false);
  };

  const handleUploadFile = (file: File) => {
    if (!file) return;
    resetUpload();
    setUploadFile(file);
    setUploadFileName(file.name);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setUploadPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
    setUploadStage("analyzing");
    // Kick off analysis immediately on file selection
    analyzeFile(file);
  };

  const analyzeFile = async (file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || "Processing failed."); setUploadStage("error"); return; }
      const e = json.expense as Record<string, unknown>;
      setUploadReceiptUrl(json.receiptUrl ?? null);
      setUploadFileHash(json.fileHash ?? "");
      setUploadDuplicate(json.duplicate ?? null);
      setUploadMetadata((e.metadata as Record<string,unknown>) ?? null);
      setEditedExpense({
        merchant:    String(e.merchant    || ""),
        amount:      String(e.amount      || ""),
        category:    String(e.category    || "Other"),
        subcategory: String(e.subcategory || ""),
        date:        String(e.date        || new Date().toISOString().slice(0,10)),
        description: String(e.description || ""),
        confidence:  Number(e.confidence  || 0),
      });
      setUploadStage("review");
    } catch {
      setUploadError("Network error. Please try again.");
      setUploadStage("error");
    }
  };

  const saveExpense = async () => {
    if (!editedExpense) return;
    setUploadStage("saving");
    try {
      const res  = await fetch("/api/upload/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editedExpense,
          amount:      Number(editedExpense.amount),
          receiptUrl:  uploadReceiptUrl,
          fileName:    uploadFileName,
          metadata:    uploadMetadata,
          receiptHash: uploadFileHash,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || "Save failed."); setUploadStage("error"); return; }
      setUploadStage("success");
      load(selMonth);
      showToast(`${editedExpense.merchant} ₹${editedExpense.amount} saved! ✅`, "success");
    } catch {
      setUploadError("Network error. Please try again.");
      setUploadStage("error");
    }
  };

  // ── Data loaders ───────────────────────────────────────────────────────
  const load = (month: string, initial = false) => {
    initial ? setFirstLoad(true) : setDataLoading(true);
    fetch(`/api/summary?month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d); setFirstLoad(false); setDataLoading(false); })
      .catch(() => { setFirstLoad(false); setDataLoading(false); showToast("Failed to load data. Check your connection.", "error"); });
  };

  const loadInsights = () => {
    setILoading(true);
    fetch("/api/insights")
      .then(r => r.json())
      .then(d => { setInsights(d.insights||[]); setILoading(false); })
      .catch(() => { setILoading(false); showToast("Couldn't load AI insights.", "error"); });
  };

  // ── Month navigation ───────────────────────────────────────────────────
  const changeMonth = (dir: -1|1) => {
    const cur = selMonthRef.current;
    const [y,m] = cur.split("-").map(Number);
    const nd = new Date(y, m - 1 + dir, 1);
    const nm = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`;
    if (nm > currentMonth) return;
    selMonthRef.current = nm;
    setSelMonth(nm);
    setCatFilter("All");
    load(nm);
  };

  const handleMonthSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nm = e.target.value;
    selMonthRef.current = nm;
    setSelMonth(nm);
    setCatFilter("All");
    load(nm);
  };

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => { load(selMonth, true); loadInsights(); }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:"smooth"}); }, [history]);
  useEffect(() => {
    const saved = localStorage.getItem("emsi_username");
    if (saved) setUserName(saved);
  }, []);

  // ── Chat ───────────────────────────────────────────────────────────────
  const sendChat = async (quickMsg?: string) => {
    const msg = (quickMsg ?? input).trim();
    if (!msg||chatBusy) return;
    setInput(""); setChatBusy(true);
    const next:ChatMsg[] = [...history,{role:"user",content:msg}];
    setHistory(next);
    try {
      const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,history:next})});
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let out="";
      setHistory(p=>[...p,{role:"assistant",content:""}]);
      while(true){const{done,value}=await reader.read();if(done)break;out+=dec.decode(value);setHistory(p=>{const u=[...p];u[u.length-1]={role:"assistant",content:out};return u;});}
    } catch {
      showToast("Chat failed. Please try again.", "error");
      setHistory(p => p.slice(0,-1));
    }
    setChatBusy(false);
  };

  // ── Category filter data ───────────────────────────────────────────────
  const recentCategories = data
    ? ["All", ...Array.from(new Set(data.recent.map(t => t.category)))]
    : ["All"];
  const filteredRecent = data
    ? (catFilter === "All" ? data.recent : data.recent.filter(t => t.category === catFilter))
    : [];

  // ── Loading state ──────────────────────────────────────────────────────
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
              <p className="text-xs text-gray-400 hidden sm:block">
                {userName ? `Hi, ${userName} 👋` : "Expense Management System Intelligence"}
              </p>
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
            {/* User / Name button */}
            <button onClick={()=>{ setNameInput(userName); setShowNameModal(true); }}
              title={userName ? `Logged in as ${userName}` : "Set your name"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-sm">
              <UserCircle size={18}/>
              <span className="hidden sm:inline font-medium">{userName || "Set name"}</span>
            </button>
            <button onClick={()=>{load(selMonth);loadInsights();}}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <RefreshCw size={16}/>
            </button>
            <button onClick={()=>{ resetUpload(); setTab("Upload"); }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
              <Upload size={15}/><span className="hidden sm:inline">Upload</span>
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
          <div className="flex items-center gap-2">
            {/* Prev arrow */}
            <button onClick={()=>changeMonth(-1)} disabled={dataLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 transition-colors text-gray-500 disabled:opacity-40">
              <ChevronRight size={16} className="rotate-180"/>
            </button>

            {/* Month dropdown select */}
            <div className="relative flex items-center gap-1.5">
              <select
                value={selMonth}
                onChange={handleMonthSelect}
                disabled={dataLoading}
                className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pr-9 font-bold text-gray-900 text-lg cursor-pointer hover:border-indigo-300 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50 shadow-sm"
              >
                {monthOptions.map(o=>(
                  <option key={o.val} value={o.val}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 text-gray-400 pointer-events-none"/>
              {dataLoading && <RefreshCw size={13} className="text-indigo-400 animate-spin ml-1"/>}
            </div>

            {/* Next arrow */}
            <button onClick={()=>changeMonth(1)} disabled={selMonth>=currentMonth||dataLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 transition-colors text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={16}/>
            </button>

            <p className="text-sm text-gray-400 ml-1 hidden sm:block">
              {dataLoading ? "Loading…" : `${data.count} transactions`}
            </p>
          </div>
          <div className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 ${
            data.momChange>0?"bg-red-50 text-red-600":"bg-green-50 text-green-600"
          }`}>
            {data.momChange>0?<TrendingUp size={16}/>:<TrendingDown size={16}/>}
            {data.momChange>0?"+":""}{data.momChange}% vs last month
          </div>
        </div>

        {/* ── Empty state for months with no data ───────────────────── */}
        {!dataLoading && data.count === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center mb-6">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-semibold text-gray-700 text-lg">No expenses in {monthLabel}</p>
            <p className="text-sm text-gray-400 mt-1">Use the dropdown or arrows to navigate to months with data</p>
            <p className="text-xs text-indigo-400 mt-3 font-medium">Data available from March 2026 onwards</p>
          </div>
        )}

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
                <div className="px-6 py-4 border-b border-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-indigo-500"/>
                      <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">{data.count} total</span>
                  </div>
                  {/* Category filter chips */}
                  <div className="flex gap-1.5 flex-wrap">
                    {recentCategories.map(cat => (
                      <button key={cat} onClick={()=>setCatFilter(cat)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                          catFilter===cat
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600"
                        }`}>
                        {cat==="All" ? "All" : `${CAT_EMOJI[cat]||"📦"} ${cat}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-gray-50 max-h-[280px] overflow-y-auto">
                  {filteredRecent.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">No {catFilter} transactions this month</div>
                  ) : filteredRecent.map(t=>(
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center gap-3">
                        {/* Receipt thumbnail if available, otherwise category emoji */}
                        {t.receipt_url ? (
                          <a href={t.receipt_url} target="_blank" rel="noreferrer"
                            className="w-9 h-9 rounded-xl overflow-hidden border border-gray-100 flex-shrink-0 cursor-zoom-in hover:ring-2 hover:ring-indigo-300 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={t.receipt_url} alt="receipt" className="w-full h-full object-cover"/>
                          </a>
                        ) : (
                          <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-base flex-shrink-0">{CAT_EMOJI[t.category]||"📦"}</div>
                        )}
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

        {/* ══════════════════ UPLOAD TAB ════════════════════════════════ */}
        {tab==="Upload" && (
          <div className="max-w-3xl mx-auto space-y-5">

            {/* ── IDLE: Drop zone ─────────────────────────────────────── */}
            {uploadStage==="idle" && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-8 pt-8 pb-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                      <Upload size={19} className="text-indigo-600"/>
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 text-lg">Upload Receipt</h2>
                      <p className="text-sm text-gray-400">AI extracts all details — you review & confirm before saving</p>
                    </div>
                  </div>
                  <div
                    onDragOver={e=>{e.preventDefault();setUploadDrag(true);}}
                    onDragLeave={()=>setUploadDrag(false)}
                    onDrop={e=>{e.preventDefault();setUploadDrag(false);const f=e.dataTransfer.files[0];if(f)handleUploadFile(f);}}
                    onClick={()=>uploadInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all ${
                      uploadDrag?"border-indigo-400 bg-indigo-50 scale-[1.01]":"border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                    }`}
                  >
                    <div className="flex justify-center gap-4 mb-5">
                      <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-sm">
                        <FileImage size={26} className="text-indigo-500"/>
                      </div>
                      <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center shadow-sm">
                        <FilePlus size={26} className="text-orange-500"/>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-800 text-lg mb-1">Drop your receipt here</p>
                    <p className="text-gray-400 text-sm mb-4">or click to browse files</p>
                    <div className="flex justify-center gap-2">
                      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium">JPEG / PNG / WebP</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium">PDF Invoice</span>
                    </div>
                  </div>
                </div>
                <div className="px-8 py-5 bg-slate-50 border-t border-gray-100 flex items-center gap-3">
                  <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Brain size={13} className="text-indigo-600"/>
                  </div>
                  <p className="text-xs text-gray-500">
                    AI will scan merchant name, amount, date, and category. You can edit anything before it touches the database.
                  </p>
                </div>
              </div>
            )}

            {/* ── ANALYZING ───────────────────────────────────────────── */}
            {uploadStage==="analyzing" && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                  <Brain size={34} className="text-indigo-600 animate-pulse"/>
                </div>
                <p className="font-bold text-gray-900 text-xl mb-1">Scanning your receipt…</p>
                <p className="text-gray-400 text-sm mb-2">GPT-4o is reading merchant, amount, date and category</p>
                {uploadFileName && <p className="text-xs text-indigo-400 font-medium">{uploadFileName}</p>}
                <div className="flex justify-center gap-2 mt-6">
                  {[0,1,2,3].map(i=>(
                    <div key={i} className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:`${i*120}ms`}}/>
                  ))}
                </div>
                {uploadPreview && (
                  <div className="mt-6 inline-block relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadPreview} alt="receipt" className="max-h-32 rounded-xl border border-gray-100 shadow opacity-60"/>
                    <div className="absolute inset-0 bg-indigo-50/60 rounded-xl flex items-center justify-center">
                      <RefreshCw size={18} className="text-indigo-500 animate-spin"/>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── REVIEW & EDIT ────────────────────────────────────────── */}
            {uploadStage==="review" && editedExpense && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Brain size={13} className="text-indigo-600"/>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">AI Extraction Complete</p>
                      <p className="text-xs text-indigo-500">Review and edit before saving · {Math.round(editedExpense.confidence*100)}% confidence</p>
                    </div>
                  </div>
                  <button onClick={resetUpload} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white transition-colors">
                    <X size={12}/> Reset
                  </button>
                </div>

                {/* ── Duplicate warning banner ─────────────────────── */}
                {uploadDuplicate && (
                  <div className="mx-6 mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">Looks like you&apos;ve uploaded this receipt before</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        <span className="font-medium">{uploadDuplicate.merchant}</span>
                        {" · "}₹{Number(uploadDuplicate.amount).toLocaleString("en-IN")}
                        {" · "}{uploadDuplicate.expense_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {uploadDuplicate.receipt_url && (
                        <a href={uploadDuplicate.receipt_url} target="_blank" rel="noreferrer"
                          className="text-xs text-amber-700 underline hover:text-amber-900 whitespace-nowrap">
                          View original
                        </a>
                      )}
                      <button onClick={()=>setUploadDuplicate(null)}
                        className="text-amber-400 hover:text-amber-600">
                        <X size={14}/>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-5">
                  {/* Left: Receipt preview */}
                  <div className="md:col-span-2 bg-slate-50 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-100 gap-4">
                    {uploadPreview ? (
                      <a href={uploadReceiptUrl||uploadPreview} target="_blank" rel="noreferrer" className="group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadPreview} alt="receipt" className="max-h-64 rounded-xl shadow-md border border-gray-100 group-hover:shadow-lg transition-shadow"/>
                        <p className="text-xs text-center text-gray-400 mt-2">Click to view full size</p>
                      </a>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-20 h-24 bg-orange-50 rounded-xl border-2 border-orange-100 flex items-center justify-center">
                          <FilePlus size={32} className="text-orange-400"/>
                        </div>
                        <p className="text-sm font-medium text-gray-600 text-center max-w-[160px] truncate">{uploadFileName}</p>
                      </div>
                    )}
                    {/* Confidence badge */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      editedExpense.confidence>=0.8?"bg-green-50 text-green-700 border border-green-100":
                      editedExpense.confidence>=0.5?"bg-amber-50 text-amber-700 border border-amber-100":
                                                     "bg-red-50 text-red-700 border border-red-100"
                    }`}>
                      <Brain size={11}/>
                      {Math.round(editedExpense.confidence*100)}% AI confidence
                    </div>
                  </div>

                  {/* Right: Edit form */}
                  <div className="md:col-span-3 p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-5">
                      <span className="text-2xl">{CAT_EMOJI[editedExpense.category]||"📦"}</span>
                      <div>
                        <h3 className="font-bold text-gray-900">Review Details</h3>
                        <p className="text-xs text-gray-400">Edit any field before saving to dashboard</p>
                      </div>
                    </div>

                    {/* Merchant */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Merchant / Store</label>
                      <input
                        value={editedExpense.merchant}
                        onChange={e=>setEditedExpense(p=>p?{...p,merchant:e.target.value}:p)}
                        placeholder="e.g. Swiggy, Amazon"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>

                    {/* Amount + Date */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Amount (₹)</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={editedExpense.amount}
                          onChange={e=>setEditedExpense(p=>p?{...p,amount:e.target.value}:p)}
                          placeholder="0.00"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Date</label>
                        <input
                          type="date"
                          value={editedExpense.date}
                          onChange={e=>setEditedExpense(p=>p?{...p,date:e.target.value}:p)}
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Category</label>
                      <div className="relative">
                        <select
                          value={editedExpense.category}
                          onChange={e=>setEditedExpense(p=>p?{...p,category:e.target.value}:p)}
                          className="w-full appearance-none border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer pr-8"
                        >
                          {CATEGORIES.map(c=>(
                            <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none"/>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Description <span className="font-normal text-gray-300">(optional)</span></label>
                      <input
                        value={editedExpense.description}
                        onChange={e=>setEditedExpense(p=>p?{...p,description:e.target.value}:p)}
                        placeholder="e.g. Butter chicken + garlic naan"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>

                    {/* ── Extracted metadata panel ──────────────────────── */}
                    {uploadMetadata && (() => {
                      type MetaShape = {
                        payment_method?: string; order_id?: string; invoice_number?: string;
                        upi_ref?: string; subtotal?: number; discount?: number;
                        taxes?: {gst?:number;cgst?:number;sgst?:number;igst?:number;total_tax?:number};
                        line_items?: {name:string;qty:number;price:number}[];
                        merchant_phone?: string; merchant_address?: string;
                      };
                      const meta = uploadMetadata as MetaShape;
                      const taxes = meta.taxes;
                      const lineItems = meta.line_items;
                      const hasAny = meta.payment_method || meta.order_id || meta.invoice_number ||
                                     meta.upi_ref || (lineItems && lineItems.length > 0) ||
                                     (taxes && (taxes.total_tax ?? 0) > 0) || meta.discount;
                      if (!hasAny) return null;
                      return (
                        <div className="border border-gray-100 rounded-xl overflow-hidden">
                          <button
                            onClick={()=>setShowMetadata(p=>!p)}
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-semibold text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <Sparkles size={11} className="text-indigo-500"/>
                              Extracted details
                              {lineItems && lineItems.length > 0 && (
                                <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px]">
                                  {lineItems.length} items
                                </span>
                              )}
                            </span>
                            <ChevronDown size={13} className={`text-gray-400 transition-transform ${showMetadata?"rotate-180":""}`}/>
                          </button>
                          {showMetadata && (
                            <div className="p-4 space-y-3 bg-white">
                              {/* Payment + IDs row */}
                              <div className="flex flex-wrap gap-2">
                                {meta.payment_method && meta.payment_method !== "Unknown" && (
                                  <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium border border-blue-100">
                                    💳 {String(meta.payment_method)}
                                  </span>
                                )}
                                {meta.upi_ref && (
                                  <span className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium border border-purple-100 font-mono">
                                    UPI {String(meta.upi_ref).slice(0,14)}{String(meta.upi_ref).length>14?"…":""}
                                  </span>
                                )}
                                {meta.order_id && (
                                  <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
                                    # {String(meta.order_id).slice(0,18)}{String(meta.order_id).length>18?"…":""}
                                  </span>
                                )}
                                {meta.invoice_number && (
                                  <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
                                    INV {String(meta.invoice_number).slice(0,14)}
                                  </span>
                                )}
                              </div>
                              {/* Line items */}
                              {lineItems && lineItems.length > 0 && (
                                <div className="bg-gray-50 rounded-lg overflow-hidden">
                                  <div className="grid grid-cols-[1fr_auto_auto] text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-1.5 border-b border-gray-100">
                                    <span>Item</span><span className="text-right pr-4">Qty</span><span className="text-right">Price</span>
                                  </div>
                                  {lineItems.map((item, i) => (
                                    <div key={i} className="grid grid-cols-[1fr_auto_auto] text-xs px-3 py-1.5 border-b border-gray-50 last:border-0">
                                      <span className="text-gray-700 truncate pr-2">{item.name}</span>
                                      <span className="text-gray-400 text-right pr-4">{item.qty}</span>
                                      <span className="text-gray-700 font-medium text-right">₹{Number(item.price).toLocaleString("en-IN")}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Tax + Discount summary */}
                              {(meta.subtotal || meta.discount || (taxes && (taxes.total_tax ?? 0) > 0)) && (
                                <div className="text-xs space-y-1">
                                  {meta.subtotal && (
                                    <div className="flex justify-between text-gray-500">
                                      <span>Subtotal</span>
                                      <span>₹{Number(meta.subtotal).toLocaleString("en-IN")}</span>
                                    </div>
                                  )}
                                  {(meta.discount ?? 0) > 0 && (
                                    <div className="flex justify-between text-green-600">
                                      <span>Discount</span>
                                      <span>−₹{Number(meta.discount).toLocaleString("en-IN")}</span>
                                    </div>
                                  )}
                                  {taxes && taxes.cgst && taxes.sgst ? (
                                    <>
                                      <div className="flex justify-between text-gray-400">
                                        <span>CGST</span><span>₹{Number(taxes.cgst).toLocaleString("en-IN")}</span>
                                      </div>
                                      <div className="flex justify-between text-gray-400">
                                        <span>SGST</span><span>₹{Number(taxes.sgst).toLocaleString("en-IN")}</span>
                                      </div>
                                    </>
                                  ) : taxes?.gst ? (
                                    <div className="flex justify-between text-gray-400">
                                      <span>GST</span><span>₹{Number(taxes.gst).toLocaleString("en-IN")}</span>
                                    </div>
                                  ) : taxes?.total_tax ? (
                                    <div className="flex justify-between text-gray-400">
                                      <span>Tax</span><span>₹{Number(taxes.total_tax).toLocaleString("en-IN")}</span>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <button onClick={saveExpense}
                        disabled={!editedExpense.merchant||!editedExpense.amount}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                        <CheckCircle size={16}/> Save to Dashboard
                      </button>
                      <button onClick={resetUpload}
                        className="px-4 py-3 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-xl transition-colors text-sm">
                        Re-upload
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SAVING ──────────────────────────────────────────────── */}
            {uploadStage==="saving" && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <RefreshCw size={26} className="text-indigo-500 animate-spin"/>
                </div>
                <p className="font-semibold text-gray-800">Saving to dashboard…</p>
              </div>
            )}

            {/* ── SUCCESS ─────────────────────────────────────────────── */}
            {uploadStage==="success" && editedExpense && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 text-center border-b border-gray-50">
                  <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={30} className="text-green-500"/>
                  </div>
                  <p className="font-bold text-gray-900 text-xl mb-1">Saved successfully!</p>
                  <p className="text-gray-400 text-sm">This expense is now in your dashboard</p>
                </div>
                <div className="mx-6 my-5 p-5 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{CAT_EMOJI[editedExpense.category]||"📦"}</span>
                      <div>
                        <p className="font-bold text-gray-900">{editedExpense.merchant}</p>
                        <p className="text-xs text-gray-500">{editedExpense.category} · {editedExpense.date}</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-indigo-700">₹{Number(editedExpense.amount).toLocaleString("en-IN")}</p>
                  </div>
                  {!!editedExpense.description && <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-indigo-100">{editedExpense.description}</p>}
                </div>
                <div className="px-6 pb-6 flex gap-3">
                  <button onClick={resetUpload}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium rounded-xl transition-colors text-sm">
                    Upload Another
                  </button>
                  <button onClick={()=>setTab("Overview")}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
                    <BarChart2 size={15}/> View Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* ── ERROR ───────────────────────────────────────────────── */}
            {uploadStage==="error" && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
                <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                  <AlertTriangle size={26} className="text-red-500"/>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Something went wrong</p>
                  <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl inline-block">{uploadError}</p>
                </div>
                <button onClick={resetUpload}
                  className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm">
                  Try Again
                </button>
              </div>
            )}

            {/* Hidden file input */}
            <input ref={uploadInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)handleUploadFile(f);e.target.value="";}}/>
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

      {/* ── Name Modal ────────────────────────────────────────────────── */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={()=>setShowNameModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 mx-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <UserCircle size={20} className="text-indigo-600"/>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Your Name</h3>
                <p className="text-xs text-gray-400">Personalise your dashboard</p>
              </div>
            </div>
            <input
              autoFocus
              value={nameInput}
              onChange={e=>setNameInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveName()}
              placeholder="e.g. Kishore"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={()=>setShowNameModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveName} disabled={!nameInput.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-sm text-white font-semibold transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ───────────────────────────────────────── */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t=>(
          <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium pointer-events-auto animate-in slide-in-from-left-4 duration-300 ${
            t.type==="success" ? "bg-green-50 border-green-200 text-green-800" :
            t.type==="error"   ? "bg-red-50   border-red-200   text-red-800"   :
                                  "bg-blue-50  border-blue-200  text-blue-800"
          }`}>
            {t.type==="success" ? <CheckCircle size={16} className="text-green-600 flex-shrink-0"/> :
             t.type==="error"   ? <AlertTriangle size={16} className="text-red-600 flex-shrink-0"/> :
                                  <Lightbulb size={16} className="text-blue-600 flex-shrink-0"/>}
            {t.message}
          </div>
        ))}
      </div>

    </div>
  );
}
