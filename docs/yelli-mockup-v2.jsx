import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   YELLI MOCKUP v2 — ClickHouse-inspired warm yellow + white matte
   Changes from v1:
   1. Round 3D "pressable" speed dial buttons
   2. White matte background with yellow accent
   3. Sidebar auto-collapsed, icon-only by default
   4. Adaptive button sizing (fills screen, shrinks as count grows)
   5. Auto-answer indicator on departments
   ═══════════════════════════════════════════════════════════════ */

const C = {
  // ClickHouse-inspired palette — warm yellow on white matte
  accent:       "#FACC15",   // warm yellow (primary accent)
  accentHover:  "#EAB308",   // darker yellow on hover
  accentLight:  "#FEF9C3",   // very light yellow tint
  accentGlow:   "rgba(250,204,21,0.25)",

  bg:           "#FAFAF9",   // warm off-white matte
  bgCard:       "#FFFFFF",
  bgSidebar:    "#18181B",   // zinc-900 dark sidebar
  bgDark:       "#0C0C0E",

  text:         "#18181B",   // near-black
  textSecondary:"#71717A",   // zinc-500
  textMuted:    "#A1A1AA",   // zinc-400
  textOnDark:   "#FAFAF9",
  textOnAccent: "#18181B",   // dark text on yellow

  border:       "#E4E4E7",   // zinc-200
  borderDark:   "rgba(255,255,255,0.1)",

  green:        "#22C55E",
  greenGlow:    "rgba(34,197,94,0.3)",
  red:          "#EF4444",
  amber:        "#F59E0B",
  blue:         "#3B82F6",
  gray:         "#A1A1AA",

  shadow:       "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:     "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.03)",
  shadowLg:     "0 10px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)",
  shadowButton: "0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.15)",
  shadowButtonPressed: "0 2px 4px rgba(0,0,0,0.1), inset 0 2px 4px rgba(0,0,0,0.1)",
};

const font = `"Inter", system-ui, -apple-system, sans-serif`;
const mono = `"JetBrains Mono", "Fira Code", "Courier New", monospace`;

const baseCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background: ${C.bg}; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }

  @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes ringPulse {
    0% { box-shadow: 0 0 0 0 rgba(250,204,21,0.5); }
    70% { box-shadow: 0 0 0 30px rgba(250,204,21,0); }
    100% { box-shadow: 0 0 0 0 rgba(250,204,21,0); }
  }
  @keyframes buttonPress {
    0% { transform: scale(1); }
    50% { transform: scale(0.92); }
    100% { transform: scale(1); }
  }
  @keyframes slideIn { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
  @keyframes waveform { 0%,100% { height:6px; } 50% { height:22px; } }
  @keyframes glow {
    0%,100% { box-shadow: 0 0 8px rgba(34,197,94,0.3); }
    50% { box-shadow: 0 0 20px rgba(34,197,94,0.5); }
  }
  @keyframes autoAnswerPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.3); }
    50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
  }
