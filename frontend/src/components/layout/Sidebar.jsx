import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  FileText,
  FolderUp,
  HelpCircle,
  LayoutTemplate,
  ChevronLeft,
  ChevronRight,
  Settings,
  Brain,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import Button from "../ui/Button";

const Sidebar = () => {
  const { sidebarCollapsed, toggleSidebar } = useApp();
  const [storageUsed] = useState({ used: 1.2, total: 10 }); // GB
  const navigate = useNavigate();

  const navigationItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: Home,
    },
    {
      name: "Documents",
      href: "/documents",
      icon: FileText,
    },
    {
      name: "Upload",
      href: "/upload",
      icon: FolderUp,
    },
  ];

  const storagePercentage = (storageUsed.used / storageUsed.total) * 100;

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024 && !sidebarCollapsed) {
      toggleSidebar();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {!sidebarCollapsed && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        id="primary-navigation"
        aria-label="Primary navigation"
        className={`
        fixed left-0 top-0 z-50 h-dvh max-h-dvh bg-[#1E293B] flex-shrink-0 transition-all duration-300 ease-in-out
        lg:relative lg:z-auto
        ${sidebarCollapsed ? "-translate-x-full lg:translate-x-0 lg:w-20" : "translate-x-0 w-72"}
      `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
                    <Brain size={20} className="text-white" />
                  </div>
                  <span className="text-white font-semibold text-lg">
                    DocuLens AI
                  </span>
                </div>
              )}

              {sidebarCollapsed && (
                <div className="flex items-center justify-center w-full">
                  <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
                    <Brain size={20} className="text-white" />
                  </div>
                </div>
              )}

              {!sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  className="p-1 text-gray-300 hover:text-white hover:bg-gray-700 hidden lg:flex"
                >
                  <ChevronLeft size={16} />
                </Button>
              )}
            </div>
            {sidebarCollapsed && (
              <div className="flex justify-center mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  className="p-1 text-gray-300 hover:text-white hover:bg-gray-700 hidden lg:flex"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav aria-label="Main" className="flex-1 min-h-0 px-3 py-6 overflow-y-auto">
            <div className="space-y-3">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={handleNavClick}
                    className={({ isActive }) => `
                      flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-all
                      ${isActive ? "bg-primary-500 text-white shadow-md" : "text-gray-300 hover:bg-slate-700/60 hover:text-white"}
                      ${sidebarCollapsed ? "justify-center px-0" : ""}
                    `}
                    title={sidebarCollapsed ? item.name : undefined}
                  >
                    <Icon size={22} className="flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.name}</span>}
                  </NavLink>
                );
              })}
            </div>

            {/* Circular Upload Button */}
            {!sidebarCollapsed && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => {
                    handleNavClick();
                    navigate("/upload");
                  }}
                  className="h-14 w-14 bg-primary-500 hover:bg-primary-600 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
                  title="Upload Document"
                >
                  <FolderUp size={24} className="text-white" />
                </button>
              </div>
            )}

            {/* Additional Nav Items */}
            <div className="mt-8 space-y-3">
              <NavLink
                to="/help"
                onClick={handleNavClick}
                className={({ isActive }) => `
                  flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-all
                  ${isActive ? "bg-primary-500 text-white shadow-md" : "text-gray-300 hover:bg-slate-700/60 hover:text-white"}
                  ${sidebarCollapsed ? "justify-center px-0" : ""}
                `}
                title={sidebarCollapsed ? "Help & Support" : undefined}
              >
                <HelpCircle size={22} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Help & Support</span>}
              </NavLink>

              <NavLink
                to="/templates"
                onClick={handleNavClick}
                className={({ isActive }) => `
                  flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-all
                  ${isActive ? "bg-primary-500 text-white shadow-md" : "text-gray-300 hover:bg-slate-700/60 hover:text-white"}
                  ${sidebarCollapsed ? "justify-center px-0" : ""}
                `}
                title={sidebarCollapsed ? "Templates" : undefined}
              >
                <LayoutTemplate size={22} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Templates</span>}
              </NavLink>
            </div>
          </nav>

          {/* Bottom section */}
          <div className="mt-auto">
            {/* Storage indicator */}
            {!sidebarCollapsed && (
              <div className="p-4 border-t border-gray-700">
                <div className="text-gray-300 text-sm mb-2">
                  Storage Used: {storageUsed.used}GB / {storageUsed.total}GB
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-1">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${storagePercentage}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400">
                  {Math.round(storagePercentage)}% used
                </div>
              </div>
            )}

            {/* Collapsed storage indicator */}
            {sidebarCollapsed && (
              <div className="p-3 flex justify-center items-center border-t border-gray-700">
                <div
                  className="h-10 w-10 rounded-full border-2 border-primary-500 flex items-center justify-center text-xs text-primary-500 font-semibold"
                  title={`Storage: ${storageUsed.used}GB / ${storageUsed.total}GB (${Math.round(storagePercentage)}%)`}
                >
                  {Math.round(storagePercentage)}%
                </div>
              </div>
            )}

            {/* Settings */}
            <div className="border-t border-gray-700 p-3">
              <NavLink
                to="/settings"
                onClick={handleNavClick}
                className={({ isActive }) => `
                  flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-all
                  ${isActive ? "bg-primary-500 text-white shadow-md" : "text-gray-300 hover:bg-slate-700/60 hover:text-white"}
                  ${sidebarCollapsed ? "justify-center px-0" : ""}
                `}
                title={sidebarCollapsed ? "Settings" : undefined}
              >
                <Settings size={22} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>Settings</span>}
              </NavLink>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
