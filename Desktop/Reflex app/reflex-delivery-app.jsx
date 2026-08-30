import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Package, Truck, CheckCircle2, Clock, XCircle, MapPin, Phone, User as UserIcon,
  Search, SlidersHorizontal, QrCode, Camera, Wifi, WifiOff, Bell, LogOut, Plus,
  ChevronRight, ChevronLeft, AlertCircle, Menu, X, LayoutGrid, ListChecks, History as HistoryIcon,
  Users, Home, Bike, CircleCheck, ScanLine, RefreshCw, ArrowLeft, ShieldCheck, Loader2,
  MessageSquareText, ClipboardList
} from "lucide-react";

/* ============================================================================
   REFLEX — Kenyan retail delivery management system (functional prototype)
   Persistence: window.storage (shared=true) acts as the shared database, so
   every role reading this artifact sees the same delivery records. Status
   polling simulates the realtime sync a Supabase/WS backend would provide.
   ============================================================================ */

const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap');
:root{
  --ink:#12181F; --ink-soft:#232C36; --paper:#F6F4EF; --panel:#FFFFFF;
  --line:#E4E0D6; --slate:#5B6472; --slate-soft:#8B93A0;
  --signal:#FF6A2B; --signal-dark:#E1551A; --route:#1F8A5F; --route-soft:#E4F3EC;
  --alert:#D64545; --alert-soft:#FBE7E7; --amber:#C98A1A; --amber-soft:#FBF1DD;
  --blue:#2E6FB0; --blue-soft:#E6EEF7;
}
.rfx{font-family:'Inter',sans-serif;color:var(--ink);background:var(--paper);}
.rfx-display{font-family:'Space Grotesk',sans-serif;}
.rfx-mono{font-family:'JetBrains Mono',monospace;}
.rfx-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;}
.rfx-scroll::-webkit-scrollbar{width:6px;height:6px;}
.rfx-scroll::-webkit-scrollbar-thumb{background:#D8D3C6;border-radius:4px;}
.rfx-btn-primary{background:var(--signal);color:#fff;font-weight:600;}
.rfx-btn-primary:hover{background:var(--signal-dark);}
.rfx-btn-primary:disabled{background:#E3B79E;cursor:not-allowed;}
.rfx-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.03em;padding:4px 10px;border-radius:999px;text-transform:uppercase;}
.rfx-dot{width:6px;height:6px;border-radius:999px;}
.rfx-fade-in{animation:rfxFade .25s ease;}
@keyframes rfxFade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);}}
.rfx-track-line{background:repeating-linear-gradient(0deg,var(--line),var(--line) 4px,transparent 4px,transparent 9px);}
.rfx-input{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;background:#fff;outline:none;transition:border-color .15s;}
.rfx-input:focus{border-color:var(--signal);}
.rfx-label{font-size:12px;font-weight:600;color:var(--slate);margin-bottom:5px;display:block;}
.rfx-qr{background:repeating-conic-gradient(#12181F 0% 25%, transparent 0% 50%) 0 0/10px 10px;}
`;

/* ---------------------------- constants / seed data ---------------------------- */

const STORE_KEY = "reflex_deliveries_v1";
const NOTIF_KEY = "reflex_notifications_v1";
const RIDER_KEY = "reflex_riders_v1";

const STATUS = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered", "Failed"];

const STATUS_STYLE = {
  Pending:   { fg: "#8A6A17", bg: "var(--amber-soft)", dot: "var(--amber)" },
  Assigned:  { fg: "#2E6FB0", bg: "var(--blue-soft)",  dot: "var(--blue)" },
  "Picked Up": { fg: "#8A6A17", bg: "var(--amber-soft)", dot: "var(--amber)" },
  "In Transit": { fg: "#B24E12", bg: "#FDEADD", dot: "var(--signal)" },
  Delivered: { fg: "#1F8A5F", bg: "var(--route-soft)", dot: "var(--route)" },
  Failed:    { fg: "#B23A3A", bg: "var(--alert-soft)", dot: "var(--alert)" },
};

const DEMO_USERS = [
  { id: "u-retailer-1", name: "Grace Wanjiru", email: "retailer@reflex.demo", password: "demo123", role: "retailer", phone: "+254 712 345 001", org: "Wanjiru Electronics, Thika" },
  { id: "u-dispatcher-1", name: "Kevin Otieno", email: "dispatcher@reflex.demo", password: "demo123", role: "dispatcher", phone: "+254 712 345 002", org: "Reflex Ops Desk" },
  { id: "u-rider-1", name: "Brian Mwangi", email: "rider@reflex.demo", password: "demo123", role: "rider", phone: "+254 712 345 003", org: "Rider" },
];

const RIDERS_SEED = [
  { id: "u-rider-1", name: "Brian Mwangi", phone: "+254 712 345 003", availability: "available" },
  { id: "u-rider-2", name: "Faith Achieng", phone: "+254 733 221 144", availability: "available" },
  { id: "u-rider-3", name: "Dennis Kiptoo", phone: "+254 701 998 877", availability: "busy" },
  { id: "u-rider-4", name: "Mercy Njeri", phone: "+254 720 556 903", availability: "off_duty" },
];

const LOCATIONS = [
  "Kasarani, Nairobi", "Thika Road, Kiambu", "Nyali, Mombasa", "Milimani, Kisumu",
  "Westlands, Nairobi", "Ruiru, Kiambu", "Bamburi, Mombasa", "CBD, Nairobi",
];

function pad(n) { return String(n).padStart(4, "0"); }
function genDeliveryNumber(seq) { return `RFX-2026-${pad(seq)}`; }
function genOTP() { return String(Math.floor(1000 + Math.random() * 9000)); }
function nowISO() { return new Date().toISOString(); }
function fmtTime(iso) { if (!iso) return "—"; return new Date(iso).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
function fmtKES(n) { if (n === null || n === undefined || n === "") return null; return `KES ${Number(n).toLocaleString("en-KE")}`; }
function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; } return Math.abs(h); }

function seedDeliveries() {
  const base = Date.now() - 1000 * 60 * 60 * 6;
  const mk = (i, opts) => {
    const created = new Date(base + i * 1000 * 60 * 22).toISOString();
    return {
      id: `d-${i}`,
      delivery_number: genDeliveryNumber(i),
      retailer_id: "u-retailer-1",
      retailer_name: "Wanjiru Electronics",
      customer_name: opts.customer,
      customer_phone: opts.phone,
      delivery_address: opts.address,
      item_description: opts.item,
      order_number: opts.order || "",
      cod_amount: opts.cod ?? "",
      notes: opts.notes || "",
      status: opts.status,
      rider_id: opts.rider_id || null,
      rider_name: opts.rider_name || null,
      rider_phone: opts.rider_phone || null,
      created_at: created,
      updated_at: opts.updated_at || created,
      delivered_at: opts.delivered_at || null,
      scanned: !!opts.scanned,
      dispatcher_note: null,
      status_history: opts.history,
      proof: opts.proof || { otp: genOTP(), otp_verified: false, recipient_name: "", photo_url: "", latitude: null, longitude: null, confirmed_at: null },
    };
  };

  return [
    mk(1, {
      customer: "John Kamau", phone: "+254 722 118 823", address: "Kasarani, Nairobi",
      item: "Bluetooth speaker (JBL Go 3)", order: "ORD-8841", cod: 3500,
      status: "In Transit", rider_id: "u-rider-1", rider_name: "Brian Mwangi", rider_phone: "+254 712 345 003",
      scanned: true, notes: "Call before arrival, gate code 4521.",
      history: [
        { previous_status: null, new_status: "Pending", changed_by: "Grace Wanjiru", timestamp: base + 0 },
        { previous_status: "Pending", new_status: "Assigned", changed_by: "Kevin Otieno", timestamp: base + 900000 },
        { previous_status: "Assigned", new_status: "Picked Up", changed_by: "Brian Mwangi", timestamp: base + 1500000 },
        { previous_status: "Picked Up", new_status: "In Transit", changed_by: "Brian Mwangi", timestamp: base + 1560000 },
      ],
    }),
    mk(2, {
      customer: "Amina Hassan", phone: "+254 733 902 447", address: "Nyali, Mombasa",
      item: "LED TV 43-inch", order: "ORD-8842", cod: 28000,
      status: "Assigned", rider_id: "u-rider-1", rider_name: "Brian Mwangi", rider_phone: "+254 712 345 003",
      notes: "Fragile — handle with care.",
      history: [
        { previous_status: null, new_status: "Pending", changed_by: "Grace Wanjiru", timestamp: base + 700000 },
        { previous_status: "Pending", new_status: "Assigned", changed_by: "Kevin Otieno", timestamp: base + 1200000 },
      ],
    }),
    mk(3, {
      customer: "Peter Mwangi", phone: "+254 701 556 320", address: "Westlands, Nairobi",
      item: "Phone case + screen protector", order: "", cod: 800,
      status: "Pending", notes: "",
      history: [{ previous_status: null, new_status: "Pending", changed_by: "Grace Wanjiru", timestamp: base + 2000000 }],
    }),
    mk(4, {
      customer: "Susan Achieng", phone: "+254 710 774 221", address: "Milimani, Kisumu",
      item: "HP printer + ink cartridges", order: "ORD-8839", cod: 12500,
      status: "Delivered", rider_id: "u-rider-2", rider_name: "Faith Achieng", rider_phone: "+254 733 221 144",
      scanned: true,
      delivered_at: new Date(base + 3000000).toISOString(),
      updated_at: new Date(base + 3000000).toISOString(),
      proof: { otp: "5521", otp_verified: true, recipient_name: "Susan Achieng", photo_url: "", latitude: -0.0917, longitude: 34.7679, confirmed_at: new Date(base + 3000000).toISOString() },
      history: [
        { previous_status: null, new_status: "Pending", changed_by: "Grace Wanjiru", timestamp: base + 100000 },
        { previous_status: "Pending", new_status: "Assigned", changed_by: "Kevin Otieno", timestamp: base + 400000 },
        { previous_status: "Assigned", new_status: "Picked Up", changed_by: "Faith Achieng", timestamp: base + 900000 },
        { previous_status: "Picked Up", new_status: "In Transit", changed_by: "Faith Achieng", timestamp: base + 950000 },
        { previous_status: "In Transit", new_status: "Delivered", changed_by: "Faith Achieng", timestamp: base + 3000000 },
      ],
    }),
    mk(5, {
      customer: "David Otieno", phone: "+254 745 902 118", address: "Ruiru, Kiambu",
      item: "Car battery 75Ah", order: "ORD-8845", cod: 9800,
      status: "Failed", rider_id: "u-rider-3", rider_name: "Dennis Kiptoo", rider_phone: "+254 701 998 877",
      updated_at: new Date(base + 2600000).toISOString(),
      history: [
        { previous_status: null, new_status: "Pending", changed_by: "Grace Wanjiru", timestamp: base + 1600000 },
        { previous_status: "Pending", new_status: "Assigned", changed_by: "Kevin Otieno", timestamp: base + 1800000 },
        { previous_status: "Assigned", new_status: "Picked Up", changed_by: "Dennis Kiptoo", timestamp: base + 2200000 },
        { previous_status: "Picked Up", new_status: "Failed", changed_by: "Dennis Kiptoo", timestamp: base + 2600000 },
      ],
      dispatcher_note: "Customer unreachable after 3 attempts. Rescheduled by phone.",
    }),
    mk(6, {
      customer: "Mercy Wambui", phone: "+254 700 213 654", address: "CBD, Nairobi",
      item: "Painkillers + first aid kit", order: "ORD-8850", cod: 1450,
      status: "Picked Up", rider_id: "u-rider-1", rider_name: "Brian Mwangi", rider_phone: "+254 712 345 003",
      scanned: true, notes: "Leave with receptionist if customer unavailable.",
      history: [
        { previous_status: null, new_status: "Pending", changed_by: "Grace Wanjiru", timestamp: base + 2300000 },
        { previous_status: "Pending", new_status: "Assigned", changed_by: "Kevin Otieno", timestamp: base + 2500000 },
        { previous_status: "Assigned", new_status: "Picked Up", changed_by: "Brian Mwangi", timestamp: base + 2700000 },
      ],
    }),
  ];
}

/* ------------------------------- storage helpers ------------------------------- */

async function storageGet(key, fallback) {
  try {
    const res = await window.storage.get(key, true);
    if (!res || res.value === undefined) return fallback;
    return JSON.parse(res.value);
  } catch (e) {
    return fallback;
  }
}
async function storageSet(key, value) {
  const res = await window.storage.set(key, JSON.stringify(value), true);
  if (!res) throw new Error("storage_write_failed");
  return res;
}

/* --------------------------------- small UI bits --------------------------------- */

function StatusBadge({ status, size = "md" }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Pending;
  return (
    <span className="rfx-badge" style={{ color: s.fg, background: s.bg, fontSize: size === "sm" ? 10.5 : 11.5 }}>
      <span className="rfx-dot" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = (name || "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const hue = hashCode(name || "x") % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
      background: `hsl(${hue} 45% 92%)`, color: `hsl(${hue} 45% 30%)`, fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }} className="rfx-display">
      {initials}
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="rounded-full p-4 mb-3" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
        <Icon size={22} color="var(--slate-soft)" />
      </div>
      <div className="rfx-display font-semibold text-[15px]">{title}</div>
      {sub && <div className="text-sm mt-1" style={{ color: "var(--slate)" }}>{sub}</div>}
    </div>
  );
}

function QRLabel({ code, size = 120 }) {
  // Deterministic pseudo-QR visual (not a real scannable code) representing the
  // physical waybill label. Rider workflow validates the code, not pixel data.
  const cells = 9;
  const h = hashCode(code);
  const grid = [];
  for (let i = 0; i < cells * cells; i++) {
    const v = (h * (i + 7) * 2654435761) >>> 0;
    grid.push(v % 5 < 2);
  }
  const isFinder = (r, c) => (r < 3 && c < 3) || (r < 3 && c > cells - 4) || (r > cells - 4 && c < 3);
  return (
    <div style={{ width: size, height: size, background: "#fff", padding: 6, borderRadius: 10, border: "1px solid var(--line)" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells}, 1fr)`, gap: 1, width: "100%", height: "100%" }}>
        {grid.map((on, i) => {
          const r = Math.floor(i / cells), c = i % cells;
          const finder = isFinder(r, c);
          return <div key={i} style={{ background: (on || finder) ? "#12181F" : "transparent", borderRadius: 1 }} />;
        })}
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", tone = "primary", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(18,24,31,0.45)" }}>
      <div className="rfx-card rfx-fade-in w-full sm:max-w-sm p-5" style={{ borderRadius: "16px 16px 0 0" }}>
        <div className="rfx-display font-semibold text-[16px] mb-1.5">{title}</div>
        <div className="text-sm mb-4" style={{ color: "var(--slate)" }}>{body}</div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-sm rfx-btn-primary"
            style={tone === "danger" ? { background: "var(--alert)" } : {}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] rfx-fade-in">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium"
        style={{ background: "var(--ink)", color: "#fff" }}>
        <CheckCircle2 size={15} color="#8CE0B3" /> {toast}
      </div>
    </div>
  );
}

