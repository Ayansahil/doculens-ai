import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useApp } from "../../context/AppContext";
import PropTypes from "prop-types";

const Layout = ({ children }) => {
  useApp();
  const { pathname } = useLocation();
  const mainRef = useRef(null);

  // Without this, `main`/the window keep the previous page's scroll offset and
  // the dashboard appears to start mid-card after navigating from another page.
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen w-full min-w-0 bg-background">
      <Sidebar />
      <div className="relative z-0 flex min-w-0 flex-1 flex-col lg:z-auto">
        <Header />
        <main
          ref={mainRef}
          className="min-w-0 max-w-full flex-1 overflow-y-auto p-4 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};