`;

/* ────────────────────── SIDEBAR ────────────────────── */
function Sidebar({ activePage, onNavigate, expanded, onToggle }) {
  const items = [
    { id:"speeddial", icon:"📞", label:"Speed Dial", sec:"INTERCOM" },
    { id:"meeting",   icon:"👥", label:"Meetings",   sec:"INTERCOM" },
    { id:"history",   icon:"📋", label:"Call History",sec:"INTERCOM" },
    { id:"recordings",icon:"🎬", label:"Recordings",  sec:"INTERCOM" },
    { id:"admin",     icon:"📊", label:"Dashboard",   sec:"ADMIN" },
    { id:"departments",icon:"🏢",label:"Departments", sec:"ADMIN" },
    { id:"users",     icon:"👤", label:"Users",       sec:"ADMIN" },
    { id:"billing",   icon:"💳", label:"Billing",     sec:"ADMIN" },
    { id:"superadmin",icon:"⚡", label:"Platform",    sec:"SUPER" },
  ];

  let curSec = "";
  const w = expanded ? 220 : 60;

  return (
    <div style={{
      width: w, background: C.bgSidebar, borderRight:`1px solid ${C.borderDark}`,
      display:"flex", flexDirection:"column", transition:"width 0.2s ease", flexShrink:0, overflow:"hidden", zIndex:50,
    }}>
      {/* Logo + hamburger */}
      <div onClick={onToggle} style={{
        padding: expanded ? "16px 16px" : "16px 0",
        borderBottom:`1px solid ${C.borderDark}`,
        display:"flex", alignItems:"center", justifyContent: expanded ? "flex-start" : "center",
        gap:10, cursor:"pointer", minHeight:56,
      }}>
        <div style={{
          width:32, height:32, borderRadius:8,
          background:`linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:16, fontWeight:800, color:C.text, fontFamily:font, flexShrink:0,
        }}>Y</div>
        {expanded && <span style={{ fontSize:18, fontWeight:700, color:C.textOnDark, fontFamily:font, letterSpacing:"-0.5px" }}>Yelli</span>}
      </div>

      {/* Nav items */}
      <div style={{ flex:1, padding:"8px 6px", overflowY:"auto" }}>
        {items.map(item => {
          let header = null;
          if (item.sec !== curSec && expanded) {
            curSec = item.sec;
            header = <div key={`s-${item.sec}`} style={{ fontSize:9, fontWeight:600, fontFamily:mono, color:C.textMuted, letterSpacing:"0.1em", padding:"14px 10px 4px", textTransform:"uppercase" }}>{item.sec}</div>;
          }
          const active = activePage === item.id;
          return (
            <div key={item.id}>
              {header}
              <div onClick={() => onNavigate(item.id)} style={{
                display:"flex", alignItems:"center", gap:8,
                padding: expanded ? "8px 10px" : "8px 0",
                justifyContent: expanded ? "flex-start" : "center",
                borderRadius:6, cursor:"pointer", marginBottom:1,
                background: active ? "rgba(250,204,21,0.12)" : "transparent",
                color: active ? C.accent : "rgba(255,255,255,0.55)",
                fontSize:13, fontFamily:font, fontWeight: active ? 600 : 400,
                transition:"all 0.12s",
              }}>
                <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
                {expanded && <span>{item.label}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* User avatar */}
      <div style={{
        padding: expanded ? "12px 14px" : "12px 0",
        borderTop:`1px solid ${C.borderDark}`,
        display:"flex", alignItems:"center", justifyContent: expanded ? "flex-start" : "center", gap:8,
      }}>
        <div style={{
          width:30, height:30, borderRadius:"50%",
          background:`linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:11, fontWeight:700, color:C.text, flexShrink:0,
        }}>JD</div>
        {expanded && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:C.textOnDark, fontFamily:font }}>Dr. Jane Doe</div>
            <div style={{ fontSize:9, color:C.textMuted, fontFamily:mono, textTransform:"uppercase", letterSpacing:"0.05em" }}>Admin</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── SPEED DIAL PAGE ────────────────────── */
function SpeedDialPage() {
  const [calling, setCalling] = useState(null);
  const [ringing, setRinging] = useState(false);
  const [connected, setConnected] = useState(false);

  const depts = [
    { id:1, name:"ER Nurse Station",  status:"online",  floor:"1F", users:3, autoAnswer:true },
    { id:2, name:"Radiology",         status:"online",  floor:"2F", users:1, autoAnswer:false },
    { id:3, name:"Pharmacy",          status:"in-call", floor:"1F", users:2, autoAnswer:false },
    { id:4, name:"Laboratory",        status:"online",  floor:"2F", users:2, autoAnswer:true },
    { id:5, name:"ICU",               status:"offline", floor:"3F", users:0, autoAnswer:false },
    { id:6, name:"Pediatrics",        status:"online",  floor:"3F", users:1, autoAnswer:false },
    { id:7, name:"Surgery",           status:"offline", floor:"4F", users:0, autoAnswer:false },
    { id:8, name:"Admin Office",      status:"online",  floor:"1F", users:2, autoAnswer:true },
    { id:9, name:"OB-GYN",            status:"online",  floor:"3F", users:1, autoAnswer:false },
    { id:10,name:"Cardiology",        status:"in-call", floor:"4F", users:1, autoAnswer:false },
    { id:11,name:"Reception",         status:"online",  floor:"1F", users:2, autoAnswer:true },
    { id:12,name:"Records",           status:"offline", floor:"1F", users:0, autoAnswer:false },
  ];

  const handleCall = (dept) => {
    if (dept.status === "offline") return;
    setCalling(dept);
    if (dept.autoAnswer) {
      setConnected(true);
      setTimeout(() => { setConnected(false); setCalling(null); }, 4000);
    } else {
      setRinging(true);
      setTimeout(() => { setRinging(false); setCalling(null); }, 3500);
    }
  };

  const statusColor = (s) => s === "online" ? C.green : s === "in-call" ? C.amber : C.gray;
  const statusText = (s) => s === "online" ? "Online" : s === "in-call" ? "In Call" : "Offline";

  // Adaptive grid: fewer depts = bigger buttons
  const count = depts.length;
  const cols = count <= 4 ? 2 : count <= 9 ? 3 : 4;

  return (
    <div style={{ padding:32, minHeight:"100%", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ marginBottom:28, flexShrink:0 }}>
        <div style={{ fontSize:10, fontWeight:600, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>INTERCOM BOARD</div>
        <h1 style={{ fontSize:26, fontWeight:700, color:C.text, fontFamily:font, letterSpacing:"-0.5px" }}>Speed Dial</h1>
        <p style={{ fontSize:13, color:C.textSecondary, fontFamily:font, marginTop:4 }}>Tap a department to start an instant video call</p>
      </div>

      {/* Ringing overlay */}
      {calling && ringing && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(8px)",
          zIndex:200, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20,
          animation:"fadeIn 0.2s ease",
        }}>
          <div style={{
            width:110, height:110, borderRadius:"50%",
            background:`linear-gradient(135deg, ${C.accent}, ${C.accentHover})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:44, animation:"ringPulse 1.2s infinite",
            boxShadow:`0 8px 30px rgba(250,204,21,0.3)`,
          }}>📞</div>
          <div style={{ fontSize:22, fontWeight:600, color:"white", fontFamily:font }}>Calling {calling.name}...</div>
          <div style={{ fontSize:12, fontFamily:mono, color:C.accent, animation:"pulse 1.2s infinite", letterSpacing:"0.1em" }}>RINGING</div>
          <button onClick={() => { setCalling(null); setRinging(false); }} style={{
            marginTop:12, padding:"12px 36px", borderRadius:50, border:"none",
            background:C.red, color:"white", fontSize:14, fontWeight:600,
            fontFamily:font, cursor:"pointer", boxShadow:"0 4px 12px rgba(239,68,68,0.3)",
          }}>Cancel</button>
        </div>
      )}

      {/* Auto-answer connected overlay */}
      {calling && connected && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(8px)",
          zIndex:200, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20,
          animation:"fadeIn 0.2s ease",
        }}>
          <div style={{
            width:110, height:110, borderRadius:"50%",
            background:`linear-gradient(135deg, ${C.green}, #16a34a)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:44, boxShadow:`0 8px 30px ${C.greenGlow}`,
          }}>📹</div>
          <div style={{ fontSize:22, fontWeight:600, color:"white", fontFamily:font }}>Connected to {calling.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ fontSize:12, fontFamily:mono, color:C.green, letterSpacing:"0.1em" }}>AUTO-ANSWERED</div>
            <span style={{ fontSize:10, background:"rgba(59,130,246,0.2)", color:C.blue, padding:"2px 8px", borderRadius:10, fontFamily:mono }}>INSTANT</span>
          </div>
          <button onClick={() => { setCalling(null); setConnected(false); }} style={{
            marginTop:12, padding:"12px 36px", borderRadius:50, border:"none",
            background:C.red, color:"white", fontSize:14, fontWeight:600,
            fontFamily:font, cursor:"pointer",
          }}>End Call</button>
        </div>
      )}

      {/* Department grid — adaptive sizing */}
      <div style={{
        flex:1,
        display:"grid",
        gridTemplateColumns:`repeat(${cols}, 1fr)`,
        gap: count <= 6 ? 24 : 16,
        alignContent: count <= 6 ? "center" : "start",
      }}>
        {depts.map((dept, i) => {
          const off = dept.status === "offline";
          const inCall = dept.status === "in-call";
          const btnSize = count <= 4 ? 140 : count <= 9 ? 110 : 90;

          return (
            <div
              key={dept.id}
              onClick={() => handleCall(dept)}
              style={{
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                padding: count <= 6 ? 28 : 20,
                borderRadius:16,
                background: C.bgCard,
                border:`1px solid ${off ? C.border : "transparent"}`,
                boxShadow: off ? "none" : C.shadowMd,
                cursor: off ? "not-allowed" : "pointer",
                opacity: off ? 0.45 : 1,
                transition:"all 0.2s ease",
                animation:`fadeInUp 0.4s ease ${i * 0.04}s both`,
              }}
            >
              {/* The round call button */}
              <div style={{
                width:btnSize, height:btnSize, borderRadius:"50%",
                background: off
                  ? `linear-gradient(145deg, #d4d4d8, #a1a1aa)`
                  : inCall
                    ? `linear-gradient(145deg, ${C.amber}, #d97706)`
                    : `linear-gradient(145deg, ${C.accent}, ${C.accentHover})`,
                boxShadow: off
                  ? "4px 4px 10px rgba(0,0,0,0.1), -2px -2px 6px rgba(255,255,255,0.7), inset 0 1px 0 rgba(255,255,255,0.3)"
                  : inCall
                    ? "4px 4px 12px rgba(217,119,6,0.25), -2px -2px 6px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.2)"
                    : "4px 4px 14px rgba(250,204,21,0.3), -2px -2px 8px rgba(255,255,255,0.5), inset 0 2px 0 rgba(255,255,255,0.25)",
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                transition:"all 0.15s ease",
                position:"relative",
              }}>
                {/* Phone icon */}
                <span style={{ fontSize: btnSize * 0.32, filter: off ? "grayscale(1)" : "none" }}>
                  {inCall ? "📳" : "📞"}
                </span>

                {/* Status ring glow for online */}
                {dept.status === "online" && (
                  <div style={{
                    position:"absolute", inset:-4, borderRadius:"50%",
                    border:`2px solid ${C.green}`,
                    animation:"glow 2s ease-in-out infinite",
                    pointerEvents:"none",
                  }} />
                )}

                {/* Auto-answer badge */}
                {dept.autoAnswer && !off && (
                  <div style={{
                    position:"absolute", top: -2, right: -2,
                    width:24, height:24, borderRadius:"50%",
                    background:C.blue, border:`2px solid ${C.bgCard}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:11,
                    animation:"autoAnswerPulse 2s infinite",
                  }}>⚡</div>
                )}
              </div>

              {/* Department name */}
              <div style={{
                marginTop:14, fontSize: count <= 6 ? 15 : 13, fontWeight:600,
                color:C.text, fontFamily:font, textAlign:"center", lineHeight:1.3,
              }}>{dept.name}</div>

              {/* Floor + status row */}
              <div style={{
                marginTop:6, display:"flex", alignItems:"center", gap:8,
              }}>
                <span style={{ fontSize:10, fontFamily:mono, color:C.textMuted, letterSpacing:"0.05em" }}>{dept.floor}</span>
                <span style={{ width:1, height:10, background:C.border }} />
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <div style={{
                    width:6, height:6, borderRadius:"50%",
                    background:statusColor(dept.status),
                  }} />
                  <span style={{
                    fontSize:10, fontFamily:mono, fontWeight:500,
                    color:statusColor(dept.status),
                  }}>{statusText(dept.status)}</span>
                </div>
              </div>

              {/* Auto-answer label */}
              {dept.autoAnswer && !off && (
                <div style={{
                  marginTop:6, fontSize:9, fontFamily:mono, fontWeight:600,
                  color:C.blue, letterSpacing:"0.08em",
                  background:"rgba(59,130,246,0.08)", padding:"2px 8px", borderRadius:10,
                }}>AUTO-ANSWER</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────── VIDEO CALL PAGE ────────────────────── */
function VideoCallPage() {
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const t = setInterval(() => setElapsed(p => p+1), 1000); return () => clearInterval(t); }, []);
  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const msgs = [
    { from:"Dr. Jane Doe", msg:"Can you send the latest labs?", time:"2:01 PM" },
    { from:"ER Nurse Station", msg:"Uploading now — check the file drop", time:"2:02 PM" },
    { from:"Dr. Jane Doe", msg:"Got it, thanks!", time:"2:02 PM" },
  ];

  return (
    <div style={{ display:"flex", height:"100%", background:C.bg }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", position:"relative" }}>
        {/* Remote video area — light gray simulated feed */}
        <div style={{
          flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          background:"linear-gradient(180deg, #f0f0ee 0%, #e8e8e4 100%)",
          position:"relative", borderRadius:0, margin:0,
        }}>
          {/* Remote avatar placeholder */}
          <div style={{
            width:130, height:130, borderRadius:"50%",
            background:C.bgCard,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:52, border:`3px solid ${C.border}`,
            boxShadow:C.shadowLg,
          }}>👩‍⚕️</div>

          {/* Remote label */}
          <div style={{
            position:"absolute", bottom:70, left:24,
            background:C.bgCard, backdropFilter:"blur(6px)",
            borderRadius:10, padding:"8px 16px",
            fontSize:13, fontWeight:600, color:C.text, fontFamily:font,
            display:"flex", alignItems:"center", gap:8,
            boxShadow:C.shadowMd, border:`1px solid ${C.border}`,
          }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:C.green }} />
            ER Nurse Station
            <span style={{ fontSize:9, fontFamily:mono, color:C.blue, background:"rgba(59,130,246,0.08)", padding:"2px 8px", borderRadius:8, fontWeight:600 }}>AUTO</span>
          </div>

          {/* Self PIP */}
          <div style={{
            position:"absolute", top:16, right:16,
            width:150, height:110, borderRadius:12,
            background:C.bgCard,
            border:`1px solid ${C.border}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:10, color:C.textMuted, fontFamily:mono,
            boxShadow:C.shadowMd,
          }}>{videoOff ? "CAMERA OFF" : "YOU"}</div>

          {/* Timer */}
          <div style={{
            position:"absolute", top:16, left:24,
            display:"flex", alignItems:"center", gap:8,
            background:C.bgCard, borderRadius:10, padding:"6px 14px",
            boxShadow:C.shadow, border:`1px solid ${C.border}`,
          }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:C.red, animation:"pulse 1.5s infinite" }} />
            <span style={{ fontSize:14, fontFamily:mono, color:C.text, fontWeight:600 }}>{fmt(elapsed)}</span>
          </div>

          {/* Audio waveform */}
          <div style={{ position:"absolute", bottom:70, right:24, display:"flex", alignItems:"center", gap:3,
            background:C.bgCard, borderRadius:10, padding:"8px 14px", boxShadow:C.shadow, border:`1px solid ${C.border}`,
          }}>
            {[...Array(8)].map((_,i) => (
              <div key={i} style={{ width:3, background:C.accentHover, borderRadius:2, animation:`waveform 0.7s ease ${i*0.09}s infinite` }} />
            ))}
          </div>
        </div>

        {/* Controls bar */}
        <div style={{
          padding:"14px 24px", background:C.bgCard,
          borderTop:`1px solid ${C.border}`,
          display:"flex", alignItems:"center", justifyContent:"center", gap:12,
          boxShadow:"0 -2px 8px rgba(0,0,0,0.03)",
        }}>
          {[
            { icon:muted?"🔇":"🎤", active:!muted, fn:()=>setMuted(!muted) },
            { icon:videoOff?"📷":"📹", active:!videoOff, fn:()=>setVideoOff(!videoOff) },
            { icon:"🖥️", active:false, fn:()=>{} },
            { icon:"📎", active:false, fn:()=>{} },
            { icon:"🎨", active:false, fn:()=>{} },
            { icon:"💬", active:chatOpen, fn:()=>setChatOpen(!chatOpen) },
          ].map((c,i) => (
            <button key={i} onClick={c.fn} style={{
              width:48, height:48, borderRadius:12, border:`1px solid ${c.active ? C.accentHover : C.border}`,
              background: c.active ? C.accentLight : C.bgCard,
              color: c.active ? C.accentHover : C.textSecondary,
              fontSize:19, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all 0.12s", boxShadow:C.shadow,
            }}>{c.icon}</button>
          ))}
          <button style={{
            width:64, height:48, borderRadius:12, border:"none",
            background:C.red, fontSize:19, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 4px 12px rgba(239,68,68,0.2)",
          }}>📕</button>
        </div>
      </div>

      {/* Chat sidebar */}
      {chatOpen && (
        <div style={{
          width:300, background:C.bgCard, borderLeft:`1px solid ${C.border}`,
          display:"flex", flexDirection:"column", animation:"slideIn 0.2s ease",
        }}>
          <div style={{
            padding:"14px 18px", borderBottom:`1px solid ${C.border}`,
            fontSize:13, fontWeight:600, color:C.text, fontFamily:font,
            display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <span>Chat</span>
            <span style={{ fontSize:9, fontFamily:mono, color:C.accentHover, fontWeight:600 }}>PERSISTENT</span>
          </div>
          <div style={{ flex:1, padding:14, overflowY:"auto", display:"flex", flexDirection:"column", gap:10 }}>
            {msgs.map((m,i) => (
              <div key={i} style={{ animation:`fadeInUp 0.3s ease ${i*0.08}s both` }}>
                <div style={{ fontSize:10, fontWeight:600, color:C.accentHover, fontFamily:font, marginBottom:2 }}>
                  {m.from} <span style={{ color:C.textMuted, fontFamily:mono, fontSize:9 }}>{m.time}</span>
                </div>
                <div style={{
                  fontSize:12, color:C.text, fontFamily:font,
                  background:C.bg, borderRadius:10, padding:"8px 12px",
                  border:`1px solid ${C.border}`,
                }}>{m.msg}</div>
              </div>
            ))}
          </div>
          <div style={{ padding:10, borderTop:`1px solid ${C.border}` }}>
            <input placeholder="Type a message..." style={{
              width:"100%", padding:"10px 14px", borderRadius:10, border:`1px solid ${C.border}`,
              background:C.bg, color:C.text, fontSize:12, fontFamily:font, outline:"none",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────── MEETING ROOM ────────────────────── */
function MeetingRoomPage() {
  const participants = [
    { name:"Dr. Jane Doe", role:"Host", speaking:true },
    { name:"Nurse Kim", role:"Moderator", speaking:false },
    { name:"Dr. Santos", role:"Participant", speaking:false },
    { name:"Lab Tech Maria", role:"Participant", speaking:true },
    { name:"Admin Sarah", role:"Guest", speaking:false },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:C.bg }}>
      {/* Meeting header */}
      <div style={{
        padding:"12px 24px", borderBottom:`1px solid ${C.border}`,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background:C.bgCard,
      }}>
        <div>
          <div style={{ fontSize:9, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.1em" }}>MEETING</div>
          <div style={{ fontSize:15, fontWeight:600, color:C.text, fontFamily:font }}>Weekly Department Sync</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:11, fontFamily:mono, color:C.red, display:"flex", alignItems:"center", gap:5, fontWeight:600 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:C.red, animation:"pulse 1.5s infinite" }} />REC
          </span>
          <span style={{ fontSize:11, fontFamily:mono, color:C.textMuted }}>{participants.length} participants</span>
        </div>
      </div>

      {/* Participant video grid */}
      <div style={{ flex:1, padding:16, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12 }}>
        {participants.map((p,i) => (
          <div key={i} style={{
            background: "linear-gradient(180deg, #f0f0ee 0%, #e8e8e4 100%)",
            borderRadius:12,
            border: p.speaking ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            position:"relative", minHeight:160, animation:`fadeInUp 0.4s ease ${i*0.06}s both`,
            boxShadow: p.speaking ? `0 0 20px ${C.accentGlow}` : C.shadow,
          }}>
            {/* Avatar */}
            <div style={{
              width:54, height:54, borderRadius:"50%",
              background: p.speaking ? C.accentLight : C.bgCard,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:18, marginBottom:10, border:`2px solid ${p.speaking ? C.accent : C.border}`,
              fontFamily:font, fontWeight:700, color:C.text,
              boxShadow:C.shadow,
            }}>{p.name.split(" ").map(n=>n[0]).join("").slice(0,2)}</div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, fontFamily:font }}>{p.name}</div>

            {/* Role badge */}
            <div style={{
              position:"absolute", top:10, left:10,
              fontSize:9, fontFamily:mono, fontWeight:700, color:C.accentHover,
              textTransform:"uppercase", letterSpacing:"0.05em",
              background:C.accentLight, padding:"3px 8px", borderRadius:6,
            }}>{p.role}</div>

            {/* Speaking indicator */}
            {p.speaking && (
              <div style={{ position:"absolute", bottom:10, display:"flex", gap:2, alignItems:"center" }}>
                {[...Array(5)].map((_,j) => (
                  <div key={j} style={{ width:3, background:C.accentHover, borderRadius:2, animation:`waveform 0.6s ease ${j*0.08}s infinite` }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls bar */}
      <div style={{
        padding:"14px 24px", borderTop:`1px solid ${C.border}`,
        display:"flex", justifyContent:"center", gap:10, background:C.bgCard,
        boxShadow:"0 -2px 8px rgba(0,0,0,0.03)",
      }}>
        {["🎤","📹","🖥️","📎","🎨","💬","✋"].map((ic,i) => (
          <button key={i} style={{
            width:44, height:44, borderRadius:10, border:`1px solid ${C.border}`,
            background:C.bgCard, fontSize:17, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:C.shadow,
          }}>{ic}</button>
        ))}
        <button style={{
          padding:"0 24px", height:44, borderRadius:10, border:"none",
          background:C.red, color:"white", fontSize:12, fontWeight:600,
          fontFamily:font, cursor:"pointer", boxShadow:"0 4px 12px rgba(239,68,68,0.2)",
        }}>End Meeting</button>
      </div>
    </div>
  );
}

/* ────────────────────── ADMIN DASHBOARD ────────────────────── */
function AdminDashboardPage() {
  const stats = [
    { label:"Total Calls Today", value:"47", change:"+12%", icon:"📞" },
    { label:"Minutes Used", value:"1,284", change:"+8%", icon:"⏱️" },
    { label:"Active Users", value:"18", change:"+2", icon:"👤" },
    { label:"Depts Online", value:"9/12", change:"", icon:"🏢" },
  ];
  const logs = [
    { caller:"Dr. Jane Doe", recipient:"ER Nurse Station", type:"Intercom", dur:"4:22", time:"2:15 PM", st:"completed", auto:true },
    { caller:"Admin Office", recipient:"Pharmacy", type:"Intercom", dur:"1:05", time:"1:48 PM", st:"completed", auto:false },
    { caller:"Dr. Santos", recipient:"Weekly Sync", type:"Meeting", dur:"32:10", time:"1:00 PM", st:"completed", auto:false },
    { caller:"Pediatrics", recipient:"Laboratory", type:"Intercom", dur:"—", time:"12:45 PM", st:"missed", auto:false },
    { caller:"Nurse Kim", recipient:"Radiology", type:"Intercom", dur:"2:33", time:"12:30 PM", st:"completed", auto:false },
  ];
  const weekly = [18,24,31,28,47,39,42];
  const mx = Math.max(...weekly);

  return (
    <div style={{ padding:32 }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:10, fontWeight:600, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>TENANT ADMIN</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h1 style={{ fontSize:26, fontWeight:700, color:C.text, fontFamily:font, letterSpacing:"-0.5px" }}>Dashboard</h1>
          <button style={{
            padding:"8px 16px", borderRadius:8, border:`1px solid ${C.border}`,
            background:C.bgCard, color:C.text, fontSize:11, fontFamily:mono, cursor:"pointer", fontWeight:500,
          }}>↓ Export</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        {stats.map((s,i) => (
          <div key={i} style={{
            background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20,
            boxShadow:C.shadow, animation:`fadeInUp 0.4s ease ${i*0.06}s both`,
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.label}</div>
              <span style={{ fontSize:18 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize:30, fontWeight:700, color:C.text, fontFamily:font, letterSpacing:"-0.8px" }}>{s.value}</div>
            {s.change && <div style={{ fontSize:11, fontFamily:mono, color:C.green, marginTop:6, fontWeight:500 }}>{s.change} vs yesterday</div>}
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Chart */}
        <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20, boxShadow:C.shadow }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, fontFamily:font, marginBottom:2 }}>Calls This Week</div>
          <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted, marginBottom:18 }}>DAILY VOLUME</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:110 }}>
            {weekly.map((v,i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted, fontWeight:500 }}>{v}</div>
                <div style={{
                  width:"100%", borderRadius:6, height:`${(v/mx)*90}px`,
                  background: i===4 ? `linear-gradient(180deg, ${C.accent}, ${C.accentHover})` : C.accentLight,
                  transition:"height 0.4s ease",
                }} />
                <div style={{ fontSize:9, fontFamily:mono, color:C.textMuted }}>
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top departments */}
        <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20, boxShadow:C.shadow }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, fontFamily:font, marginBottom:2 }}>Top Departments</div>
          <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted, marginBottom:18 }}>BY CALL VOLUME TODAY</div>
          {[
            { name:"ER Nurse Station", calls:14, pct:100 },
            { name:"Radiology", calls:9, pct:64 },
            { name:"Admin Office", calls:7, pct:50 },
            { name:"Pharmacy", calls:5, pct:36 },
          ].map((d,i) => (
            <div key={i} style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:12, color:C.text, fontFamily:font, fontWeight:500 }}>{d.name}</span>
                <span style={{ fontSize:11, fontFamily:mono, color:C.textMuted }}>{d.calls}</span>
              </div>
              <div style={{ height:6, borderRadius:3, background:C.accentLight }}>
                <div style={{ height:"100%", borderRadius:3, width:`${d.pct}%`, background:`linear-gradient(90deg, ${C.accent}, ${C.accentHover})`, transition:"width 0.5s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Call logs */}
      <div style={{ marginTop:16, background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", boxShadow:C.shadow }}>
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, fontFamily:font }}>Recent Calls</div>
            <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted }}>CALL LOG</div>
          </div>
          <span style={{ fontSize:12, color:C.accentHover, fontFamily:font, cursor:"pointer", fontWeight:500 }}>View all →</span>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {["Caller","Recipient","Type","Duration","Time","Status",""].map(h => (
                <th key={h} style={{ textAlign:"left", padding:"10px 16px", fontSize:9, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l,i) => (
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}22` }}>
                <td style={{ padding:"12px 16px", fontSize:12, color:C.text, fontFamily:font, fontWeight:500 }}>{l.caller}</td>
                <td style={{ padding:"12px 16px", fontSize:12, color:C.textSecondary, fontFamily:font }}>{l.recipient}</td>
                <td style={{ padding:"12px 16px" }}>
                  <span style={{
                    fontSize:9, fontFamily:mono, textTransform:"uppercase", letterSpacing:"0.05em",
                    padding:"3px 8px", borderRadius:6, fontWeight:600,
                    background: l.type==="Meeting" ? "rgba(59,130,246,0.08)" : C.accentLight,
                    color: l.type==="Meeting" ? C.blue : C.accentHover,
                  }}>{l.type}</span>
                </td>
                <td style={{ padding:"12px 16px", fontSize:12, fontFamily:mono, color:C.textMuted }}>{l.dur}</td>
                <td style={{ padding:"12px 16px", fontSize:12, fontFamily:mono, color:C.textMuted }}>{l.time}</td>
                <td style={{ padding:"12px 16px" }}>
                  <span style={{ fontSize:9, fontFamily:mono, textTransform:"uppercase", fontWeight:600, color: l.st==="completed" ? C.green : C.red }}>{l.st}</span>
                </td>
                <td style={{ padding:"12px 16px" }}>
                  {l.auto && <span style={{ fontSize:8, fontFamily:mono, color:C.blue, background:"rgba(59,130,246,0.08)", padding:"2px 6px", borderRadius:6, fontWeight:600 }}>AUTO</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────── SUPER ADMIN ────────────────────── */
function SuperAdminPage() {
  const tenants = [
    { name:"Metro General Hospital", plan:"Enterprise", users:45, calls:312, rev:"₱8,499", status:"active" },
    { name:"City Hall - Manila", plan:"Pro", users:22, calls:156, rev:"₱2,999", status:"active" },
    { name:"Powerbyte Corp", plan:"Pro", users:15, calls:89, rev:"₱2,999", status:"active" },
    { name:"Barangay Health Center", plan:"Free", users:6, calls:34, rev:"₱0", status:"active" },
    { name:"Provincial LGU - Cebu", plan:"Enterprise", users:38, calls:0, rev:"₱8,499", status:"suspended" },
  ];
  const pStats = [
    { label:"Total Tenants", value:"24", icon:"🏢" },
    { label:"Active Calls Now", value:"7", icon:"📡" },
    { label:"Monthly Revenue", value:"₱78,482", icon:"💰" },
    { label:"Total Users", value:"482", icon:"👥" },
  ];

  return (
    <div style={{ padding:32 }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:10, fontWeight:600, fontFamily:mono, color:C.accentHover, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>⚡ SUPER ADMIN</div>
        <h1 style={{ fontSize:26, fontWeight:700, color:C.text, fontFamily:font, letterSpacing:"-0.5px" }}>Platform Overview</h1>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        {pStats.map((s,i) => (
          <div key={i} style={{
            background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:20,
            boxShadow:C.shadow, animation:`fadeInUp 0.4s ease ${i*0.06}s both`,
          }}>
            <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>{s.label}</div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:26 }}>{s.icon}</span>
              <span style={{ fontSize:30, fontWeight:700, color:C.text, fontFamily:font, letterSpacing:"-0.8px" }}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", boxShadow:C.shadow }}>
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, fontFamily:font }}>All Tenants</div>
            <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted }}>ORGANIZATION MANAGEMENT</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bgCard, color:C.textSecondary, fontSize:10, fontFamily:mono, cursor:"pointer", fontWeight:600 }}>↓ Export</button>
            <button style={{ padding:"6px 14px", borderRadius:8, border:"none", background:`linear-gradient(135deg, ${C.accent}, ${C.accentHover})`, color:C.text, fontSize:10, fontFamily:mono, cursor:"pointer", fontWeight:700 }}>+ Add Tenant</button>
          </div>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {["Organization","Plan","Users","Calls (30d)","Revenue","Status",""].map(h => (
                <th key={h} style={{ textAlign:"left", padding:"10px 16px", fontSize:9, fontFamily:mono, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t,i) => (
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}22`, opacity: t.status==="suspended" ? 0.5 : 1 }}>
                <td style={{ padding:"14px 16px", fontSize:12, fontWeight:600, color:C.text, fontFamily:font }}>{t.name}</td>
                <td style={{ padding:"14px 16px" }}>
                  <span style={{
                    fontSize:9, fontFamily:mono, textTransform:"uppercase", letterSpacing:"0.05em",
                    padding:"3px 8px", borderRadius:6, fontWeight:700,
                    background: t.plan==="Enterprise" ? "rgba(250,204,21,0.12)" : t.plan==="Pro" ? "rgba(59,130,246,0.08)" : "rgba(0,0,0,0.04)",
                    color: t.plan==="Enterprise" ? C.accentHover : t.plan==="Pro" ? C.blue : C.textMuted,
                  }}>{t.plan}</span>
                </td>
                <td style={{ padding:"14px 16px", fontSize:12, fontFamily:mono, color:C.textMuted }}>{t.users}</td>
                <td style={{ padding:"14px 16px", fontSize:12, fontFamily:mono, color:C.textMuted }}>{t.calls}</td>
                <td style={{ padding:"14px 16px", fontSize:12, fontFamily:font, color:C.text, fontWeight:600 }}>{t.rev}</td>
                <td style={{ padding:"14px 16px" }}>
                  <span style={{ fontSize:9, fontFamily:mono, textTransform:"uppercase", fontWeight:700, color: t.status==="active" ? C.green : C.red }}>● {t.status}</span>
                </td>
                <td style={{ padding:"14px 16px" }}>
                  <span style={{ fontSize:11, color:C.accentHover, fontFamily:font, cursor:"pointer", fontWeight:500 }}>View →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* System health */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginTop:16 }}>
        {[
          { name:"LiveKit Server", status:"healthy", lat:"12ms" },
          { name:"PostgreSQL", status:"healthy", lat:"3ms" },
          { name:"MinIO Storage", status:"healthy", lat:"8ms" },
        ].map((s,i) => (
          <div key={i} style={{
            background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:12, padding:16,
            boxShadow:C.shadow, display:"flex", justifyContent:"space-between", alignItems:"center",
          }}>
            <div>
              <div style={{ fontSize:12, color:C.text, fontFamily:font, fontWeight:500 }}>{s.name}</div>
              <div style={{ fontSize:10, fontFamily:mono, color:C.textMuted, marginTop:1 }}>{s.lat} avg</div>
            </div>
            <div style={{ fontSize:9, fontFamily:mono, textTransform:"uppercase", fontWeight:700, color:C.green, display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:C.green }} />{s.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────── MAIN APP SHELL ────────────────────── */
export default function YelliMockupV2() {
  const [page, setPage] = useState("speeddial");
  const [sidebarExpanded, setSidebarExpanded] = useState(false); // auto-collapsed by default

  const renderPage = () => {
    switch(page) {
      case "speeddial": return <SpeedDialPage />;
      case "history":   return <VideoCallPage />;
      case "meeting":   return <MeetingRoomPage />;
      case "admin":     return <AdminDashboardPage />;
      case "superadmin":return <SuperAdminPage />;
      default:          return <SpeedDialPage />;
    }
  };

  const isDarkPage = false; // all pages now use white matte theme

  return (
    <>
      <style>{baseCSS}</style>
      <div style={{
        display:"flex", height:"100vh", width:"100vw",
        background: isDarkPage ? C.bgDark : C.bg,
        fontFamily:font, color:C.text, overflow:"hidden",
      }}>
        <Sidebar
          activePage={page}
          onNavigate={setPage}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        />
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Page switcher tabs */}
          <div style={{
            padding:"6px 14px",
            borderBottom:`1px solid ${isDarkPage ? "rgba(255,255,255,0.06)" : C.border}`,
            display:"flex", gap:3,
            background: isDarkPage ? "rgba(12,12,14,0.8)" : "rgba(255,255,255,0.8)",
            backdropFilter:"blur(8px)",
            flexShrink:0,
          }}>
            {[
              { id:"speeddial", label:"Speed Dial" },
              { id:"history",   label:"Video Call" },
              { id:"meeting",   label:"Meeting" },
              { id:"admin",     label:"Admin" },
              { id:"superadmin",label:"Super Admin" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setPage(tab.id)} style={{
                padding:"5px 12px", borderRadius:6, border:"none",
                background: page===tab.id ? (isDarkPage ? "rgba(250,204,21,0.12)" : C.accentLight) : "transparent",
                color: page===tab.id ? (isDarkPage ? C.accent : C.accentHover) : (isDarkPage ? C.textMuted : C.textSecondary),
                fontSize:10, fontFamily:mono, cursor:"pointer", fontWeight:600,
                textTransform:"uppercase", letterSpacing:"0.05em",
              }}>{tab.label}</button>
            ))}
            <div style={{ flex:1 }} />
            <span style={{
              fontSize:9, fontFamily:mono, color: isDarkPage ? "rgba(255,255,255,0.2)" : C.textMuted,
              alignSelf:"center", letterSpacing:"0.05em",
            }}>YELLI MOCKUP v2</span>
          </div>

          {/* Page content */}
          <div style={{ flex:1, overflow:"auto" }}>
            {renderPage()}
          </div>
        </div>
      </div>
    </>
  );
}