/* ------------------------------------ App root ------------------------------------ */

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [riders, setRiders] = useState(RIDERS_SEED);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // initial load + seed
  useEffect(() => {
    (async () => {
      let d = await storageGet(STORE_KEY, null);
      if (!d) { d = seedDeliveries(); await storageSet(STORE_KEY, d).catch(() => {}); }
      let n = await storageGet(NOTIF_KEY, null);
      if (!n) { n = []; }
      let r = await storageGet(RIDER_KEY, null);
      if (!r) { r = RIDERS_SEED; }
      setDeliveries(d); setNotifications(n); setRiders(r);
      setBooting(false);
    })();
  }, []);

  // poll shared store for near-real-time sync across sessions
  useEffect(() => {
    const t = setInterval(async () => {
      if (!online) return;
      const d = await storageGet(STORE_KEY, null);
      if (d) setDeliveries(prev => (JSON.stringify(d) !== JSON.stringify(prev) ? d : prev));
      const n = await storageGet(NOTIF_KEY, null);
      if (n) setNotifications(prev => (JSON.stringify(n) !== JSON.stringify(prev) ? n : prev));
    }, 4000);
    return () => clearInterval(t);
  }, [online]);

  // flush queued writes when back online
  useEffect(() => {
    if (online && pendingSync.length) {
      (async () => {
        for (const fn of pendingSync) { try { await fn(); } catch (e) {} }
        setPendingSync([]);
        showToast("Synced — all queued updates saved");
      })();
    }
  }, [online, pendingSync, showToast]);

  const persistDeliveries = useCallback(async (next) => {
    setDeliveries(next);
    if (!online) { setPendingSync(q => [...q, () => storageSet(STORE_KEY, next)]); return; }
    try { await storageSet(STORE_KEY, next); }
    catch (e) { setOnline(false); setPendingSync(q => [...q, () => storageSet(STORE_KEY, next)]); }
  }, [online]);

  const persistNotifications = useCallback(async (next) => {
    setNotifications(next);
    if (!online) { setPendingSync(q => [...q, () => storageSet(NOTIF_KEY, next)]); return; }
    try { await storageSet(NOTIF_KEY, next); }
    catch (e) { setOnline(false); setPendingSync(q => [...q, () => storageSet(NOTIF_KEY, next)]); }
  }, [online]);

  const persistRiders = useCallback(async (next) => {
    setRiders(next);
    try { await storageSet(RIDER_KEY, next); } catch (e) {}
  }, []);

  const pushNotification = useCallback((n) => {
    const rec = { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, created_at: nowISO(), read_by: [], ...n };
    persistNotifications([rec, ...notifications].slice(0, 200));
  }, [notifications, persistNotifications]);

  if (booting) {
    return (
      <div className="rfx w-full h-full min-h-[600px] flex items-center justify-center" style={{ background: "var(--ink)" }}>
        <style>{FONT_STYLE}</style>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" color="var(--signal)" size={26} />
          <div className="rfx-display text-white/70 text-sm tracking-wide">Loading Reflex…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rfx w-full min-h-[640px]">
        <style>{FONT_STYLE}</style>
        <LoginScreen onLogin={setUser} />
      </div>
    );
  }

  return (
    <div className="rfx w-full min-h-[640px]" style={{ background: "var(--paper)" }}>
      <style>{FONT_STYLE}</style>
      <Toast toast={toast} />
      <Shell
        user={user}
        onLogout={() => setUser(null)}
        deliveries={deliveries}
        notifications={notifications}
        riders={riders}
        online={online}
        setOnline={setOnline}
        pendingCount={pendingSync.length}
        persistDeliveries={persistDeliveries}
        persistRiders={persistRiders}
        pushNotification={pushNotification}
        persistNotifications={persistNotifications}
        showToast={showToast}
      />
    </div>
  );
}

