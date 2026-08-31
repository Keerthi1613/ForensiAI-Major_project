import React from "react";
import { NavLink } from "react-router-dom";
import {
  FiAlertCircle,
  FiClock,
  FiGrid,
  FiMessageSquare,
  FiFileText,
  FiChevronLeft,
  FiChevronRight,
  FiHardDrive,
  FiShield,
  FiCpu,
  FiUser
} from "react-icons/fi";

const navItems = [
  { to: "/", label: "Dashboard", icon: FiGrid },
  { to: "/incidents", label: "Threat Events", icon: FiAlertCircle },
  { to: "/timeline", label: "Timeline", icon: FiClock },
  { to: "/investigation", label: "Neural Investigation", icon: FiCpu },
  { to: "/chatbot", label: "AI Analyst", icon: FiMessageSquare },
  { to: "/reports", label: "Reports", icon: FiFileText },
  { to: "/ingest", label: "Data Ingestion", icon: FiHardDrive }
];

export default function Sidebar({
  collapsed,
  mobileOpen,
  onMobileOpenChange,
  onToggleCollapsed
}) {
  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 bg-background border-r border-divider transition-all duration-300 ease-in-out",
        collapsed ? "lg:w-14" : "lg:w-[220px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      ].join(" ")}
    >
      <div className="flex h-full flex-col">
        {/* Brand Header */}
        <div className="h-[52px] flex items-center px-4 border-b border-divider">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="text-primary shrink-0">
              <FiShield size={20} />
            </div>
            {!collapsed && (
              <span className="text-sm font-mono font-bold tracking-tight text-text-primary whitespace-nowrap">
                FORENSI<span className="text-primary">AI</span>
              </span>
            )}
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 py-4 space-y-0.5 overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => onMobileOpenChange(false)}
                className={({ isActive }) =>
                  [
                    "group flex items-center h-10 px-4 transition-all relative overflow-hidden",
                    isActive
                      ? "text-primary border-l-2 border-primary bg-primary/5"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
                  ].join(" ")
                }
              >
                <div className="shrink-0 w-6 flex items-center justify-center">
                  <Icon size={18} />
                </div>
                {!collapsed && (
                  <span className="ml-3 text-[0.75rem] font-medium font-sans truncate uppercase tracking-wider">
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Toggle */}
        <div className="border-t border-divider">
          <button
            onClick={onToggleCollapsed}
            className="w-full flex items-center justify-center h-10 text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
