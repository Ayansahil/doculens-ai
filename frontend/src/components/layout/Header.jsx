import { useState, useEffect, useRef } from 'react';
import { Upload, Bell, Menu, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button'; 
import SearchBar from '../features/SearchBar';
import { useApp } from '../../context/AppContext';

const Header = () => {
  const { toggleSidebar, sidebarCollapsed, user, auth, notifications } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const navigate = useNavigate();
  
  const notificationRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfile(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setShowProfile(false);
    await auth.logout();
    navigate('/login', { replace: true });
  };

  const handleUploadClick = () => {
    navigate('/upload');
  };

  const unreadNotifications = notifications.filter(n => !n.read).length;

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2.5 sm:px-6 flex-shrink-0">
      <div className="flex items-center justify-between gap-2 sm:gap-6 w-full min-w-0">
        {/* Left side - Menu button for mobile/tablet */}
        <div className="flex items-center lg:hidden flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="min-h-11 min-w-11 p-2 text-gray-600 hover:text-gray-900"
            aria-label="Toggle navigation menu"
            aria-expanded={!sidebarCollapsed}
            aria-controls="primary-navigation"
          >
            <Menu size={20} />
          </Button>
        </div>

        {/* Center - Search */}
        <div className="flex-1 max-w-2xl min-w-0">
          <SearchBar placeholder="Search all documents..." />
        </div>

        {/* Right side - Actions and Profile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Button
            variant="primary"
            size="md"
            className="p-2 sm:px-4 sm:py-2"
            icon={<Upload size={16} />}
            onClick={handleUploadClick}
            aria-label="Upload document"
          >
            <span className="hidden sm:inline">Upload</span>
          </Button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotifications(!showNotifications)}
              className="min-h-11 min-w-11 p-2 relative text-gray-600 hover:text-gray-900"
              aria-label="Notifications"
              aria-expanded={showNotifications}
            >
              <Bell size={20} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold">
                  {unreadNotifications}
                </span>
              )}
            </Button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                          !notification.read ? 'bg-blue-50' : ''
                        }`}
                      >
                        <p className="text-sm text-gray-900">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowProfile(!showProfile)}
              className="min-h-11 min-w-11 p-1 sm:p-2 flex items-center gap-2"
              aria-label="User profile"
              aria-expanded={showProfile}
            >
              <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase() || <User size={16} />}
              </div>
              <span className="hidden md:inline-block font-medium text-gray-700 truncate max-w-[120px]">
                {user?.name || 'User'}
              </span>
            </Button>

            {showProfile && (
              <div className="absolute right-0 mt-2 w-48 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-2">
                  <button 
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm"
                    onClick={() => {
                      setShowProfile(false);
                      navigate('/settings');
                    }}
                  >
                    Profile Settings
                  </button>
                  <button 
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm"
                    onClick={() => {
                      setShowProfile(false);
                      navigate('/settings');
                    }}
                  >
                    Account
                  </button>
                  <hr className="my-1" />
                  <button 
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 text-sm text-red-600"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