/* ------------------------------------ Login ------------------------------------ */

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e?.preventDefault();
    const u = DEMO_USERS.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) { setError("No account found for that email."); return; }
    if (u.password !== password) { setError("Incorrect password."); return; }
    setError("");
    onLogin(u);
  }

  function quickLogin(u) { setEmail(u.email); setPassword(u.password); setTimeout(() => onLogin(u), 80); }

  return (
    <div className="min-h-[640px] flex flex-col lg:flex-row">
      <div className="lg:w-[46%] flex flex-col justify-between p-8 lg:p-12" style={{ background: "var(--ink)", color: "#fff" }}>
        <div>
          <div className="flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--signal)" }}>
              <Truck size={17} color="#fff" />
            </div>
            <span className="rfx-display font-bold text-lg tracking-tight">REFLEX</span>
          </div>
          <div className="rfx-display font-semibold text-[28px] lg:text-[34px] leading-tight mb-3">
            Every delivery.<br />One clear view.
          </div>
          <p className="text-white/60 text-[14.5px] max-w-sm leading-relaxed">
            Replace WhatsApp groups and phone calls with one system for creating deliveries,
            assigning riders and confirming that every parcel actually arrived.
          </p>
        </div>
        <div className="hidden lg:flex flex-col gap-3 mt-10">
          {[
            { icon: ClipboardList, t: "Retailer creates a delivery in under a minute" },
            { icon: Bike, t: "Dispatcher assigns the nearest available rider" },
            { icon: ShieldCheck, t: "OTP + photo proof before it's marked delivered" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <f.icon size={16} color="var(--signal)" />
              <span className="text-[13.5px] text-white/80">{f.t}</span>
            </div>
          ))}
        </div>
        <div className="text-white/30 text-xs mt-10 lg:mt-0">Built for Kenyan retailers, pharmacies & hardware shops</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="rfx-display font-semibold text-xl mb-1">Sign in</div>
          <p className="text-sm mb-6" style={{ color: "var(--slate)" }}>Use a demo account below or enter credentials manually.</p>

          <form onSubmit={submit} className="flex flex-col gap-3 mb-5">
            <div>
              <label className="rfx-label">Email</label>
              <input className="rfx-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.co.ke" />
            </div>
            <div>
              <label className="rfx-label">Password</label>
              <input type="password" className="rfx-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <div className="text-sm flex items-center gap-1.5" style={{ color: "var(--alert)" }}><AlertCircle size={14} />{error}</div>}
            <button type="submit" className="rfx-btn-primary rounded-lg py-2.5 text-sm mt-1">Sign in</button>
          </form>

          <div className="flex items-center gap-2 my-4">
            <div className="h-px flex-1" style={{ background: "var(--line)" }} />
            <span className="text-xs" style={{ color: "var(--slate-soft)" }}>demo accounts</span>
            <div className="h-px flex-1" style={{ background: "var(--line)" }} />
          </div>

          <div className="flex flex-col gap-2">
            {DEMO_USERS.map(u => (
              <button key={u.id} onClick={() => quickLogin(u)}
                className="rfx-card flex items-center gap-3 p-3 text-left hover:shadow-sm transition-shadow">
                <Avatar name={u.name} size={34} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{u.name}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{u.email} · {u.role}</div>
                </div>
                <ChevronRight size={16} color="var(--slate-soft)" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------ Shell / nav ------------------------------------ */

const NAV = {
  retailer: [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "deliveries", label: "Deliveries", icon: Package },
    { key: "new", label: "New Delivery", icon: Plus },
    { key: "history", label: "Delivery History", icon: HistoryIcon },
    { key: "notifications", label: "Notifications", icon: Bell },
  ],
  dispatcher: [
    { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { key: "all", label: "All Deliveries", icon: Package },
    { key: "needs", label: "Needs Assignment", icon: ListChecks },
    { key: "riders", label: "Riders", icon: Users },
    { key: "history", label: "Delivery History", icon: HistoryIcon },
    { key: "notifications", label: "Notifications", icon: Bell },
  ],
  rider: [
    { key: "today", label: "Today", icon: Bike },
    { key: "history", label: "History", icon: HistoryIcon },
    { key: "notifications", label: "Alerts", icon: Bell },
  ],
};

function Shell(props) {
  const { user, onLogout, deliveries, notifications, riders, online, setOnline, pendingCount,
    persistDeliveries, persistRiders, pushNotification, persistNotifications, showToast } = props;
  const [view, setView] = useState(user.role === "rider" ? "today" : "dashboard");
  const [detailId, setDetailId] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const myUnread = notifications.filter(n => notifVisible(n, user) && !n.read_by.includes(user.id)).length;

  function openDetail(id) { setDetailId(id); }
  function closeDetail() { setDetailId(null); }

  const nav = NAV[user.role];

  if (user.role === "rider") {
    return (
      <RiderShell
        user={user} onLogout={onLogout} deliveries={deliveries} notifications={notifications}
        online={online} setOnline={setOnline} pendingCount={pendingCount}
        persistDeliveries={persistDeliveries} pushNotification={pushNotification}
        persistNotifications={persistNotifications} showToast={showToast}
        view={view} setView={setView} detailId={detailId} openDetail={openDetail} closeDetail={closeDetail}
      />
    );
  }

  return (
    <div className="flex min-h-[640px]">
      {/* sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 z-40 w-64 flex-shrink-0 transition-transform lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--ink)" }}>
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "var(--signal)" }}>
              <Truck size={14} color="#fff" />
            </div>
            <span className="rfx-display font-bold text-white text-[15px] tracking-tight">REFLEX</span>
          </div>
          <button className="lg:hidden text-white/60" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>
        <nav className="px-3 flex flex-col gap-1 mt-2">
          {nav.map(item => {
            const active = view === item.key && !detailId;
            return (
              <button key={item.key} onClick={() => { setView(item.key); closeDetail(); setMobileNavOpen(false); }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors"
                style={{ background: active ? "rgba(255,106,43,0.14)" : "transparent", color: active ? "#FF8A54" : "rgba(255,255,255,0.65)" }}>
                <item.icon size={16} />
                {item.label}
                {item.key === "notifications" && myUnread > 0 && (
                  <span className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ background: "var(--signal)", color: "#fff" }}>{myUnread}</span>
                )}
                {item.key === "needs" && deliveries.filter(d => d.status === "Pending").length > 0 && (
                  <span className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ background: "var(--amber)", color: "#12181F" }}>
                    {deliveries.filter(d => d.status === "Pending").length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-2.5 rounded-xl p-2.5 mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
            <Avatar name={user.name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-white text-[12.5px] font-semibold truncate">{user.name}</div>
              <div className="text-white/40 text-[11px] truncate">{user.org}</div>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12.5px] text-white/50 hover:text-white/80">
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>
      {mobileNavOpen && <div className="fixed inset-0 z-30 lg:hidden" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setMobileNavOpen(false)} />}

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar user={user} online={online} setOnline={setOnline} pendingCount={pendingCount}
          onMenu={() => setMobileNavOpen(true)} title={detailId ? "Delivery detail" : (nav.find(n => n.key === view)?.label || "")} />
        <div className="flex-1 overflow-y-auto rfx-scroll p-4 lg:p-6">
          {detailId ? (
            <DeliveryDetail id={detailId} role={user.role} user={user} deliveries={deliveries} riders={riders}
              persistDeliveries={persistDeliveries} pushNotification={pushNotification} onBack={closeDetail} showToast={showToast} />
          ) : user.role === "retailer" ? (
            <RetailerViews view={view} setView={setView} user={user} deliveries={deliveries} notifications={notifications}
              persistDeliveries={persistDeliveries} persistNotifications={persistNotifications} openDetail={openDetail} showToast={showToast} />
          ) : (
            <DispatcherViews view={view} setView={setView} user={user} deliveries={deliveries} riders={riders} notifications={notifications}
              persistDeliveries={persistDeliveries} persistRiders={persistRiders} persistNotifications={persistNotifications}
              pushNotification={pushNotification} openDetail={openDetail} showToast={showToast} />
          )}
        </div>
      </div>
    </div>
  );
}

function notifVisible(n, user) {
  if (user.role === "dispatcher") return true;
  if (user.role === "retailer") return n.retailer_id === user.id;
  if (user.role === "rider") return n.rider_id === user.id;
  return false;
}

function TopBar({ user, online, setOnline, pendingCount, onMenu, title }) {
  return (
    <div className="flex items-center justify-between px-4 lg:px-6 py-3.5 border-b" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <button className="lg:hidden" onClick={onMenu}><Menu size={19} /></button>
        <div className="rfx-display font-semibold text-[16px] truncate">{title}</div>
      </div>
      <button onClick={() => setOnline(o => !o)} title="Toggle to simulate connectivity loss"
        className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full flex-shrink-0"
        style={{ background: online ? "var(--route-soft)" : "var(--alert-soft)", color: online ? "var(--route)" : "var(--alert)" }}>
        {online ? <Wifi size={13} /> : <WifiOff size={13} />}
        {online ? "Online" : `Offline${pendingCount ? ` · ${pendingCount} queued` : ""}`}
      </button>
    </div>
  );
}

/* ------------------------------- shared building blocks ------------------------------- */

function SummaryCards({ deliveries, scope }) {
  const list = deliveries;
  const count = s => list.filter(d => d.status === s).length;
  const cards = [
    { label: "Total Deliveries", value: list.length, icon: Package, color: "var(--ink)" },
    { label: "Pending", value: count("Pending"), icon: Clock, color: "var(--amber)" },
    { label: "Assigned", value: count("Assigned"), icon: ListChecks, color: "var(--blue)" },
    { label: "In Transit", value: count("In Transit"), icon: Truck, color: "var(--signal)" },
    { label: "Delivered", value: count("Delivered"), icon: CheckCircle2, color: "var(--route)" },
    { label: "Failed", value: count("Failed"), icon: XCircle, color: "var(--alert)" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className="rfx-card p-3.5">
          <c.icon size={15} color={c.color} />
          <div className="rfx-display font-bold text-[22px] mt-2 leading-none">{c.value}</div>
          <div className="text-[11.5px] mt-1" style={{ color: "var(--slate)" }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function DeliveriesTable({ deliveries, onOpen, showRider = true, showRetailer = false }) {
  if (!deliveries.length) return <EmptyState icon={Package} title="No deliveries here yet" sub="New deliveries will show up in this list." />;
  return (
    <div className="rfx-card overflow-hidden">
      <div className="overflow-x-auto rfx-scroll">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--line)" }}>
              {["ID", "Customer", "Destination", ...(showRetailer ? ["Retailer"] : []), ...(showRider ? ["Rider"] : []), "Status", "Created", "Updated", ""].map(h => (
                <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: "var(--slate)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".03em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deliveries.map(d => (
              <tr key={d.id} className="border-b last:border-0 cursor-pointer hover:bg-[var(--paper)]" style={{ borderColor: "var(--line)" }} onClick={() => onOpen(d.id)}>
                <td className="px-4 py-3 rfx-mono font-semibold whitespace-nowrap">{d.delivery_number}</td>
                <td className="px-4 py-3 whitespace-nowrap">{d.customer_name}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--slate)" }}>{d.delivery_address}</td>
                {showRetailer && <td className="px-4 py-3 whitespace-nowrap">{d.retailer_name}</td>}
                {showRider && <td className="px-4 py-3 whitespace-nowrap">{d.rider_name || <span style={{ color: "var(--slate-soft)" }}>Unassigned</span>}</td>}
                <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={d.status} size="sm" /></td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--slate)" }}>{fmtTime(d.created_at)}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--slate)" }}>{fmtTime(d.updated_at)}</td>
                <td className="px-4 py-3"><ChevronRight size={15} color="var(--slate-soft)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SearchFilterBar({ query, setQuery, status, setStatus, riderFilter, setRiderFilter, riders, showRiderFilter }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-4">
      <div className="relative flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" color="var(--slate-soft)" />
        <input className="rfx-input pl-9" placeholder="Search delivery ID, customer, phone, order no…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <select className="rfx-input sm:w-44" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {showRiderFilter && (
        <select className="rfx-input sm:w-44" value={riderFilter} onChange={e => setRiderFilter(e.target.value)}>
          <option value="">All riders</option>
          {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
    </div>
  );
}

function filterDeliveries(deliveries, { query, status, riderFilter, retailerId }) {
  let list = deliveries;
  if (retailerId) list = list.filter(d => d.retailer_id === retailerId);
  if (status) list = list.filter(d => d.status === status);
  if (riderFilter) list = list.filter(d => d.rider_id === riderFilter);
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter(d => [d.delivery_number, d.customer_name, d.customer_phone, d.rider_name, d.order_number]
      .filter(Boolean).some(v => v.toLowerCase().includes(q)));
  }
  return [...list].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

/* ------------------------------------ Retailer ------------------------------------ */

function RetailerViews({ view, setView, user, deliveries, notifications, persistDeliveries, persistNotifications, openDetail, showToast }) {
  const mine = deliveries.filter(d => d.retailer_id === user.id);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("");

  if (view === "dashboard") {
    const filtered = filterDeliveries(mine, { query: "", status: "", riderFilter: "" }).slice(0, 8);
    return (
      <div>
        <SummaryCards deliveries={mine} />
        <div className="flex items-center justify-between mb-3">
          <div className="rfx-display font-semibold text-[15px]">Recent deliveries</div>
          <button onClick={() => setView("new")} className="rfx-btn-primary rounded-lg px-3.5 py-2 text-[13px] flex items-center gap-1.5">
            <Plus size={14} /> New Delivery
          </button>
        </div>
        <DeliveriesTable deliveries={filtered} onOpen={openDetail} />
      </div>
    );
  }

  if (view === "deliveries") {
    const filtered = filterDeliveries(mine, { query, status, riderFilter: "" });
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="rfx-display font-semibold text-[15px]">All deliveries ({mine.length})</div>
          <button onClick={() => setView("new")} className="rfx-btn-primary rounded-lg px-3.5 py-2 text-[13px] flex items-center gap-1.5">
            <Plus size={14} /> New Delivery
          </button>
        </div>
        <SearchFilterBar query={query} setQuery={setQuery} status={status} setStatus={setStatus} showRiderFilter={false} />
        <DeliveriesTable deliveries={filtered} onOpen={openDetail} />
      </div>
    );
  }

  if (view === "new") {
    return <NewDeliveryForm user={user} deliveries={deliveries} persistDeliveries={persistDeliveries}
      persistNotifications={persistNotifications} notifications={notifications}
      onDone={(id) => { setView("deliveries"); openDetail(id); showToast("Delivery request created"); }} />;
  }

  if (view === "history") {
    const done = mine.filter(d => ["Delivered", "Failed"].includes(d.status));
    const filtered = filterDeliveries(done, { query, status, riderFilter: "" });
    return (
      <div>
        <div className="rfx-display font-semibold text-[15px] mb-3">Delivery history</div>
        <SearchFilterBar query={query} setQuery={setQuery} status={status} setStatus={setStatus} showRiderFilter={false} />
        <DeliveriesTable deliveries={filtered} onOpen={openDetail} />
      </div>
    );
  }

  if (view === "notifications") {
    return <NotificationsView user={user} notifications={notifications} persistNotifications={persistNotifications} openDetail={openDetail} deliveries={deliveries} />;
  }

  return null;
}

function NewDeliveryForm({ user, deliveries, persistDeliveries, persistNotifications, notifications, onDone }) {
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", delivery_address: "", item_description: "",
    order_number: "", cod_amount: "", notes: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function validate() {
    const e = {};
    if (!form.customer_name.trim()) e.customer_name = "Customer name is required.";
    if (!form.customer_phone.trim()) e.customer_phone = "Phone number is required.";
    else if (!/^\+?254[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$/.test(form.customer_phone.replace(/\s+/g, " ").trim()) && !/^0\d{9}$/.test(form.customer_phone.trim()))
      e.customer_phone = "Use a Kenyan number, e.g. +254 712 345 678.";
    if (!form.delivery_address.trim()) e.delivery_address = "Delivery address is required.";
    if (!form.item_description.trim()) e.item_description = "Describe the item or order.";
    if (form.cod_amount && isNaN(Number(form.cod_amount))) e.cod_amount = "COD amount must be a number.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const seq = deliveries.length + 1;
    const id = `d-${Date.now()}`;
    const record = {
      id, delivery_number: genDeliveryNumber(seq), retailer_id: user.id, retailer_name: user.org,
      customer_name: form.customer_name.trim(), customer_phone: form.customer_phone.trim(),
      delivery_address: form.delivery_address.trim(), item_description: form.item_description.trim(),
      order_number: form.order_number.trim(), cod_amount: form.cod_amount ? Number(form.cod_amount) : "",
      notes: form.notes.trim(), status: "Pending", rider_id: null, rider_name: null, rider_phone: null,
      created_at: nowISO(), updated_at: nowISO(), delivered_at: null, scanned: false, dispatcher_note: null,
      status_history: [{ previous_status: null, new_status: "Pending", changed_by: user.name, timestamp: Date.now() }],
      proof: { otp: genOTP(), otp_verified: false, recipient_name: "", photo_url: "", latitude: null, longitude: null, confirmed_at: null },
    };
    await persistDeliveries([record, ...deliveries]);
    await persistNotifications([{
      id: `n-${Date.now()}`, created_at: nowISO(), read_by: [], retailer_id: user.id, rider_id: null,
      delivery_id: id, delivery_number: record.delivery_number, message: `Delivery ${record.delivery_number} was created and is awaiting assignment.`,
    }, ...notifications]);
    setSubmitting(false);
    onDone(id);
  }

  return (
    <div className="max-w-2xl">
      <div className="rfx-display font-semibold text-[16px] mb-1">New delivery request</div>
      <p className="text-sm mb-5" style={{ color: "var(--slate)" }}>Fill in customer and order details. A dispatcher will assign a rider shortly after.</p>
      <form onSubmit={submit} className="rfx-card p-5 flex flex-col gap-4">
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--slate)" }}>Customer</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="rfx-label">Customer name *</label>
            <input className="rfx-input" value={form.customer_name} onChange={e => set("customer_name", e.target.value)} placeholder="e.g. John Kamau" />
            {errors.customer_name && <div className="text-xs mt-1" style={{ color: "var(--alert)" }}>{errors.customer_name}</div>}
          </div>
          <div>
            <label className="rfx-label">Phone number *</label>
            <input className="rfx-input" value={form.customer_phone} onChange={e => set("customer_phone", e.target.value)} placeholder="+254 712 345 678" />
            {errors.customer_phone && <div className="text-xs mt-1" style={{ color: "var(--alert)" }}>{errors.customer_phone}</div>}
          </div>
        </div>
        <div>
          <label className="rfx-label">Delivery address *</label>
          <input className="rfx-input" value={form.delivery_address} onChange={e => set("delivery_address", e.target.value)} placeholder="e.g. Kasarani, Nairobi — near Sunton stage" />
          {errors.delivery_address && <div className="text-xs mt-1" style={{ color: "var(--alert)" }}>{errors.delivery_address}</div>}
        </div>

        <div className="text-xs font-bold uppercase tracking-wide mt-1" style={{ color: "var(--slate)" }}>Order</div>
        <div>
          <label className="rfx-label">Item / order description *</label>
          <textarea className="rfx-input" rows={2} value={form.item_description} onChange={e => set("item_description", e.target.value)} placeholder="e.g. Bluetooth speaker, JBL Go 3" />
          {errors.item_description && <div className="text-xs mt-1" style={{ color: "var(--alert)" }}>{errors.item_description}</div>}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="rfx-label">Order / reference number (optional)</label>
            <input className="rfx-input" value={form.order_number} onChange={e => set("order_number", e.target.value)} placeholder="ORD-8841" />
          </div>
          <div>
            <label className="rfx-label">COD amount — KES (optional)</label>
            <input className="rfx-input" value={form.cod_amount} onChange={e => set("cod_amount", e.target.value)} placeholder="3500" />
            {errors.cod_amount && <div className="text-xs mt-1" style={{ color: "var(--alert)" }}>{errors.cod_amount}</div>}
          </div>
        </div>
        <div>
          <label className="rfx-label">Delivery notes (optional)</label>
          <textarea className="rfx-input" rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Gate code, landmark, preferred time…" />
        </div>

        <button type="submit" disabled={submitting} className="rfx-btn-primary rounded-lg py-2.5 text-sm mt-2 flex items-center justify-center gap-2">
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Submit delivery request
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------ Dispatcher ------------------------------------ */

function DispatcherViews({ view, setView, user, deliveries, riders, notifications, persistDeliveries, persistRiders, persistNotifications, pushNotification, openDetail, showToast }) {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [riderFilter, setRiderFilter] = useState("");
  const [assignFor, setAssignFor] = useState(null);

  function activeDeliveryCount(riderId) { return deliveries.filter(d => d.rider_id === riderId && !["Delivered", "Failed"].includes(d.status)).length; }

  async function assignRider(delivery, rider) {
    const now = Date.now();
    const next = deliveries.map(d => d.id !== delivery.id ? d : {
      ...d, status: "Assigned", rider_id: rider.id, rider_name: rider.name, rider_phone: rider.phone, updated_at: nowISO(),
      status_history: [...d.status_history, { previous_status: d.status, new_status: "Assigned", changed_by: user.name, timestamp: now }],
    });
    await persistDeliveries(next);
    await persistNotifications([
      { id: `n-${now}-a`, created_at: nowISO(), read_by: [], retailer_id: delivery.retailer_id, rider_id: null, delivery_id: delivery.id, delivery_number: delivery.delivery_number, message: `Delivery ${delivery.delivery_number} has been assigned to ${rider.name}.` },
      { id: `n-${now}-b`, created_at: nowISO(), read_by: [], retailer_id: null, rider_id: rider.id, delivery_id: delivery.id, delivery_number: delivery.delivery_number, message: `You've been assigned delivery ${delivery.delivery_number} — ${delivery.customer_name}, ${delivery.delivery_address}.` },
      ...notifications,
    ]);
    setAssignFor(null);
    showToast(`Assigned ${delivery.delivery_number} to ${rider.name}`);
  }

  if (view === "dashboard") {
    const needsAttention = deliveries.filter(d => d.status === "Pending");
    return (
      <div>
        <SummaryCards deliveries={deliveries} />
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="rfx-display font-semibold text-[15px] flex items-center gap-2">
                Needs assignment
                {needsAttention.length > 0 && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>{needsAttention.length}</span>}
              </div>
              <button onClick={() => setView("needs")} className="text-[12.5px] font-semibold" style={{ color: "var(--signal)" }}>View all</button>
            </div>
            {needsAttention.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing waiting" sub="Every delivery has been assigned to a rider." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {needsAttention.slice(0, 4).map(d => (
                  <PendingRow key={d.id} d={d} onAssign={() => setAssignFor(d)} onOpen={() => openDetail(d.id)} />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="rfx-display font-semibold text-[15px] mb-3">Riders</div>
            <div className="flex flex-col gap-2">
              {riders.map(r => <RiderCard key={r.id} r={r} active={activeDeliveryCount(r.id)} />)}
            </div>
          </div>
        </div>
        {assignFor && <AssignRiderModal delivery={assignFor} riders={riders} activeDeliveryCount={activeDeliveryCount} onAssign={assignRider} onClose={() => setAssignFor(null)} />}
      </div>
    );
  }

  if (view === "needs") {
    const list = deliveries.filter(d => d.status === "Pending");
    return (
      <div>
        <div className="rfx-display font-semibold text-[15px] mb-3">Needs assignment ({list.length})</div>
        {list.length === 0 ? <EmptyState icon={CheckCircle2} title="All caught up" sub="No pending deliveries right now." /> : (
          <div className="flex flex-col gap-2.5">
            {list.map(d => <PendingRow key={d.id} d={d} onAssign={() => setAssignFor(d)} onOpen={() => openDetail(d.id)} />)}
          </div>
        )}
        {assignFor && <AssignRiderModal delivery={assignFor} riders={riders} activeDeliveryCount={activeDeliveryCount} onAssign={assignRider} onClose={() => setAssignFor(null)} />}
      </div>
    );
  }

  if (view === "all") {
    const filtered = filterDeliveries(deliveries, { query, status, riderFilter });
    return (
      <div>
        <div className="rfx-display font-semibold text-[15px] mb-3">All deliveries ({deliveries.length})</div>
        <SearchFilterBar query={query} setQuery={setQuery} status={status} setStatus={setStatus} riderFilter={riderFilter} setRiderFilter={setRiderFilter} riders={riders} showRiderFilter />
        <DeliveriesTable deliveries={filtered} onOpen={openDetail} showRetailer />
      </div>
    );
  }

  if (view === "riders") {
    return (
      <div>
        <div className="rfx-display font-semibold text-[15px] mb-3">Riders</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {riders.map(r => <RiderCard key={r.id} r={r} active={activeDeliveryCount(r.id)} detailed />)}
        </div>
      </div>
    );
  }

  if (view === "history") {
    const done = deliveries.filter(d => ["Delivered", "Failed"].includes(d.status));
    const filtered = filterDeliveries(done, { query, status, riderFilter });
    return (
      <div>
        <div className="rfx-display font-semibold text-[15px] mb-3">Delivery history</div>
        <SearchFilterBar query={query} setQuery={setQuery} status={status} setStatus={setStatus} riderFilter={riderFilter} setRiderFilter={setRiderFilter} riders={riders} showRiderFilter />
        <DeliveriesTable deliveries={filtered} onOpen={openDetail} showRetailer />
      </div>
    );
  }

  if (view === "notifications") {
    return <NotificationsView user={user} notifications={notifications} persistNotifications={persistNotifications} openDetail={openDetail} deliveries={deliveries} />;
  }

  return null;
}

function PendingRow({ d, onAssign, onOpen }) {
  return (
    <div className="rfx-card p-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rfx-mono font-semibold text-[13px]">{d.delivery_number}</span>
          <StatusBadge status={d.status} size="sm" />
        </div>
        <div className="text-[13.5px] font-medium mt-1">{d.customer_name} · {d.item_description}</div>
        <div className="text-[12px] flex items-center gap-1 mt-0.5" style={{ color: "var(--slate)" }}><MapPin size={11} />{d.delivery_address} · created {fmtTime(d.created_at)}</div>
      </div>
      <button onClick={onAssign} className="rfx-btn-primary rounded-lg px-3 py-2 text-[12.5px] flex-shrink-0">Assign Rider</button>
    </div>
  );
}

function RiderCard({ r, active, detailed }) {
  const avail = { available: { l: "Available", c: "var(--route)" }, busy: { l: "Busy", c: "var(--amber)" }, off_duty: { l: "Off duty", c: "var(--slate-soft)" } }[r.availability];
  return (
    <div className="rfx-card p-3.5 flex items-center gap-3">
      <Avatar name={r.name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold truncate">{r.name}</div>
        <div className="text-[12px] flex items-center gap-1" style={{ color: "var(--slate)" }}><Phone size={10} />{r.phone}</div>
        {detailed && <div className="text-[11.5px] mt-0.5" style={{ color: "var(--slate)" }}>{active} active {active === 1 ? "delivery" : "deliveries"}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="rfx-dot" style={{ background: avail.c }} />
        <span className="text-[11.5px] font-semibold" style={{ color: avail.c }}>{avail.l}</span>
      </div>
    </div>
  );
}

function AssignRiderModal({ delivery, riders, activeDeliveryCount, onAssign, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(18,24,31,0.45)" }}>
      <div className="rfx-card rfx-fade-in w-full sm:max-w-md p-5 max-h-[85vh] overflow-y-auto rfx-scroll" style={{ borderRadius: "16px 16px 0 0" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="rfx-display font-semibold text-[15px]">Assign rider</div>
          <button onClick={onClose}><X size={17} color="var(--slate)" /></button>
        </div>
        <div className="text-[13px] mb-4" style={{ color: "var(--slate)" }}>
          <span className="rfx-mono font-semibold">{delivery.delivery_number}</span> · {delivery.customer_name} · {delivery.delivery_address}
        </div>
        <div className="flex flex-col gap-2">
          {riders.map(r => (
            <button key={r.id} disabled={r.availability === "off_duty"} onClick={() => onAssign(delivery, r)}
              className="rfx-card flex items-center gap-3 p-3 text-left disabled:opacity-40 hover:shadow-sm">
              <Avatar name={r.name} size={34} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold">{r.name}</div>
                <div className="text-[12px]" style={{ color: "var(--slate)" }}>{r.phone} · {activeDeliveryCount(r.id)} active</div>
              </div>
              <span className="text-[11px] font-semibold" style={{ color: r.availability === "available" ? "var(--route)" : r.availability === "busy" ? "var(--amber)" : "var(--slate-soft)" }}>
                {r.availability === "available" ? "Available" : r.availability === "busy" ? "Busy" : "Off duty"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------ Notifications ------------------------------------ */

function NotificationsView({ user, notifications, persistNotifications, openDetail, deliveries }) {
  const mine = notifications.filter(n => notifVisible(n, user));
  function markAllRead() {
    const next = notifications.map(n => notifVisible(n, user) && !n.read_by.includes(user.id) ? { ...n, read_by: [...n.read_by, user.id] } : n);
    persistNotifications(next);
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="rfx-display font-semibold text-[15px]">Notifications</div>
        {mine.length > 0 && <button onClick={markAllRead} className="text-[12.5px] font-semibold" style={{ color: "var(--signal)" }}>Mark all read</button>}
      </div>
      {mine.length === 0 ? <EmptyState icon={Bell} title="No notifications yet" sub="You'll see delivery updates here." /> : (
        <div className="flex flex-col gap-2">
          {mine.map(n => {
            const read = n.read_by.includes(user.id);
            const del = deliveries.find(d => d.id === n.delivery_id);
            return (
              <button key={n.id} onClick={() => del && openDetail(del.id)} className="rfx-card p-3.5 text-left flex items-start gap-3" style={{ opacity: read ? 0.65 : 1 }}>
                <div className="mt-0.5"><MessageSquareText size={15} color={read ? "var(--slate-soft)" : "var(--signal)"} /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px]">{n.message}</div>
                  <div className="text-[11.5px] mt-1" style={{ color: "var(--slate-soft)" }}>{fmtTime(n.created_at)}</div>
                </div>
                {!read && <span className="rfx-dot mt-1.5" style={{ background: "var(--signal)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------ Delivery detail (shared) ------------------------------------ */

const TIMELINE_STAGES = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered"];
const STAGE_LABEL = { Pending: "Request Created", Assigned: "Assigned to Rider", "Picked Up": "Picked Up", "In Transit": "In Transit", Delivered: "Delivered" };

function DeliveryDetail({ id, role, user, deliveries, riders, persistDeliveries, pushNotification, onBack, showToast, riderActions }) {
  const delivery = deliveries.find(d => d.id === id);
  if (!delivery) return <EmptyState icon={AlertCircle} title="Delivery not found" sub="It may have been removed." />;

  const historyByStage = {};
  delivery.status_history.forEach(h => { historyByStage[h.new_status] = h; });

  return (
    <div className="max-w-3xl rfx-fade-in">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-semibold mb-4" style={{ color: "var(--slate)" }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rfx-display font-bold text-[19px] rfx-mono">{delivery.delivery_number}</span>
            <StatusBadge status={delivery.status} />
          </div>
          <div className="text-[13px] mt-1" style={{ color: "var(--slate)" }}>Created {fmtTime(delivery.created_at)} · Last updated {fmtTime(delivery.updated_at)}</div>
        </div>
        {role !== "rider" && <QRLabel code={delivery.delivery_number} size={84} />}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Customer</div>
          <div className="flex items-center gap-2 text-[13.5px] mb-1.5"><UserIcon size={14} color="var(--slate)" />{delivery.customer_name}</div>
          <div className="flex items-center gap-2 text-[13.5px] mb-1.5"><Phone size={14} color="var(--slate)" />{delivery.customer_phone}</div>
          <div className="flex items-center gap-2 text-[13.5px]"><MapPin size={14} color="var(--slate)" />{delivery.delivery_address}</div>
        </div>
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Order</div>
          <div className="text-[13.5px] mb-1.5">{delivery.item_description}</div>
          {delivery.order_number && <div className="text-[12.5px]" style={{ color: "var(--slate)" }}>Order ref: {delivery.order_number}</div>}
          {delivery.cod_amount !== "" && <div className="text-[12.5px]" style={{ color: "var(--slate)" }}>COD: {fmtKES(delivery.cod_amount)}</div>}
          {delivery.notes && <div className="text-[12.5px] mt-2 rounded-lg p-2" style={{ background: "var(--paper)" }}>{delivery.notes}</div>}
        </div>
      </div>

      {(role === "dispatcher" || role === "retailer") && (
        <div className="rfx-card p-4 mb-5">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Rider</div>
          {delivery.rider_name ? (
            <div className="flex items-center gap-3">
              <Avatar name={delivery.rider_name} size={34} />
              <div><div className="text-[13.5px] font-semibold">{delivery.rider_name}</div><div className="text-[12px]" style={{ color: "var(--slate)" }}>{delivery.rider_phone}</div></div>
            </div>
          ) : <div className="text-[13px]" style={{ color: "var(--slate-soft)" }}>Not yet assigned.</div>}
        </div>
      )}

      <div className="rfx-card p-4 mb-5">
        <div className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: "var(--slate)" }}>Tracking timeline</div>
        <div className="flex flex-col">
          {TIMELINE_STAGES.map((stage, i) => {
            const h = historyByStage[stage];
            const done = !!h;
            const failed = delivery.status === "Failed" && !done && i === TIMELINE_STAGES.indexOf(delivery.status_history[delivery.status_history.length - 1]?.new_status) + 1;
            return (
              <div key={stage} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: done ? "var(--route)" : "var(--paper)", border: done ? "none" : "2px solid var(--line)" }}>
                    {done && <CheckCircle2 size={13} color="#fff" />}
                  </div>
                  {i < TIMELINE_STAGES.length - 1 && <div className="w-px flex-1 min-h-[26px]" style={{ background: done ? "var(--route)" : "var(--line)" }} />}
                </div>
                <div className="pb-5">
                  <div className="text-[13.5px] font-semibold" style={{ color: done ? "var(--ink)" : "var(--slate-soft)" }}>{STAGE_LABEL[stage]}</div>
                  {done ? <div className="text-[12px]" style={{ color: "var(--slate)" }}>{fmtTime(h.timestamp)} · {h.changed_by}</div> : <div className="text-[12px]" style={{ color: "var(--slate-soft)" }}>Pending</div>}
                </div>
              </div>
            );
          })}
          {delivery.status === "Failed" && (
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--alert)" }}><XCircle size={13} color="#fff" /></div>
              </div>
              <div>
                <div className="text-[13.5px] font-semibold" style={{ color: "var(--alert)" }}>Failed / Cancelled</div>
                <div className="text-[12px]" style={{ color: "var(--slate)" }}>{fmtTime(delivery.updated_at)}</div>
                {delivery.dispatcher_note && <div className="text-[12.5px] mt-1 rounded-lg p-2" style={{ background: "var(--alert-soft)", color: "#8A2E2E" }}>{delivery.dispatcher_note}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {(delivery.status === "Delivered" || delivery.proof?.otp_verified) && (
        <div className="rfx-card p-4 mb-5">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Proof of delivery</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-[13px]"><ShieldCheck size={15} color="var(--route)" /> OTP verified{delivery.proof.confirmed_at ? ` · ${fmtTime(delivery.proof.confirmed_at)}` : ""}</div>
            {delivery.proof.recipient_name && <div className="text-[13px]" style={{ color: "var(--slate)" }}>Received by: {delivery.proof.recipient_name}</div>}
            {delivery.proof.latitude && <div className="text-[13px]" style={{ color: "var(--slate)" }}>GPS: {delivery.proof.latitude.toFixed(4)}, {delivery.proof.longitude.toFixed(4)}</div>}
          </div>
          {delivery.proof.photo_url && (
            <div className="mt-3">
              <img src={delivery.proof.photo_url} alt="Proof of delivery" className="rounded-lg max-h-52 object-cover border" style={{ borderColor: "var(--line)" }} />
            </div>
          )}
        </div>
      )}

      {role === "dispatcher" && !["Delivered", "Failed"].includes(delivery.status) && (
        <DispatcherOverride delivery={delivery} deliveries={deliveries} persistDeliveries={persistDeliveries} user={user} showToast={showToast} />
      )}

      {role === "rider" && riderActions && riderActions(delivery)}
    </div>
  );
}

function DispatcherOverride({ delivery, deliveries, persistDeliveries, user, showToast }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [confirmFail, setConfirmFail] = useState(false);

  async function applyOverride(newStatus) {
    const now = Date.now();
    const next = deliveries.map(d => d.id !== delivery.id ? d : {
      ...d, status: newStatus, updated_at: nowISO(),
      delivered_at: newStatus === "Delivered" ? nowISO() : d.delivered_at,
      status_history: [...d.status_history, { previous_status: d.status, new_status: newStatus, changed_by: `${user.name} (override)`, timestamp: now }],
    });
    await persistDeliveries(next);
    showToast(`Status overridden to ${newStatus}`);
    setOpen(false); setTarget(""); setConfirmFail(false);
  }

  return (
    <div className="rfx-card p-4">
      <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Dispatcher controls</div>
      <div className="flex flex-wrap gap-2">
        {!open ? (
          <button onClick={() => setOpen(true)} className="text-[12.5px] font-semibold px-3 py-2 rounded-lg" style={{ border: "1px solid var(--line)" }}>Override status</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select className="rfx-input w-auto" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">Select status…</option>
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button disabled={!target} onClick={() => applyOverride(target)} className="rfx-btn-primary rounded-lg px-3 py-2 text-[12.5px] disabled:opacity-50">Apply</button>
            <button onClick={() => setOpen(false)} className="text-[12.5px]" style={{ color: "var(--slate)" }}>Cancel</button>
          </div>
        )}
        <button onClick={() => setConfirmFail(true)} className="text-[12.5px] font-semibold px-3 py-2 rounded-lg" style={{ color: "var(--alert)", border: "1px solid var(--alert-soft)" }}>Mark as Failed / Cancelled</button>
      </div>
      <ConfirmDialog open={confirmFail} title="Mark delivery as failed?" body="This will end the delivery workflow. This can't be automatically resumed." confirmLabel="Mark Failed" tone="danger"
        onCancel={() => setConfirmFail(false)} onConfirm={() => applyOverride("Failed")} />
    </div>
  );
}

/* ------------------------------------ Rider (mobile-first shell) ------------------------------------ */

function RiderShell(props) {
  const { user, onLogout, deliveries, notifications, online, setOnline, pendingCount,
    persistDeliveries, pushNotification, persistNotifications, showToast,
    view, setView, detailId, openDetail, closeDetail } = props;

  const mine = deliveries.filter(d => d.rider_id === user.id);
  const today = mine.filter(d => !["Delivered", "Failed"].includes(d.status));
  const history = mine.filter(d => ["Delivered", "Failed"].includes(d.status));
  const myUnread = notifications.filter(n => notifVisible(n, user) && !n.read_by.includes(user.id)).length;

  const nav = NAV.rider;

  return (
    <div className="min-h-[640px] flex flex-col" style={{ maxWidth: 480, margin: "0 auto", background: "var(--paper)" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
        <div className="flex items-center gap-2">
          {detailId ? (
            <button onClick={closeDetail}><ArrowLeft size={19} /></button>
          ) : (
            <>
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "var(--signal)" }}><Truck size={14} color="#fff" /></div>
              <span className="rfx-display font-bold text-[14px]">REFLEX</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOnline(o => !o)} title="Toggle to simulate connectivity loss"
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
            style={{ background: online ? "var(--route-soft)" : "var(--alert-soft)", color: online ? "var(--route)" : "var(--alert)" }}>
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}{online ? "Online" : "Offline"}
          </button>
          <button onClick={onLogout}><LogOut size={16} color="var(--slate)" /></button>
        </div>
      </div>

      {!online && (
        <div className="px-4 py-2 text-[12px] font-medium flex items-center gap-2" style={{ background: "var(--alert-soft)", color: "var(--alert)" }}>
          <WifiOff size={13} /> Offline — changes will sync when connected{pendingCount ? ` (${pendingCount} queued)` : ""}.
        </div>
      )}

      <div className="flex-1 overflow-y-auto rfx-scroll p-4">
        {detailId ? (
          <RiderDeliveryDetail id={detailId} user={user} deliveries={deliveries} persistDeliveries={persistDeliveries}
            pushNotification={pushNotification} notifications={notifications} persistNotifications={persistNotifications}
            onBack={closeDetail} showToast={showToast} online={online} />
        ) : view === "today" ? (
          <RiderToday user={user} today={today} openDetail={openDetail} />
        ) : view === "history" ? (
          <RiderHistory history={history} openDetail={openDetail} />
        ) : (
          <NotificationsView user={user} notifications={notifications} persistNotifications={persistNotifications} openDetail={openDetail} deliveries={deliveries} />
        )}
      </div>

      {!detailId && (
        <div className="flex items-stretch border-t" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          {nav.map(item => {
            const active = view === item.key;
            return (
              <button key={item.key} onClick={() => setView(item.key)} className="flex-1 flex flex-col items-center gap-1 py-2.5 relative"
                style={{ color: active ? "var(--signal)" : "var(--slate-soft)" }}>
                <item.icon size={19} />
                <span className="text-[10.5px] font-semibold">{item.label}</span>
                {item.key === "notifications" && myUnread > 0 && <span className="absolute top-1.5 right-[28%] w-2 h-2 rounded-full" style={{ background: "var(--signal)" }} />}
              </button>
            );
          })}
        </div>
      )}
      <Toast toast={null} />
    </div>
  );
}

function RiderToday({ user, today, openDetail }) {
  return (
    <div>
      <div className="mb-4">
        <div className="rfx-display font-semibold text-[17px]">Habari, {user.name.split(" ")[0]} 👋</div>
        <div className="text-[13px]" style={{ color: "var(--slate)" }}>{today.length} {today.length === 1 ? "delivery" : "deliveries"} on your list today</div>
      </div>
      {today.length === 0 ? (
        <EmptyState icon={Bike} title="No active deliveries" sub="New assignments will appear here instantly." />
      ) : (
        <div className="flex flex-col gap-3">
          {today.map(d => <RiderDeliveryCard key={d.id} d={d} onOpen={() => openDetail(d.id)} />)}
        </div>
      )}
    </div>
  );
}

function RiderDeliveryCard({ d, onOpen }) {
  const nextAction = {
    Assigned: "Scan to pick up", "Picked Up": "Start transit", "In Transit": "Confirm delivery",
  }[d.status];
  return (
    <button onClick={onOpen} className="rfx-card p-4 text-left w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="rfx-mono font-bold text-[13px]">{d.delivery_number}</span>
        <StatusBadge status={d.status} size="sm" />
      </div>
      <div className="text-[14.5px] font-semibold">{d.customer_name}</div>
      <div className="text-[13px] flex items-center gap-1 mt-0.5" style={{ color: "var(--slate)" }}><MapPin size={12} />{d.delivery_address}</div>
      <div className="text-[13px] mt-1" style={{ color: "var(--slate)" }}>{d.item_description}</div>
      {nextAction && (
        <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--paper)" }}>
          <span className="text-[12.5px] font-semibold">{nextAction}</span>
          <ChevronRight size={15} color="var(--signal)" />
        </div>
      )}
    </button>
  );
}

function RiderHistory({ history, openDetail }) {
  return (
    <div>
      <div className="rfx-display font-semibold text-[15px] mb-3">Delivery history</div>
      {history.length === 0 ? <EmptyState icon={HistoryIcon} title="No completed deliveries yet" /> : (
        <div className="flex flex-col gap-2.5">
          {[...history].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).map(d => (
            <button key={d.id} onClick={() => openDetail(d.id)} className="rfx-card p-3.5 text-left w-full flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2"><span className="rfx-mono font-semibold text-[12.5px]">{d.delivery_number}</span><StatusBadge status={d.status} size="sm" /></div>
                <div className="text-[13px] mt-1">{d.customer_name}</div>
                <div className="text-[11.5px]" style={{ color: "var(--slate-soft)" }}>{fmtTime(d.updated_at)}</div>
              </div>
              <ChevronRight size={15} color="var(--slate-soft)" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Rider delivery detail + actions --------------------------- */

function RiderDeliveryDetail({ id, user, deliveries, persistDeliveries, pushNotification, notifications, persistNotifications, onBack, showToast, online }) {
  const delivery = deliveries.find(d => d.id === id);
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transitConfirm, setTransitConfirm] = useState(false);

  if (!delivery) return <EmptyState icon={AlertCircle} title="Delivery not found" />;

  async function updateStatus(newStatus, extra = {}) {
    const now = Date.now();
    const next = deliveries.map(d => d.id !== delivery.id ? d : {
      ...d, status: newStatus, updated_at: nowISO(), ...extra,
      delivered_at: newStatus === "Delivered" ? nowISO() : d.delivered_at,
      status_history: [...d.status_history, { previous_status: d.status, new_status: newStatus, changed_by: user.name, timestamp: now }],
    });
    await persistDeliveries(next);
    const msgMap = { "Picked Up": "has been picked up.", "In Transit": "is now in transit.", Delivered: "was successfully delivered." };
    if (msgMap[newStatus]) {
      await persistNotifications([
        { id: `n-${now}-r`, created_at: nowISO(), read_by: [], retailer_id: delivery.retailer_id, rider_id: null, delivery_id: delivery.id, delivery_number: delivery.delivery_number, message: `Delivery ${delivery.delivery_number} ${msgMap[newStatus]}` },
        { id: `n-${now}-d`, created_at: nowISO(), read_by: [], retailer_id: null, rider_id: null, delivery_id: delivery.id, delivery_number: delivery.delivery_number, message: `Delivery ${delivery.delivery_number} ${msgMap[newStatus]}` },
        ...notifications,
      ]);
    }
    showToast(`Status updated to ${newStatus}`);
  }

  function actions() {
    if (delivery.status === "Assigned") {
      return (
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Next step</div>
          <p className="text-[13px] mb-3" style={{ color: "var(--slate)" }}>Scan the order label to confirm you're picking up the right package.</p>
          <button onClick={() => setScanOpen(true)} className="rfx-btn-primary rounded-lg py-3 w-full flex items-center justify-center gap-2 text-[14px]">
            <ScanLine size={17} /> Scan Order
          </button>
        </div>
      );
    }
    if (delivery.status === "Picked Up") {
      return (
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Next step</div>
          <button onClick={() => setTransitConfirm(true)} className="rfx-btn-primary rounded-lg py-3 w-full flex items-center justify-center gap-2 text-[14px]">
            <Truck size={17} /> Start Transit
          </button>
        </div>
      );
    }
    if (delivery.status === "In Transit") {
      return (
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--slate)" }}>Next step</div>
          <p className="text-[13px] mb-3" style={{ color: "var(--slate)" }}>Confirm delivery with the customer's OTP and a photo of the handover.</p>
          <button onClick={() => setConfirmOpen(true)} className="rfx-btn-primary rounded-lg py-3 w-full flex items-center justify-center gap-2 text-[14px]">
            <CheckCircle2 size={17} /> Confirm Delivery
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="rfx-fade-in">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="rfx-mono font-bold text-[15px]">{delivery.delivery_number}</span>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="rfx-card p-4 mb-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold mb-1.5"><UserIcon size={15} color="var(--slate)" />{delivery.customer_name}</div>
        <a href={`tel:${delivery.customer_phone.replace(/\s+/g, "")}`} className="flex items-center gap-2 text-[14px] mb-1.5" style={{ color: "var(--signal)" }}><Phone size={15} />{delivery.customer_phone}</a>
        <div className="flex items-center gap-2 text-[13.5px] mb-1.5" style={{ color: "var(--slate)" }}><MapPin size={15} />{delivery.delivery_address}</div>
        <div className="text-[13.5px] mt-2 pt-2 border-t" style={{ borderColor: "var(--line)" }}>{delivery.item_description}</div>
        {delivery.cod_amount !== "" && <div className="text-[13px] mt-1" style={{ color: "var(--slate)" }}>Collect: {fmtKES(delivery.cod_amount)}</div>}
        {delivery.notes && <div className="text-[12.5px] mt-2 rounded-lg p-2" style={{ background: "var(--paper)" }}>{delivery.notes}</div>}
      </div>

      <div className="mb-3">{actions()}</div>

      {delivery.status === "Delivered" && (
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--route)" }}>Delivered</div>
          <div className="text-[13px]" style={{ color: "var(--slate)" }}>Confirmed {fmtTime(delivery.proof.confirmed_at)}</div>
        </div>
      )}
      {delivery.status === "Failed" && (
        <div className="rfx-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--alert)" }}>Marked failed / cancelled</div>
        </div>
      )}

      {scanOpen && (
        <ScanOrderModal delivery={delivery} user={user} onClose={() => setScanOpen(false)}
          onSuccess={async () => {
            const now = Date.now();
            const next = deliveries.map(d => d.id !== delivery.id ? d : {
              ...d, scanned: true, status: "Picked Up", updated_at: nowISO(),
              status_history: [...d.status_history, { previous_status: d.status, new_status: "Picked Up", changed_by: user.name, timestamp: now }],
            });
            await persistDeliveries(next);
            setScanOpen(false);
            showToast("Order verified — marked as Picked Up");
          }} />
      )}

      <ConfirmDialog open={transitConfirm} title="Start transit?" body="This marks the package as on the way to the customer." confirmLabel="Start Transit"
        onCancel={() => setTransitConfirm(false)} onConfirm={() => { updateStatus("In Transit"); setTransitConfirm(false); }} />

      {confirmOpen && (
        <ConfirmDeliveryModal delivery={delivery} onClose={() => setConfirmOpen(false)}
          onConfirmed={async ({ recipient_name, photo_url, latitude, longitude }) => {
            await updateStatus("Delivered", {
              proof: { ...delivery.proof, otp_verified: true, recipient_name, photo_url, latitude, longitude, confirmed_at: nowISO() },
            });
            setConfirmOpen(false);
          }} />
      )}
    </div>
  );
}

function ScanOrderModal({ delivery, user, onClose, onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  function verify() {
    setChecking(true);
    setError("");
    setTimeout(() => {
      const entered = code.trim().toUpperCase();
      if (!entered) { setError("Enter or scan the delivery code."); setChecking(false); return; }
      if (entered !== delivery.delivery_number) {
        setError(entered.startsWith("RFX-") ? "This order is not assigned to you." : "Order not found. Check the code and try again.");
        setChecking(false);
        return;
      }
      setChecking(false);
      onSuccess();
    }, 450);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(18,24,31,0.5)" }}>
      <div className="rfx-card rfx-fade-in w-full sm:max-w-sm p-5" style={{ borderRadius: "16px 16px 0 0" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="rfx-display font-semibold text-[15px]">Scan order</div>
          <button onClick={onClose}><X size={17} color="var(--slate)" /></button>
        </div>
        <div className="flex flex-col items-center py-3">
          <div className="w-40 h-40 rounded-2xl flex items-center justify-center mb-3" style={{ border: "2px dashed var(--line)" }}>
            <ScanLine size={40} color="var(--slate-soft)" />
          </div>
          <div className="text-[12.5px] text-center mb-3" style={{ color: "var(--slate)" }}>Camera scanning isn't available in this preview — enter the code from the package label instead.</div>
        </div>
        <label className="rfx-label">Delivery code</label>
        <input className="rfx-input rfx-mono uppercase" placeholder="RFX-2026-0000" value={code} onChange={e => setCode(e.target.value)} />
        {error && <div className="text-[12.5px] mt-2 flex items-center gap-1.5" style={{ color: "var(--alert)" }}><AlertCircle size={13} />{error}</div>}
        <div className="flex gap-2 mt-4">
          <button onClick={() => setCode(delivery.delivery_number)} className="flex-1 py-2.5 rounded-lg text-[12.5px] font-semibold" style={{ border: "1px solid var(--line)" }}>Autofill (demo)</button>
          <button onClick={verify} disabled={checking} className="flex-1 py-2.5 rounded-lg text-[13px] rfx-btn-primary flex items-center justify-center gap-2">
            {checking ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} Verify
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeliveryModal({ delivery, onClose, onConfirmed }) {
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [photo, setPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  function verifyOtp() {
    if (otp.trim() === delivery.proof.otp) { setOtpVerified(true); setOtpError(""); }
    else setOtpError("Invalid OTP. Try again.");
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Please upload an image file."); return; }
    setPhotoError("");
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const scale = Math.min(1, 480 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target.result;
    };
    reader.onerror = () => setPhotoError("Failed to read photo. Try again.");
    reader.readAsDataURL(file);
  }

  function captureLocation() {
    if (!navigator.geolocation) { setLocating(false); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { timeout: 4000 }
    );
  }

  const canSubmit = otpVerified && !!photo;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    await onConfirmed({ recipient_name: recipient.trim(), photo_url: photo, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(18,24,31,0.5)" }}>
      <div className="rfx-card rfx-fade-in w-full sm:max-w-sm p-5 max-h-[88vh] overflow-y-auto rfx-scroll" style={{ borderRadius: "16px 16px 0 0" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="rfx-display font-semibold text-[15px]">Confirm delivery</div>
          <button onClick={onClose}><X size={17} color="var(--slate)" /></button>
        </div>

        <div className="mb-4">
          <label className="rfx-label">Customer OTP</label>
          {otpVerified ? (
            <div className="flex items-center gap-2 text-[13.5px] font-semibold rounded-lg px-3 py-2.5" style={{ background: "var(--route-soft)", color: "var(--route)" }}>
              <CheckCircle2 size={15} /> OTP verified
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input className="rfx-input rfx-mono" maxLength={6} placeholder="4-digit code from customer" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} />
                <button onClick={verifyOtp} className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold flex-shrink-0" style={{ background: "var(--ink)", color: "#fff" }}>Verify</button>
              </div>
              {otpError && <div className="text-[12.5px] mt-1.5" style={{ color: "var(--alert)" }}>{otpError}</div>}
              <div className="text-[11.5px] mt-1.5" style={{ color: "var(--slate-soft)" }}>Simulated SMS sent to {delivery.customer_phone}: your Reflex code is {delivery.proof.otp}</div>
            </>
          )}
        </div>

        <div className="mb-4">
          <label className="rfx-label">Delivery photo *</label>
          {photo ? (
            <div className="relative">
              <img src={photo} className="rounded-lg w-full h-36 object-cover" alt="Proof" />
              <button onClick={() => setPhoto("")} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="w-full py-6 rounded-lg flex flex-col items-center gap-1.5" style={{ border: "1px dashed var(--line)" }}>
              <Camera size={20} color="var(--slate-soft)" />
              <span className="text-[12.5px] font-medium" style={{ color: "var(--slate)" }}>Take or upload photo</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
          {photoError && <div className="text-[12.5px] mt-1.5" style={{ color: "var(--alert)" }}>{photoError}</div>}
        </div>

        <div className="mb-4">
          <label className="rfx-label">Recipient name (optional)</label>
          <input className="rfx-input" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder={delivery.customer_name} />
        </div>

        <div className="mb-5">
          <button onClick={captureLocation} className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: "var(--signal)" }}>
            {locating ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
            {coords ? `Location captured (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : "Attach GPS location"}
          </button>
        </div>

        <button onClick={submit} disabled={!canSubmit || submitting} className="rfx-btn-primary rounded-lg py-3 w-full flex items-center justify-center gap-2 text-[14px]">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Mark as Delivered
        </button>
        {!canSubmit && <div className="text-[11.5px] text-center mt-2" style={{ color: "var(--slate-soft)" }}>Verify the OTP and add a photo to continue.</div>}
      </div>
    </div>
  );
}
