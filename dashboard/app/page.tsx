"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, ShoppingBag, Activity, MessageCircle,
  X, Send, Sparkles, AlertTriangle, Lightbulb, Trophy, Zap,
  ArrowUpRight, ArrowDownRight, RefreshCw, ChevronRight, Target,
  BarChart2, Receipt, Brain, Clock, Flame, CheckCircle, UserCircle, ChevronDown,
  Upload, FileImage, FilePlus, Pencil, Trash2, LogOut, Languages,
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
/** Rich metadata extracted from a receipt (may be null for WhatsApp-only transactions) */
type MetaShape = {
  payment_method?: string;
  order_id?: string;
  invoice_number?: string;
  upi_ref?: string;
  subtotal?: number;
  discount?: number;
  taxes?: { gst?:number; cgst?:number; sgst?:number; igst?:number; total_tax?:number };
  line_items?: { name:string; qty:number; price:number }[];
  merchant_phone?: string;
  merchant_address?: string;
  billed_to?: string;    // name extracted from the physical receipt (customer/addressee)
  prepared_by?: string;  // cashier / server name if printed
  uploaded_by?: string;  // person who logged this receipt via the web dashboard
};

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
  recent:{id:string;merchant:string;amount:number;category:string;description:string;created_at:string;expense_date:string|null;display_date:string;receipt_url:string|null;metadata:Record<string,unknown>|null}[];
  scoreBreakdown:{budgetAdherence:number;diversity:number;spendControl:number};
}
interface UserRow  {id:string;phone:string;label:string;count:number;}
interface Insight  {type:string;icon:string;title:string;message:string;}
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
  // Timezone-safe init: toISOString() shifts to UTC and can return the wrong month in IST
  const [selMonth,      setSelMonth]      = useState(()=>{ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; });
  const [catFilter,     setCatFilter]     = useState("All");
  const [toasts,        setToasts]        = useState<Toast[]>([]);
  const [userName,      setUserName]      = useState("");
  const [userEmail,     setUserEmail]     = useState("");
  const [nameInput,     setNameInput]     = useState("");
  const [showNameModal,     setShowNameModal]     = useState(false);
  const [userRole,      setUserRole]      = useState<"admin"|"viewer"|null>(null);

  // Edit / delete transaction
  type EditTxn = { id:string; merchant:string; amount:string; category:string; subcategory:string; description:string; expense_date:string };
  const [editTxn,      setEditTxn]      = useState<EditTxn|null>(null);
  const [deleteTxnId,  setDeleteTxnId]  = useState<string|null>(null);
  const [txnSaving,    setTxnSaving]    = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File|null>(null); // held while name modal is open

  // User picker (admin: switch between users)
  const [users,          setUsers]          = useState<UserRow[]>([]);
  const [selectedUserId,    setSelectedUserId]    = useState<string>("");
  const selectedUserIdRef = useRef<string>("");
  const [selectedUploader,  setSelectedUploader]  = useState<string>("");
  const selectedUploaderRef = useRef<string>("");
  const [uploaderNames,     setUploaderNames]     = useState<string[]>([]);

  // Anomaly detection (set after upload save)
  const [uploadAnomaly,  setUploadAnomaly]  = useState<{level:"high"|"medium"|null;message:string}|null>(null);

  // Natural-language search
  const [aiSearchQ,       setAiSearchQ]      = useState("");
  const [aiSearchActive,  setAiSearchActive] = useState(false);
  const [aiSearchResults, setAiSearchResults]= useState<Summary["recent"]>([]);
  const [aiSearchDesc,    setAiSearchDesc]   = useState("");
  const [aiSearchTotal,   setAiSearchTotal]  = useState(0);
  const [aiSearchBusy,    setAiSearchBusy]   = useState(false);

  // AI Budget suggestions
  const [customBudgets,    setCustomBudgets]   = useState<Record<string,number>>({});
  const [budgetSuggestion, setBudgetSuggestion]= useState<{budgets:Record<string,number>;note:string;source:string}|null>(null);
  const [loadingBudgets,   setLoadingBudgets]  = useState(false);
  const [budgetApplied,    setBudgetApplied]   = useState(false);

  // Inline budget editing
  const [editingBudgetCat, setEditingBudgetCat] = useState<string|null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState<string>("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCat,       setShowAddCat]       = useState(false);
  const [newCatName,       setNewCatName]       = useState("");
  const [newCatBudget,     setNewCatBudget]     = useState("");

  // Monthly report
  interface ReportSection { heading: string; body: string; }
  interface ReportData {
    headline: string;
    sections: ReportSection[];
    actions:  string[];
  }
  const [reportOpen,    setReportOpen]    = useState(false);
  const [report,        setReport]        = useState<{report:ReportData;monthLabel:string;total:number;count:number;momPct:number}|null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Insight filters — language + per-user
  const [insightLang,   setInsightLang]   = useState<"en"|"hi">("en");
  const [insightUserId, setInsightUserId] = useState<string>("");
  const insightLangRef   = useRef<"en"|"hi">("en");
  const insightUserIdRef = useRef<string>("");

  // WhatsApp number for profile linking
  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");

  // Upload tab state
  type UploadStage = "idle"|"analyzing"|"review"|"saving"|"success"|"error"|"excel-review"|"excel-importing"|"excel-success";
  interface ExcelRow { _id: string; selected: boolean; merchant: string; amount: string; category: string; date: string; description: string; receipt_url?: string | null; }
  interface EditableExpense {
    merchant: string; amount: string; category: string;
    subcategory: string; date: string; description: string; confidence: number;
    billed_to: string;
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
  const [excelRows,        setExcelRows]        = useState<ExcelRow[]>([]);
  const [excelImported,    setExcelImported]    = useState(0);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Receipt viewer modal
  interface ReceiptView {
    url: string; merchant: string; amount: number; category: string;
    date: string; isPdf: boolean; description: string;
    metadata: Record<string,unknown>|null;
  }
  const [receiptView, setReceiptView] = useState<ReceiptView|null>(null);

  const selMonthRef = useRef(selMonth);
  const chatEnd     = useRef<HTMLDivElement>(null);

  // Timezone-safe: toISOString() returns UTC which can roll back a day in IST
  const _n = new Date();
  const currentMonth = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,"0")}`;
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

  // ── Transaction edit / delete ──────────────────────────────────────────
  const saveEdit = async () => {
    if (!editTxn) return;
    setTxnSaving(true);
    const res = await fetch(`/api/transactions/${editTxn.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editTxn, amount: Number(editTxn.amount) }),
    });
    setTxnSaving(false);
    if (res.ok) { setEditTxn(null); load(selMonth); showToast("Transaction updated ✅", "success"); }
    else        { showToast("Failed to update", "error"); }
  };

  const confirmDelete = async () => {
    if (!deleteTxnId) return;
    const res = await fetch(`/api/transactions/${deleteTxnId}`, { method: "DELETE" });
    if (res.ok) { setDeleteTxnId(null); load(selMonth); showToast("Transaction deleted", "info"); }
    else        { showToast("Failed to delete", "error"); }
  };

  // ── Auth ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

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
    if (userEmail) localStorage.setItem(`emsi_username_${userEmail}`, n);
    const wa = whatsappInput.trim();
    if (wa) { setWhatsappPhone(wa); if (userEmail) localStorage.setItem(`emsi_whatsapp_${userEmail}`, wa); }
    setShowNameModal(false);
    setNameInput("");
    setWhatsappInput("");
    showToast(`Welcome, ${n}! 👋`, "success");
    // If a file was waiting on the name, start uploading it now
    if (pendingUploadFile) {
      const file = pendingUploadFile;
      setPendingUploadFile(null);
      resetUpload();
      setUploadFile(file);
      setUploadFileName(file.name);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = e => setUploadPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }
      setUploadStage("analyzing");
      setTab("Upload");
      analyzeFile(file);
    }
  };

  // ── Upload helpers ─────────────────────────────────────────────────────
  const resetUpload = () => {
    setUploadStage("idle"); setUploadFile(null); setUploadPreview(null);
    setUploadReceiptUrl(null); setEditedExpense(null); setUploadError(""); setUploadFileName("");
    setUploadDuplicate(null); setUploadMetadata(null); setUploadFileHash(""); setShowMetadata(false);
    setUploadAnomaly(null); setExcelRows([]); setExcelImported(0);
  };

  const isExcelFile = (file: File) =>
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "text/csv" ||
    file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv");

  const handleUploadFile = (file: File) => {
    if (!file) return;
    if (!userName.trim()) { setPendingUploadFile(file); setShowNameModal(true); return; }
    resetUpload();
    setUploadFile(file);
    setUploadFileName(file.name);
    if (isExcelFile(file)) {
      analyzeExcel(file);
    } else {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = e => setUploadPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }
      setUploadStage("analyzing");
      analyzeFile(file);
    }
  };

  const analyzeMultiple = async (files: File[]) => {
    setUploadStage("analyzing");
    setUploadFileName(`${files.length} files`);
    try {
      const results = await Promise.all(files.map(async (file, i) => {
        const form = new FormData();
        form.append("file", file);
        const res  = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok || !json.expense) return null;
        const e = json.expense as Record<string, unknown>;
        const meta = e.metadata as Record<string, unknown> | null;
        return {
          _id: String(i),
          selected: true,
          merchant:    String(e.merchant    || ""),
          amount:      String(e.amount      || ""),
          category:    String(e.category    || "Other"),
          date:        String(e.date        || new Date().toISOString().slice(0, 10)),
          description: String(e.description || ""),
          receipt_url: (json.receiptUrl as string | null) ?? null,
          billed_to:   String(meta?.billed_to || ""),
        } as ExcelRow;
      }));
      const rows = results.filter(Boolean) as ExcelRow[];
      if (!rows.length) { setUploadError("Could not extract expenses from any of the uploaded files."); setUploadStage("error"); return; }
      setExcelRows(rows);
      setUploadStage("excel-review");
    } catch {
      setUploadError("Network error. Please try again.");
      setUploadStage("error");
    }
  };

  const analyzeExcel = async (file: File) => {
    setUploadStage("analyzing");
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/upload/excel", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || "Could not parse the file."); setUploadStage("error"); return; }
      const rows: ExcelRow[] = json.transactions.map((t: { merchant: string; amount: number; category: string; date: string; description: string }, i: number) => ({
        _id: String(i), selected: true,
        merchant: t.merchant, amount: String(t.amount),
        category: t.category, date: t.date, description: t.description,
      }));
      setExcelRows(rows);
      setUploadStage("excel-review");
    } catch {
      setUploadError("Network error. Please try again.");
      setUploadStage("error");
    }
  };

  const importExcel = async () => {
    const selected = excelRows.filter(r => r.selected);
    if (!selected.length) { showToast("Select at least one row to import", "error"); return; }
    setUploadStage("excel-importing");
    try {
      const res = await fetch("/api/upload/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: selected.map(r => ({ merchant: r.merchant, amount: Number(r.amount), category: r.category, date: r.date, description: r.description, receipt_url: r.receipt_url ?? null })),
          uploadedBy: userName || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || "Import failed."); setUploadStage("error"); return; }
      setExcelImported(json.imported);
      setUploadStage("excel-success");
      load(selMonthRef.current);
      showToast(`${json.imported} transactions imported ✅`, "success");
    } catch {
      setUploadError("Network error. Please try again.");
      setUploadStage("error");
    }
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
      const meta = e.metadata as Record<string,unknown> | null;
      setEditedExpense({
        merchant:    String(e.merchant    || ""),
        amount:      String(e.amount      || ""),
        category:    String(e.category    || "Other"),
        subcategory: String(e.subcategory || ""),
        date:        String(e.date        || new Date().toISOString().slice(0,10)),
        description: String(e.description || ""),
        confidence:  Number(e.confidence  || 0),
        billed_to:   String(meta?.billed_to || ""),
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
          metadata:    { ...(uploadMetadata || {}), ...(editedExpense.billed_to?.trim() ? { billed_to: editedExpense.billed_to.trim() } : {}) },
          receiptHash: uploadFileHash,
          uploadedBy:  userName || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error || "Save failed."); setUploadStage("error"); return; }
      // Capture anomaly flag from the save response
      setUploadAnomaly(json.anomaly?.level ? json.anomaly : null);
      // Switch to the month that matches the expense_date so it's immediately visible
      const expenseMonth = editedExpense.date.slice(0, 7); // YYYY-MM
      selMonthRef.current = expenseMonth;
      setSelMonth(expenseMonth);
      setUploadStage("success");
      load(expenseMonth);
      showToast(`${editedExpense.merchant} ₹${editedExpense.amount} saved! ✅`, "success");
    } catch {
      setUploadError("Network error. Please try again.");
      setUploadStage("error");
    }
  };

  // ── Data loaders ───────────────────────────────────────────────────────
  const load = (month: string, initial = false, forUserId?: string, forUploader?: string) => {
    const uid      = forUserId   !== undefined ? forUserId   : selectedUserIdRef.current;
    const uploader = forUploader !== undefined ? forUploader : selectedUploaderRef.current;
    const params   = new URLSearchParams({ month });
    if (uid)      params.set("userId",       uid);
    if (uploader) params.set("uploaderName", uploader);
    const url = `/api/summary?${params.toString()}`;
    initial ? setFirstLoad(true) : setDataLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setFirstLoad(false); setDataLoading(false); })
      .catch(() => { setFirstLoad(false); setDataLoading(false); showToast("Failed to load data. Check your connection.", "error"); });
  };

  const loadInsights = (opts?: { lang?: "en"|"hi"; userId?: string }) => {
    const lang   = opts?.lang   ?? insightLangRef.current;
    const userId = opts?.userId ?? insightUserIdRef.current;
    setILoading(true);
    const params = new URLSearchParams();
    if (lang === "hi") params.set("lang", "hi");
    if (userId) params.set("userId", userId);
    const qs = params.toString();
    fetch(`/api/insights${qs ? `?${qs}` : ""}`)
      .then(r => r.json())
      .then(d => { setInsights(d.insights||[]); setILoading(false); })
      .catch(() => { setILoading(false); showToast("Couldn't load AI insights.", "error"); });
  };

  const loadUsers = () => {
    fetch("/api/users")
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => {});
  };

  const loadUploaders = () => {
    fetch("/api/uploaders")
      .then(r => r.json())
      .then(d => setUploaderNames(d.uploaders || []))
      .catch(() => {});
  };

  // ── AI Natural-Language Search ─────────────────────────────────────────
  const runAISearch = async (q: string) => {
    if (!q.trim()) { setAiSearchActive(false); setAiSearchResults([]); return; }
    setAiSearchBusy(true); setAiSearchActive(true);
    const uid = selectedUserIdRef.current;
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}${uid ? `&userId=${uid}` : ""}`).catch(()=>null);
    if (res?.ok) {
      const d = await res.json();
      setAiSearchResults(d.results || []);
      setAiSearchDesc(d.description || q);
      setAiSearchTotal(d.total || 0);
    }
    setAiSearchBusy(false);
  };

  const clearSearch = () => { setAiSearchQ(""); setAiSearchActive(false); setAiSearchResults([]); setAiSearchDesc(""); };

  // ── AI Budget Suggestions ──────────────────────────────────────────────
  const fetchBudgetSuggestions = async () => {
    setLoadingBudgets(true);
    const uid = selectedUserIdRef.current;
    const res = await fetch(`/api/budgets/suggest${uid ? `?userId=${uid}` : ""}`).catch(()=>null);
    if (res?.ok) {
      const d = await res.json();
      setBudgetSuggestion({ budgets: d.budgets, note: d.note, source: d.source });
    }
    setLoadingBudgets(false);
  };

  const applyBudgets = (budgets: Record<string,number>) => {
    setCustomBudgets(budgets);
    setBudgetApplied(true);
    localStorage.setItem("emsi_budgets", JSON.stringify(budgets));
    setBudgetSuggestion(null);
    showToast("AI budgets applied! ✅", "success");
  };

  const saveBudgetEdit = (cat: string) => {
    const val = parseInt(editingBudgetVal.replace(/[^\d]/g, ""), 10);
    if (!isNaN(val) && val > 0) {
      const updated = { ...customBudgets, [cat]: val };
      setCustomBudgets(updated);
      setBudgetApplied(true);
      localStorage.setItem("emsi_budgets", JSON.stringify(updated));
      showToast(`${cat} budget set to ₹${val.toLocaleString("en-IN")} ✅`, "success");
    }
    setEditingBudgetCat(null);
    setEditingBudgetVal("");
  };

  // ── Monthly Report ─────────────────────────────────────────────────────
  const generateReport = async () => {
    setReportLoading(true); setReportOpen(true);
    const uid = selectedUserIdRef.current;
    const res = await fetch(`/api/report?month=${selMonthRef.current}${uid ? `&userId=${uid}` : ""}`).catch(()=>null);
    if (res?.ok) {
      const d = await res.json();
      setReport(d);
    } else {
      setReportOpen(false);
      showToast("Couldn't generate report. Try again.", "error");
    }
    setReportLoading(false);
  };

  // Load custom budgets + custom categories from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("emsi_budgets");
    if (saved) { try { setCustomBudgets(JSON.parse(saved)); setBudgetApplied(true); } catch {} }
    const savedCats = localStorage.getItem("emsi_custom_categories");
    if (savedCats) { try { setCustomCategories(JSON.parse(savedCats)); } catch {} }
  }, []);

  const addCustomCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    const allExisting = [...(CATEGORIES as readonly string[]), ...customCategories];
    if (allExisting.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
      showToast("Category already exists", "error"); return;
    }
    const updatedCats = [...customCategories, name];
    setCustomCategories(updatedCats);
    localStorage.setItem("emsi_custom_categories", JSON.stringify(updatedCats));
    const budget = parseInt(newCatBudget.replace(/[^\d]/g, ""), 10);
    if (!isNaN(budget) && budget > 0) {
      const updatedBudgets = { ...customBudgets, [name]: budget };
      setCustomBudgets(updatedBudgets);
      setBudgetApplied(true);
      localStorage.setItem("emsi_budgets", JSON.stringify(updatedBudgets));
    }
    setNewCatName(""); setNewCatBudget(""); setShowAddCat(false);
    showToast(`"${name}" category created ✅`, "success");
  };

  const removeCustomCategory = (name: string) => {
    const updated = customCategories.filter(c => c !== name);
    setCustomCategories(updated);
    localStorage.setItem("emsi_custom_categories", JSON.stringify(updated));
    showToast(`"${name}" removed`, "info");
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

  const handleUserSelect = (userId: string) => {
    selectedUserIdRef.current = userId;
    setSelectedUserId(userId);
    setCatFilter("All");
    load(selMonthRef.current, false, userId);
  };

  // ── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setUserRole(d.role);
        if (d.email) {
          setUserEmail(d.email);
          const key = `emsi_username_${d.email}`;
          const saved = localStorage.getItem(key);
          if (saved) {
            setUserName(saved);
          } else {
            const firstName = d.email.split("@")[0].split(".")[0];
            setUserName(firstName.charAt(0).toUpperCase() + firstName.slice(1));
          }
          const savedWa = localStorage.getItem(`emsi_whatsapp_${d.email}`);
          if (savedWa) setWhatsappPhone(savedWa);
        }
      })
      .catch(() => { window.location.href = "/login"; });
    load(selMonth, true); loadInsights(); loadUsers(); loadUploaders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:"smooth"}); }, [history]);

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

  // Budget tracker — use custom (AI-suggested) budgets when applied, then append custom categories
  const baseTracker = Object.keys(customBudgets).length > 0
    ? data.categoryChart.map(c => {
        const budget = customBudgets[c.name] || 3000;
        const pct    = Math.min(Math.round((c.value / budget) * 100), 150);
        return { category: c.name, spent: c.value, budget, pct, over: c.value > budget };
      }).sort((a, b) => b.pct - a.pct)
    : data.budgetTracker;
  const activeBudgetTracker = [
    ...baseTracker,
    ...customCategories
      .filter(cat => !baseTracker.find(b => b.category.toLowerCase() === cat.toLowerCase()))
      .map(cat => {
        const budget = customBudgets[cat] || 3000;
        return { category: cat, spent: 0, budget, pct: 0, over: false };
      }),
  ];

  // Behavioral patterns — derived from existing heatmap data
  const dowMap: Record<string,number> = {};
  data.heatmap.forEach(h => { dowMap[h.day] = h.amount; });
  const weekendAmt  = (dowMap["Sat"] || 0) + (dowMap["Sun"] || 0);
  const weekdayAmt  = (dowMap["Mon"]||0)+(dowMap["Tue"]||0)+(dowMap["Wed"]||0)+(dowMap["Thu"]||0)+(dowMap["Fri"]||0);
  const weekdayAvg  = weekdayAmt / 5;
  const weekendAvg  = weekendAmt / 2;
  const weekendMult = weekdayAvg > 0 ? weekendAvg / weekdayAvg : 1;
  const peakDay     = data.heatmap.length ? data.heatmap.reduce((mx, h) => h.amount > mx.amount ? h : mx) : null;
  const quietDay    = data.heatmap.length ? data.heatmap.filter(h=>h.amount>0).reduce((mn, h) => h.amount < mn.amount ? h : mn, data.heatmap.filter(h=>h.amount>0)[0]) : null;

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
            {/* Role badge */}
            {userRole && (
              <span className={`hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full ${userRole === "admin" ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-500"}`}>
                {userRole}
              </span>
            )}
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
            {/* Admin: filter by uploader name */}
            {userRole === "admin" && uploaderNames.length > 0 && (
              <div className="relative hidden sm:flex items-center">
                <select
                  value={selectedUploader}
                  onChange={e => {
                    const name = e.target.value;
                    selectedUploaderRef.current = name;
                    setSelectedUploader(name);
                    setCatFilter("All");
                    load(selMonthRef.current, false, "", name);
                  }}
                  className="appearance-none text-xs bg-gray-100 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-xl pl-3 pr-7 py-1.5 text-gray-600 cursor-pointer focus:outline-none focus:border-indigo-400 transition-colors font-medium"
                >
                  <option value="">👥 All members</option>
                  {uploaderNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2.5 text-gray-400 pointer-events-none"/>
              </div>
            )}
            {userRole === "admin" && (
              <button onClick={()=>{ resetUpload(); setTab("Upload"); }}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
                <Upload size={15}/><span className="hidden sm:inline">Upload</span>
              </button>
            )}
            {/* Sign Out */}
            <button onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-xl transition-colors font-medium">
              <LogOut size={14}/><span className="hidden sm:inline">Sign Out</span>
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
                    <p className="text-indigo-400 text-xs">AI-Powered · Personalised for your data</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white/10 rounded-lg overflow-hidden border border-white/20">
                    <button
                      onClick={() => { insightLangRef.current="en"; setInsightLang("en"); loadInsights({ lang:"en", userId: insightUserIdRef.current }); }}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 transition-colors ${insightLang==="en"?"bg-white/20 text-white font-semibold":"text-indigo-300 hover:text-white"}`}>
                      <Languages size={11}/> EN
                    </button>
                    <button
                      onClick={() => { insightLangRef.current="hi"; setInsightLang("hi"); loadInsights({ lang:"hi", userId: insightUserIdRef.current }); }}
                      className={`text-xs px-2.5 py-1.5 transition-colors ${insightLang==="hi"?"bg-white/20 text-white font-semibold":"text-indigo-300 hover:text-white"}`}>
                      हिं
                    </button>
                  </div>
                  <button onClick={()=>loadInsights()} className="text-xs text-indigo-300 hover:text-white bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
                    <RefreshCw size={11}/> Regenerate
                  </button>
                </div>
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
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                      {aiSearchActive ? `${aiSearchResults.length} results` : `${data.count} total`}
                    </span>
                  </div>
                  {/* AI Search bar */}
                  <div className="relative mb-3">
                    <Sparkles size={13} className="absolute left-3 top-2.5 text-indigo-400"/>
                    <input
                      value={aiSearchQ}
                      onChange={e=>setAiSearchQ(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter") runAISearch(aiSearchQ); if(e.key==="Escape") clearSearch(); }}
                      placeholder='AI search — "Zomato last month" or "food over ₹500"'
                      className="w-full bg-indigo-50/60 border border-indigo-100 rounded-xl pl-8 pr-16 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-all"
                    />
                    <div className="absolute right-2 top-1.5 flex items-center gap-1">
                      {aiSearchActive && (
                        <button onClick={clearSearch} className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded-md hover:bg-gray-100 transition-colors">
                          Clear
                        </button>
                      )}
                      <button
                        onClick={()=>runAISearch(aiSearchQ)}
                        disabled={aiSearchBusy || !aiSearchQ.trim()}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-2.5 py-1 rounded-lg transition-colors font-medium">
                        {aiSearchBusy ? "…" : "Search"}
                      </button>
                    </div>
                  </div>
                  {/* AI search result summary */}
                  {aiSearchActive && (
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2.5 py-1 rounded-full">
                        {aiSearchDesc} · ₹{aiSearchTotal.toLocaleString("en-IN")} total
                      </span>
                    </div>
                  )}
                  {/* Category filter chips — hidden during search */}
                  {!aiSearchActive && (
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
                  )}
                </div>
                <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
                  {aiSearchBusy ? (
                    <div className="py-8 text-center space-y-2">
                      <RefreshCw size={18} className="text-indigo-400 animate-spin mx-auto"/>
                      <p className="text-xs text-gray-400">AI is searching…</p>
                    </div>
                  ) : aiSearchActive && aiSearchResults.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">No transactions matched "{aiSearchQ}"</div>
                  ) : (aiSearchActive ? aiSearchResults : filteredRecent).length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">No {catFilter} transactions this month</div>
                  ) : (aiSearchActive ? aiSearchResults : filteredRecent).map(t=>(
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Category emoji icon */}
                        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-base flex-shrink-0">
                          {CAT_EMOJI[t.category]||"📦"}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{t.merchant||"Unknown"}</p>
                          <p className="text-xs text-gray-400">
                            {t.category} · {new Date(t.display_date + "T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"})}
                            {(t.metadata as MetaShape|null)?.uploaded_by && (
                              <span className="text-indigo-400"> · 👤 {(t.metadata as MetaShape).uploaded_by}</span>
                            )}
                            {(t.metadata as MetaShape|null)?.billed_to && (
                              <span className="text-emerald-500"> · 📋 {(t.metadata as MetaShape).billed_to}</span>
                            )}
                            {(t.metadata as MetaShape|null)?.order_id && (
                              <span className="text-gray-400"> · #{String((t.metadata as MetaShape).order_id).slice(0,16)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* View receipt */}
                        {t.receipt_url && (
                          <button
                            onClick={()=>setReceiptView({
                              url: t.receipt_url!,
                              merchant: t.merchant||"Unknown",
                              amount: t.amount,
                              category: t.category,
                              date: new Date(t.display_date + "T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}),
                              isPdf: t.receipt_url!.toLowerCase().includes(".pdf"),
                              description: t.description || "",
                              metadata: t.metadata ?? null,
                            })}
                            className="text-xs text-indigo-600 border border-indigo-200 bg-white hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 flex-shrink-0">
                            <Receipt size={10}/> View
                          </button>
                        )}
                        <p className="font-bold text-gray-900 text-sm">₹{Number(t.amount).toLocaleString("en-IN")}</p>
                        {/* Admin-only: edit + delete */}
                        {userRole === "admin" && (
                          <>
                            <button
                              onClick={()=>setEditTxn({ id:t.id, merchant:t.merchant||"", amount:String(t.amount), category:t.category, subcategory:"", description:t.description||"", expense_date:t.display_date })}
                              className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0">
                              <Pencil size={13}/>
                            </button>
                            <button
                              onClick={()=>setDeleteTxnId(t.id)}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                              <Trash2 size={13}/>
                            </button>
                          </>
                        )}
                      </div>
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
            {/* Budget header with AI suggest button */}
            <div className="flex items-center justify-between">
              <div>
                {budgetApplied
                  ? <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 w-fit"><Sparkles size={11}/> AI Budgets Active</span>
                  : <p className="text-xs text-gray-400">Smart budgets based on category health ratios.</p>
                }
              </div>
              <button
                onClick={fetchBudgetSuggestions}
                disabled={loadingBudgets}
                className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl transition-colors shadow-sm">
                {loadingBudgets ? <RefreshCw size={13} className="animate-spin"/> : <Sparkles size={13}/>}
                {loadingBudgets ? "Analysing…" : "✨ AI Suggest Budgets"}
              </button>
            </div>

            {/* Budget suggestion preview */}
            {budgetSuggestion && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-indigo-900 text-sm">AI Budget Recommendations</p>
                    <p className="text-xs text-indigo-600 mt-0.5">{budgetSuggestion.note}</p>
                  </div>
                  <button onClick={()=>setBudgetSuggestion(null)} className="text-indigo-400 hover:text-indigo-600"><X size={16}/></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(budgetSuggestion.budgets).map(([cat, suggested]) => {
                    const current = (customBudgets[cat] || (data.budgetTracker.find(b=>b.category===cat)?.budget) || 3000);
                    const diff = suggested - current;
                    return (
                      <div key={cat} className="bg-white rounded-xl px-3 py-2.5 border border-indigo-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">{CAT_EMOJI[cat]||"📦"}</span>
                          <span className="text-xs font-medium text-gray-700 truncate">{cat}</span>
                        </div>
                        <p className="text-sm font-bold text-indigo-700">₹{suggested.toLocaleString("en-IN")}</p>
                        <p className={`text-[10px] font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-gray-400"}`}>
                          {diff > 0 ? `+₹${diff.toLocaleString("en-IN")}` : diff < 0 ? `-₹${Math.abs(diff).toLocaleString("en-IN")}` : "no change"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>applyBudgets(budgetSuggestion.budgets)}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                    <CheckCircle size={14}/> Apply AI Budgets
                  </button>
                  {budgetApplied && (
                    <button onClick={()=>{ setCustomBudgets({}); setBudgetApplied(false); localStorage.removeItem("emsi_budgets"); setBudgetSuggestion(null); showToast("Reverted to default budgets","info"); }}
                      className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition-colors">
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeBudgetTracker.map((b,i)=>(
                <div key={b.category} className={`bg-white rounded-2xl p-5 border shadow-sm ${b.over?"border-red-200":"border-gray-100"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{CAT_EMOJI[b.category]||"📦"}</span>
                      <span className="font-semibold text-gray-900">{b.category}</span>
                      {customCategories.includes(b.category) && (
                        <span className="text-xs bg-indigo-50 text-indigo-500 border border-indigo-100 px-1.5 py-0.5 rounded-full font-medium">custom</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {customCategories.includes(b.category) && (
                        <button onClick={()=>removeCustomCategory(b.category)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50">
                          <Trash2 size={12}/>
                        </button>
                      )}
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${b.over?"bg-red-100 text-red-700":"bg-green-100 text-green-700"}`}>
                        {b.over?"Over budget":b.spent===0?"No spend yet":"On track"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">₹{b.spent.toLocaleString("en-IN")}</p>
                      {/* Inline budget threshold editor */}
                      {editingBudgetCat === b.category ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-gray-400">₹</span>
                          <input
                            autoFocus
                            value={editingBudgetVal}
                            onChange={e=>setEditingBudgetVal(e.target.value)}
                            onKeyDown={e=>{ if(e.key==="Enter") saveBudgetEdit(b.category); if(e.key==="Escape"){ setEditingBudgetCat(null); setEditingBudgetVal(""); } }}
                            placeholder={String(b.budget)}
                            className="w-24 border border-indigo-300 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                          <button onClick={()=>saveBudgetEdit(b.category)}
                            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                            Save
                          </button>
                          <button onClick={()=>{ setEditingBudgetCat(null); setEditingBudgetVal(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                            <X size={11}/>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={()=>{ setEditingBudgetCat(b.category); setEditingBudgetVal(String(b.budget)); }}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 group mt-0.5">
                          <span>of ₹{b.budget.toLocaleString("en-IN")} budget</span>
                          <Pencil size={10} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                        </button>
                      )}
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

              {/* ── Add custom category ───────────────────────────────── */}
              {!showAddCat ? (
                <button
                  onClick={()=>setShowAddCat(true)}
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 hover:bg-indigo-100 border border-dashed border-indigo-300 rounded-2xl px-5 py-4 w-full transition-colors mt-1">
                  <span className="text-xl leading-none">+</span> Create custom category
                </button>
              ) : (
                <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5 mt-1">
                  <p className="font-semibold text-gray-900 text-sm mb-4">New Custom Category</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Category Name</label>
                      <input
                        autoFocus
                        value={newCatName}
                        onChange={e=>setNewCatName(e.target.value)}
                        onKeyDown={e=>{ if(e.key==="Enter") addCustomCategory(); if(e.key==="Escape"){ setShowAddCat(false); setNewCatName(""); setNewCatBudget(""); } }}
                        placeholder="e.g. Office Supplies, GST, Vendor"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Monthly Budget <span className="font-normal text-gray-300">(optional)</span></label>
                      <input
                        value={newCatBudget}
                        onChange={e=>setNewCatBudget(e.target.value)}
                        onKeyDown={e=>{ if(e.key==="Enter") addCustomCategory(); if(e.key==="Escape"){ setShowAddCat(false); setNewCatName(""); setNewCatBudget(""); } }}
                        placeholder="₹ e.g. 5000"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addCustomCategory}
                      disabled={!newCatName.trim()}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                      Create Category
                    </button>
                    <button
                      onClick={()=>{ setShowAddCat(false); setNewCatName(""); setNewCatBudget(""); }}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
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
                  <p className="text-indigo-400 text-sm">AI-Powered · Analysing your real spending data</p>
                </div>
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {/* Per-user picker — admin only */}
                  {userRole === "admin" && users.length > 0 && (
                    <div className="relative">
                      <select
                        value={insightUserId}
                        onChange={e => {
                          const uid = e.target.value;
                          insightUserIdRef.current = uid;
                          setInsightUserId(uid);
                          loadInsights({ userId: uid, lang: insightLangRef.current });
                        }}
                        className="appearance-none text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg pl-3 pr-7 py-1.5 text-indigo-200 cursor-pointer focus:outline-none transition-colors">
                        <option value="">👥 All users</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="absolute right-2.5 top-2 text-indigo-300 pointer-events-none"/>
                    </div>
                  )}
                  {/* Language toggle EN / हि */}
                  <div className="flex items-center bg-white/10 rounded-lg overflow-hidden border border-white/20">
                    <button
                      onClick={() => {
                        insightLangRef.current = "en";
                        setInsightLang("en");
                        loadInsights({ lang: "en", userId: insightUserIdRef.current });
                      }}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 transition-colors ${insightLang === "en" ? "bg-white/20 text-white font-semibold" : "text-indigo-300 hover:text-white"}`}>
                      <Languages size={11}/> EN
                    </button>
                    <button
                      onClick={() => {
                        insightLangRef.current = "hi";
                        setInsightLang("hi");
                        loadInsights({ lang: "hi", userId: insightUserIdRef.current });
                      }}
                      className={`text-xs px-2.5 py-1.5 transition-colors ${insightLang === "hi" ? "bg-white/20 text-white font-semibold" : "text-indigo-300 hover:text-white"}`}>
                      हिं
                    </button>
                  </div>
                  <button onClick={generateReport}
                    className="text-xs text-indigo-300 hover:text-white bg-white/10 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors">
                    <Receipt size={12}/> Monthly Report
                  </button>
                  <button onClick={() => loadInsights()} className="text-xs text-indigo-300 hover:text-white bg-white/10 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors">
                    <RefreshCw size={12}/> Regenerate
                  </button>
                </div>
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

            {/* Behavioral Patterns */}
            {data.count > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <SectionHeader icon={Zap} title="Spending Patterns" sub="Behavioural analysis from your data"/>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Weekend vs weekday */}
                  <div className={`rounded-xl p-4 border ${weekendMult > 1.5 ? "bg-orange-50 border-orange-100" : "bg-green-50 border-green-100"}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Weekend vs Weekday</p>
                    <p className={`text-2xl font-bold ${weekendMult > 1.5 ? "text-orange-700" : "text-green-700"}`}>
                      {weekendMult > 1 ? `${weekendMult.toFixed(1)}×` : `${(1/weekendMult).toFixed(1)}× less`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {weekendMult > 1.5
                        ? `You spend ${weekendMult.toFixed(1)}× more per day on weekends — ₹${Math.round(weekendAvg).toLocaleString("en-IN")} vs ₹${Math.round(weekdayAvg).toLocaleString("en-IN")} on weekdays`
                        : weekendMult < 0.8
                        ? `Weekdays are your bigger spend days — ₹${Math.round(weekdayAvg).toLocaleString("en-IN")}/day vs ₹${Math.round(weekendAvg).toLocaleString("en-IN")}/day weekends`
                        : `Consistent daily spend — ₹${Math.round(weekdayAvg).toLocaleString("en-IN")}/weekday vs ₹${Math.round(weekendAvg).toLocaleString("en-IN")}/weekend`
                      }
                    </p>
                  </div>
                  {/* Peak day */}
                  <div className="rounded-xl p-4 border bg-indigo-50 border-indigo-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Peak Day</p>
                    <p className="text-2xl font-bold text-indigo-700">{peakDay?.day || "—"}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {peakDay ? `₹${peakDay.amount.toLocaleString("en-IN")} spent on ${peakDay.day}s this month — your highest-spend day` : "Not enough data"}
                    </p>
                  </div>
                  {/* Quietest day */}
                  <div className="rounded-xl p-4 border bg-emerald-50 border-emerald-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quietest Day</p>
                    <p className="text-2xl font-bold text-emerald-700">{quietDay?.day || "—"}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {quietDay ? `₹${quietDay.amount.toLocaleString("en-IN")} — you spend least on ${quietDay.day}s. Schedule big purchases on low-spend days.` : "Not enough data"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Key financial metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {label:"Projected Month End", value:`₹${data.projectedEnd.toLocaleString("en-IN")}`, icon:TrendingUp, color:"bg-violet-500"},
                {label:"Largest Expense",     value:`₹${data.maxExpense.toLocaleString("en-IN")}`,   icon:AlertTriangle, color:"bg-red-500"},
                {label:"Avg Transaction",     value:`₹${data.avgExpense.toLocaleString("en-IN")}`,   icon:Receipt, color:"bg-amber-500"},
                {label:"Over-Budget Items",   value:`${activeBudgetTracker.filter(b=>b.over).length}`, icon:Target, color:"bg-orange-500"},
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
                    onDrop={e=>{
                      e.preventDefault(); setUploadDrag(false);
                      const files = e.dataTransfer.files;
                      if (!files.length) return;
                      if (files.length === 1) { handleUploadFile(files[0]); }
                      else { if (!userName.trim()) { setShowNameModal(true); return; } resetUpload(); analyzeMultiple(Array.from(files)); }
                    }}
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
                    <div className="flex justify-center flex-wrap gap-2">
                      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium">JPEG / PNG / WebP</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium">PDF Invoice</span>
                      <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1 rounded-full font-medium">Excel / CSV</span>
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
                <p className="font-bold text-gray-900 text-xl mb-1">
                  {uploadFileName?.includes("files") ? `Scanning ${uploadFileName}…` : "Scanning your receipt…"}
                </p>
                <p className="text-gray-400 text-sm mb-2">
                  {uploadFileName?.includes("files") ? "AI is analysing all files in parallel" : "AI is reading merchant, amount, date and category"}
                </p>
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
                    {/* Uploader badge */}
                    {userName && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <UserCircle size={11}/>
                        Logging as {userName}
                      </div>
                    )}
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
                      <input
                        list="upload-categories"
                        value={editedExpense.category}
                        onChange={e=>setEditedExpense(p=>p?{...p,category:e.target.value}:p)}
                        placeholder="Pick or type a category…"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                      <datalist id="upload-categories">
                        {CATEGORIES.map(c=><option key={c} value={c}/>)}
                        {customCategories.map(c=><option key={c} value={c}/>)}
                      </datalist>
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

                    {/* Billed To */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Billed To <span className="font-normal text-gray-300">(optional)</span></label>
                      <input
                        value={editedExpense.billed_to}
                        onChange={e=>setEditedExpense(p=>p?{...p,billed_to:e.target.value}:p)}
                        placeholder="e.g. Jangid Brothers Pvt Ltd"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>

                    {/* ── Extracted metadata panel ──────────────────────── */}
                    {uploadMetadata && (() => {
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

                {/* Anomaly detection banner */}
                {uploadAnomaly?.level && (
                  <div className={`mx-6 mt-5 flex items-start gap-3 rounded-xl px-4 py-3 border ${
                    uploadAnomaly.level === "high"
                      ? "bg-red-50 border-red-200"
                      : "bg-amber-50 border-amber-200"
                  }`}>
                    <AlertTriangle size={15} className={`mt-0.5 flex-shrink-0 ${uploadAnomaly.level === "high" ? "text-red-500" : "text-amber-500"}`}/>
                    <div>
                      <p className={`text-xs font-bold ${uploadAnomaly.level === "high" ? "text-red-800" : "text-amber-800"}`}>
                        {uploadAnomaly.level === "high" ? "⚠️ Unusual spend detected" : "📌 Heads up"}
                      </p>
                      <p className={`text-xs mt-0.5 ${uploadAnomaly.level === "high" ? "text-red-700" : "text-amber-700"}`}>
                        {uploadAnomaly.message}
                      </p>
                    </div>
                  </div>
                )}

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
                  <button onClick={()=>{ setCatFilter("All"); setTab("Overview"); }}
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

            {/* ── Excel review table ─────────────────────────────────── */}
            {(uploadStage === "excel-review" || uploadStage === "excel-importing") && excelRows.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">Review Import</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{uploadFileName} · {excelRows.length} rows found · edit before importing</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>setExcelRows(p=>p.map(r=>({...r,selected:true})))}
                      className="text-xs text-indigo-600 hover:underline">Select all</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={()=>setExcelRows(p=>p.map(r=>({...r,selected:false})))}
                      className="text-xs text-gray-400 hover:underline">None</button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="w-10 px-3 py-3 text-left">
                            <input type="checkbox"
                              checked={excelRows.every(r=>r.selected)}
                              onChange={e=>setExcelRows(p=>p.map(r=>({...r,selected:e.target.checked})))}
                              className="rounded"/>
                          </th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Merchant</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount (₹)</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelRows.map((row, i) => (
                          <tr key={row._id} className={`border-b border-gray-50 last:border-0 ${!row.selected ? "opacity-40" : ""}`}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={row.selected}
                                onChange={e=>setExcelRows(p=>p.map((r,j)=>j===i?{...r,selected:e.target.checked}:r))}
                                className="rounded"/>
                            </td>
                            <td className="px-3 py-2">
                              <input value={row.merchant}
                                onChange={e=>setExcelRows(p=>p.map((r,j)=>j===i?{...r,merchant:e.target.value}:r))}
                                className="w-full min-w-[120px] border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                            </td>
                            <td className="px-3 py-2">
                              <input value={row.amount} type="number" min="0"
                                onChange={e=>setExcelRows(p=>p.map((r,j)=>j===i?{...r,amount:e.target.value}:r))}
                                className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                            </td>
                            <td className="px-3 py-2">
                              <input value={row.category} list="excel-categories"
                                onChange={e=>setExcelRows(p=>p.map((r,j)=>j===i?{...r,category:e.target.value}:r))}
                                className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                            </td>
                            <td className="px-3 py-2">
                              <input value={row.date} type="date"
                                onChange={e=>setExcelRows(p=>p.map((r,j)=>j===i?{...r,date:e.target.value}:r))}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                            </td>
                            <td className="px-3 py-2">
                              <input value={row.description}
                                onChange={e=>setExcelRows(p=>p.map((r,j)=>j===i?{...r,description:e.target.value}:r))}
                                className="w-full min-w-[120px] border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <datalist id="excel-categories">
                      {CATEGORIES.map(c=><option key={c} value={c}/>)}
                      {customCategories.map(c=><option key={c} value={c}/>)}
                    </datalist>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={importExcel} disabled={uploadStage==="excel-importing" || !excelRows.some(r=>r.selected)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {uploadStage==="excel-importing"
                      ? <><RefreshCw size={15} className="animate-spin"/> Importing…</>
                      : <><Upload size={15}/> Import {excelRows.filter(r=>r.selected).length} transactions</>}
                  </button>
                  <button onClick={resetUpload}
                    className="px-5 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Excel success ──────────────────────────────────────── */}
            {uploadStage === "excel-success" && (
              <div className="text-center py-10 space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle size={32} className="text-green-500"/>
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-lg">{excelImported} transactions imported!</p>
                  <p className="text-sm text-gray-400 mt-1">All saved to your dashboard</p>
                </div>
                <button onClick={resetUpload}
                  className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm">
                  Upload Another
                </button>
              </div>
            )}

            {/* Hidden file input */}
            <input ref={uploadInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.xlsx,.xls,.csv"
              className="hidden" onChange={e=>{
                const files = e.target.files;
                if (!files || !files.length) return;
                if (files.length === 1) { handleUploadFile(files[0]); }
                else {
                  if (!userName.trim()) { setShowNameModal(true); return; }
                  resetUpload();
                  analyzeMultiple(Array.from(files));
                }
                e.target.value="";
              }}/>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8 pb-4">
          EMSI · Expense Management System Intelligence
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={()=>{ if (!pendingUploadFile) { setShowNameModal(false); } }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 mx-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pendingUploadFile ? "bg-amber-50" : "bg-indigo-50"}`}>
                <UserCircle size={20} className={pendingUploadFile ? "text-amber-600" : "text-indigo-600"}/>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">
                  {pendingUploadFile ? "Who's uploading this?" : "Your Name"}
                </h3>
                <p className="text-xs text-gray-400">
                  {pendingUploadFile
                    ? "Your name is saved with every receipt you log"
                    : "Personalise your dashboard"}
                </p>
              </div>
            </div>
            {pendingUploadFile && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                <Receipt size={13} className="text-amber-500 flex-shrink-0"/>
                <p className="text-xs text-amber-700 font-medium truncate">{pendingUploadFile.name}</p>
              </div>
            )}
            <input
              autoFocus
              value={nameInput}
              onChange={e=>setNameInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveName()}
              placeholder="e.g. Kishore"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 mb-3"
            />
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              WhatsApp Number <span className="text-gray-300 font-normal">(optional — links to your bot identity)</span>
            </label>
            <input
              value={whatsappInput}
              onChange={e=>setWhatsappInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveName()}
              placeholder="e.g. 9876543210"
              type="tel"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 mb-4"
            />
            <div className="flex gap-2">
              {!pendingUploadFile && (
                <button onClick={()=>setShowNameModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              )}
              {pendingUploadFile && (
                <button onClick={()=>{ setPendingUploadFile(null); setShowNameModal(false); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                  Cancel Upload
                </button>
              )}
              <button onClick={saveName} disabled={!nameInput.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-sm text-white font-semibold transition-colors">
                {pendingUploadFile ? "Save & Upload →" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Monthly Report Modal ─────────────────────────────────────── */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={()=>{ if(!reportLoading) setReportOpen(false); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
                    <Receipt size={17} className="text-white"/>
                  </div>
                  <div>
                    <p className="text-white font-bold">{report?.monthLabel || monthLabel} — Financial Report</p>
                    {report && <p className="text-indigo-200 text-xs">₹{report.total.toLocaleString("en-IN")} · {report.count} transactions</p>}
                  </div>
                </div>
                {!reportLoading && (
                  <button onClick={()=>setReportOpen(false)} className="text-white/70 hover:text-white transition-colors">
                    <X size={20}/>
                  </button>
                )}
              </div>
              {report && (
                <p className="text-white/90 text-sm mt-3 leading-relaxed italic">"{report.report.headline}"</p>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {reportLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                    <Brain size={26} className="text-indigo-500 animate-pulse"/>
                  </div>
                  <p className="font-semibold text-gray-800">Generating your report…</p>
                  <p className="text-sm text-gray-400">AI is analysing {data?.count} transactions</p>
                  <div className="flex gap-2">
                    {[0,1,2,3].map(i=><div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay:`${i*120}ms`}}/>)}
                  </div>
                </div>
              ) : report ? (
                <>
                  {report.report.sections.map((s, i) => (
                    <div key={i}>
                      <h4 className="font-bold text-gray-900 text-sm mb-1.5 flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block"/>
                        {s.heading}
                      </h4>
                      <p className="text-sm text-gray-600 leading-relaxed pl-3.5">{s.body}</p>
                    </div>
                  ))}
                  {/* Action items */}
                  <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-5 border border-indigo-100">
                    <h4 className="font-bold text-indigo-900 text-sm mb-3 flex items-center gap-2">
                      <Target size={14} className="text-indigo-600"/> 3 Actions for Next Month
                    </h4>
                    <div className="space-y-2">
                      {report.report.actions.map((a, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="w-5 h-5 bg-indigo-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                          <p className="text-sm text-gray-700">{a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer actions */}
            {!reportLoading && report && (
              <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
                <button
                  onClick={()=>{
                    const text = `${report.monthLabel} Financial Report\n\n${report.report.headline}\n\n`
                      + report.report.sections.map(s=>`${s.heading}\n${s.body}`).join("\n\n")
                      + `\n\nActions:\n${report.report.actions.map((a,i)=>`${i+1}. ${a}`).join("\n")}`;
                    navigator.clipboard.writeText(text).then(()=>showToast("Copied to clipboard! ✅","success"));
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm font-medium">
                  <ArrowUpRight size={14}/> Copy Report
                </button>
                <button onClick={()=>setReportOpen(false)}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Receipt Lightbox Modal ────────────────────────────────────── */}
      {/* ── Edit Transaction Modal ──────────────────────────────────────── */}
      {editTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Edit Transaction</h3>
              <button onClick={()=>setEditTxn(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label:"Merchant",    key:"merchant",     type:"text"   },
                { label:"Amount (₹)",  key:"amount",       type:"number" },
                { label:"Date",        key:"expense_date", type:"date"   },
                { label:"Description", key:"description",  type:"text"   },
              ].map(({ label, key, type }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-gray-500">{label}</label>
                  <input
                    type={type}
                    value={editTxn[key as keyof typeof editTxn]}
                    onChange={e=>setEditTxn({...editTxn,[key]:e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Category</label>
                <input
                  list="edit-categories"
                  value={editTxn.category}
                  onChange={e=>setEditTxn({...editTxn,category:e.target.value})}
                  placeholder="Pick or type a category…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-400 transition-all"
                />
                <datalist id="edit-categories">
                  {CATEGORIES.map(c=><option key={c} value={c}/>)}
                  {customCategories.map(c=><option key={c} value={c}/>)}
                </datalist>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={()=>setEditTxn(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={saveEdit} disabled={txnSaving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                {txnSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ────────────────────────────────────────── */}
      {deleteTxnId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500"/>
            </div>
            <h3 className="font-bold text-gray-900 mb-1">Delete transaction?</h3>
            <p className="text-sm text-gray-400 mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTxnId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {receiptView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={()=>setReceiptView(null)}>
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e=>e.stopPropagation()}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                  {CAT_EMOJI[receiptView.category]||"📦"}
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{receiptView.merchant}</p>
                  <p className="text-xs text-gray-400">{receiptView.category} · {receiptView.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-indigo-700">
                  ₹{Number(receiptView.amount).toLocaleString("en-IN")}
                </span>
                <button onClick={()=>setReceiptView(null)}
                  className="ml-2 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500">
                  <X size={15}/>
                </button>
              </div>
            </div>

            {/* Scrollable body: receipt image + metadata */}
            <div className="flex-1 overflow-y-auto">
              {/* Receipt image / PDF placeholder */}
              <div className="bg-slate-100 flex items-center justify-center p-4 min-h-[220px]">
                {receiptView.isPdf ? (
                  <div className="text-center space-y-3">
                    <div className="w-20 h-24 bg-orange-50 rounded-2xl border-2 border-orange-100 flex items-center justify-center mx-auto">
                      <FilePlus size={36} className="text-orange-400"/>
                    </div>
                    <p className="text-sm font-medium text-gray-600">PDF Receipt</p>
                    <p className="text-xs text-gray-400">Open to view full document</p>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={receiptView.url}
                    alt={`Receipt — ${receiptView.merchant}`}
                    className="max-w-full max-h-[45vh] rounded-xl shadow-md object-contain"
                  />
                )}
              </div>

              {/* ── Metadata panel ─────────────────────────────────────── */}
              {(() => {
                const meta = receiptView.metadata as MetaShape | null;
                const taxes    = meta?.taxes;
                const items    = meta?.line_items;
                const hasAny   = meta && (
                  meta.payment_method || meta.upi_ref || meta.order_id ||
                  meta.invoice_number || (items && items.length > 0) ||
                  (taxes && (taxes.total_tax ?? 0) > 0) || meta.discount ||
                  meta.merchant_address
                );
                if (!hasAny) {
                  return receiptView.description ? (
                    <div className="px-5 py-4 border-t border-gray-50">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-700">{receiptView.description}</p>
                    </div>
                  ) : null;
                }
                return (
                  <div className="px-5 py-4 border-t border-gray-100 space-y-4">
                    {/* Description */}
                    {receiptView.description && (
                      <p className="text-sm text-gray-600 italic">"{receiptView.description}"</p>
                    )}
                    {/* Who uploaded + who's billed */}
                    {(meta?.uploaded_by || meta?.billed_to || meta?.prepared_by) && (
                      <div className="flex flex-wrap gap-2 pb-1 border-b border-gray-100">
                        {meta?.uploaded_by && (
                          <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-full font-medium">
                            👤 Uploaded by {String(meta.uploaded_by)}
                          </span>
                        )}
                        {meta?.billed_to && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full font-medium">
                            📋 Billed to {String(meta.billed_to)}
                          </span>
                        )}
                        {meta?.prepared_by && (
                          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full">
                            🧾 Served by {String(meta.prepared_by)}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Chips row: payment method, UPI, order ID, invoice */}
                    <div className="flex flex-wrap gap-2">
                      {meta?.payment_method && meta.payment_method !== "Unknown" && (
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                          💳 {String(meta.payment_method)}
                        </span>
                      )}
                      {meta?.upi_ref && (
                        <span className="text-xs bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-1 rounded-full font-mono">
                          UPI {String(meta.upi_ref).slice(0,16)}{String(meta.upi_ref).length>16?"…":""}
                        </span>
                      )}
                      {meta?.order_id && (
                        <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
                          # {String(meta.order_id).slice(0,20)}{String(meta.order_id).length>20?"…":""}
                        </span>
                      )}
                      {meta?.invoice_number && (
                        <span className="text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
                          INV {String(meta.invoice_number)}
                        </span>
                      )}
                    </div>
                    {/* Merchant address */}
                    {meta?.merchant_address && (
                      <p className="text-xs text-gray-400">📍 {String(meta.merchant_address)}</p>
                    )}
                    {/* Line items table */}
                    {items && items.length > 0 && (
                      <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                        <div className="grid grid-cols-[1fr_auto_auto] text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-3 py-2 border-b border-gray-100">
                          <span>Item</span><span className="pr-4 text-right">Qty</span><span className="text-right">Price</span>
                        </div>
                        {items.map((item, i) => (
                          <div key={i} className="grid grid-cols-[1fr_auto_auto] text-xs px-3 py-2 border-b border-gray-50 last:border-0">
                            <span className="text-gray-700 truncate pr-2">{item.name}</span>
                            <span className="text-gray-400 pr-4 text-right">{item.qty}</span>
                            <span className="font-medium text-gray-900 text-right">₹{Number(item.price).toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Tax + discount summary */}
                    {(meta?.subtotal || (meta?.discount ?? 0) > 0 || (taxes && (taxes.total_tax ?? 0) > 0)) && (
                      <div className="space-y-1 text-xs border-t border-gray-100 pt-3">
                        {meta?.subtotal && (
                          <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>₹{Number(meta.subtotal).toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        {(meta?.discount ?? 0) > 0 && (
                          <div className="flex justify-between text-green-600 font-medium">
                            <span>Discount</span>
                            <span>−₹{Number(meta!.discount).toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        {taxes?.cgst && taxes?.sgst ? (
                          <>
                            <div className="flex justify-between text-gray-400"><span>CGST</span><span>₹{Number(taxes.cgst).toLocaleString("en-IN")}</span></div>
                            <div className="flex justify-between text-gray-400"><span>SGST</span><span>₹{Number(taxes.sgst).toLocaleString("en-IN")}</span></div>
                          </>
                        ) : taxes?.gst ? (
                          <div className="flex justify-between text-gray-400"><span>GST</span><span>₹{Number(taxes.gst).toLocaleString("en-IN")}</span></div>
                        ) : taxes?.total_tax ? (
                          <div className="flex justify-between text-gray-400"><span>Tax</span><span>₹{Number(taxes.total_tax).toLocaleString("en-IN")}</span></div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <a
                href={receiptView.url}
                download
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm font-medium">
                <ArrowUpRight size={14}/> Open original
              </a>
              <button onClick={()=>setReceiptView(null)}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm">
                Close
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
