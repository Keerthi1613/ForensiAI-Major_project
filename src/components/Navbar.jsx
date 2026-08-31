import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiBell, FiMenu, FiSearch, FiX, FiLogOut, FiActivity, FiUser, FiChevronDown } from "react-icons/fi";
import { useAuth } from "../context/AuthContext.jsx";
import { getNotifications } from "../services/api.js";

export default function Navbar({ onOpenMobileSidebar, sidebarWidth }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  const hasHighRisk = useMemo(() => {
    return notifications.some(n => n.riskLevel === "High");
  }, [notifications]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  useEffect(() => {
    function onKeyDown(e) { 
      if (e.key === "Escape") {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    }
    function onPointerDown(e) { 
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); 
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (q) navigate(`/incidents?query=${encodeURIComponent(q)}`);
  };

  return (
    <header 
      className="fixed top-0 right-0 z-40 bg-background border-b border-divider transition-all duration-300"
      style={{ left: sidebarWidth || 0 }}
    >
      <div className="h-[52px] px-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button onClick={onOpenMobileSidebar} className="lg:hidden p-2 text-primary hover:text-text-primary transition-colors">
            <FiMenu size={20} />
          </button>
          
          <div className="hidden lg:flex items-center">
             <div className="flex items-center gap-2 text-[0.65rem] font-mono font-bold text-success uppercase tracking-[0.12em]">
               <span className="h-2 w-2 rounded-full bg-success" />
               NODE_ACTIVE
             </div>
          </div>
        </div>

        {/* Global Search */}
        <form onSubmit={onSubmit} className="hidden md:flex flex-1 max-w-lg mx-6">
          <div className="w-full relative group">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search forensic buffer..."
              className="w-full bg-surface border border-divider rounded-sm pl-10 pr-4 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-primary/40 transition-all"
            />
          </div>
        </form>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen(!notifOpen);
                setProfileOpen(false);
              }}
              className="p-2 text-text-secondary hover:text-text-primary transition-all relative"
            >
              <FiBell size={18} className={hasHighRisk ? "text-danger" : ""} />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-primary rounded-full ring-1 ring-background" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 soc-card p-0 overflow-hidden shadow-tactical bg-elevated">
                <div className="px-4 py-2 border-b border-divider bg-surface">
                  <span className="label-mono text-primary">System Feed</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div key={n.id} className="p-3 hover:bg-surface transition-colors border-b border-divider last:border-0 cursor-pointer">
                        <div className="flex items-start gap-3">
                          <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${n.riskLevel === 'High' ? 'bg-danger' : 'bg-success'}`} />
                          <div>
                            <div className="text-[0.7rem] font-medium text-text-primary line-clamp-2">{n.title}</div>
                            <div className="text-[0.6rem] font-mono text-text-muted mt-1 uppercase tracking-tighter">{n.timestamp}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-[0.65rem] text-text-muted uppercase tracking-widest font-mono">Buffer clear</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-divider relative" ref={profileRef}>
            <div className="hidden sm:block text-right cursor-pointer" onClick={() => setProfileOpen(!profileOpen)}>
              <div className="text-xs font-bold text-text-primary">{user?.username}</div>
              <div className="text-[0.6rem] font-mono font-bold text-text-secondary uppercase tracking-tighter flex items-center justify-end gap-1">
                {user?.role} <FiChevronDown size={12} />
              </div>
            </div>
            
            <div 
              className="h-8 w-8 bg-elevated border border-divider flex items-center justify-center text-primary font-mono text-xs font-bold rounded-sm cursor-pointer hover:border-primary transition-all"
              onClick={() => setProfileOpen(!profileOpen)}
            >
              {user?.username?.[0]?.toUpperCase()}
            </div>

            {profileOpen && (
              <div className="absolute top-full right-0 mt-2">
                <div className="bg-elevated border border-divider rounded-sm shadow-tactical overflow-hidden min-w-[180px]">
                  <div className="px-4 py-3 border-b border-divider bg-surface">
                    <div className="text-xs font-bold text-text-primary">{user?.username}</div>
                    <div className="text-[0.6rem] font-mono text-text-muted mt-0.5 uppercase tracking-widest">Active session</div>
                  </div>
                  <Link 
                    to="/profile" 
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-[0.7rem] font-mono uppercase font-bold text-text-primary hover:bg-surface transition-all border-b border-divider"
                  >
                    <FiUser size={14} /> Profile
                  </Link>
                  <button 
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[0.7rem] font-mono uppercase font-bold text-danger hover:bg-danger/5 transition-all"
                  >
                    <FiLogOut size={14} /> Log_Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
