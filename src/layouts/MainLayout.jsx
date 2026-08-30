import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Navbar from "../components/Navbar.jsx";

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Dynamic values for layout calculation
  const sidebarWidthValue = sidebarCollapsed ? 80 : 256; // 20 and 64 in rem units (80px and 256px)
  const sidebarWidthClass = sidebarCollapsed ? "lg:pl-[80px]" : "lg:pl-[256px]";

  return (
    <div className="min-h-screen bg-black">
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden
      />

      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      />

      <div className={`flex flex-col min-h-screen transition-all duration-500 ${sidebarWidthClass}`}>
        <Navbar
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          sidebarWidth={window.innerWidth >= 1024 ? sidebarWidthValue : 0}
        />

        <main className="flex-1 p-6 lg:p-12 pt-28">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
