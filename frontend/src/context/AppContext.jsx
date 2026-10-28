import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import PropTypes from 'prop-types';

const AppContext = createContext();

const initialState = {
  theme: 'light',
  // Tablet widths need the compact icon rail; only xl (>= 1280) gets the
  // full-width desktop sidebar by default.
  sidebarCollapsed: typeof window !== 'undefined' ? window.innerWidth < 1280 : false,
  notifications: [],
  searchQuery: '',
  activeDocument: null,
  chatHistory: [],
  uploadProgress: {},
  dashboardStats: null,
};

const appReducer = (state, action) => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
      
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
      
    case 'SET_SIDEBAR_COLLAPSED':
      return { ...state, sidebarCollapsed: action.payload };
      
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload]
      };
      
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload)
      };
      
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
      
    case 'SET_ACTIVE_DOCUMENT':
      return { ...state, activeDocument: action.payload };
      
    case 'ADD_CHAT_MESSAGE':
      return {
        ...state,
        chatHistory: [...state.chatHistory, action.payload]
      };
      
    case 'SET_CHAT_HISTORY':
      return { ...state, chatHistory: action.payload };
      
    case 'UPDATE_UPLOAD_PROGRESS':
      return {
        ...state,
        uploadProgress: {
          ...state.uploadProgress,
          [action.payload.fileId]: action.payload.progress
        }
      };
      
    case 'REMOVE_UPLOAD_PROGRESS':
      { const newUploadProgress = { ...state.uploadProgress };
      delete newUploadProgress[action.payload];
      return { ...state, uploadProgress: newUploadProgress }; }
      
    case 'SET_DASHBOARD_STATS':
      return { ...state, dashboardStats: action.payload };
      
    default:
      return state;
  }
};

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const auth = useAuth();

  // Keep tablet/desktop resizing from leaving a 288px sidebar over a narrow
  // content area. Users can still expand the rail manually afterwards.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) {
        dispatch({ type: 'SET_SIDEBAR_COLLAPSED', payload: true });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addNotification = (notification) => {
    const id = Date.now().toString();
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: { ...notification, id }
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
    }, 5000);
  };

  const removeNotification = (id) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  };

  const toggleSidebar = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  };

  const setSearchQuery = (query) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  };

  const setActiveDocument = (document) => {
    dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: document });
  };

  const addChatMessage = (message) => {
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
  };

  const setChatHistory = (history) => {
    dispatch({ type: 'SET_CHAT_HISTORY', payload: history });
  };

  const updateUploadProgress = (fileId, progress) => {
    dispatch({ 
      type: 'UPDATE_UPLOAD_PROGRESS', 
      payload: { fileId, progress } 
    });
  };

  const removeUploadProgress = (fileId) => {
    dispatch({ type: 'REMOVE_UPLOAD_PROGRESS', payload: fileId });
  };

  const setDashboardStats = useCallback((stats) => {
    dispatch({ type: 'SET_DASHBOARD_STATS', payload: stats });
  }, []);

  const contextValue = {
    ...state,
    auth, // { user, session, login, register, logout, isAuthenticated, loading }
    user: auth.user,
    session: auth.session,
    isAuthenticated: auth.isAuthenticated,
    authLoading: auth.loading,
    dispatch,
    addNotification,
    removeNotification,
    toggleSidebar,
    setSearchQuery,
    setActiveDocument,
    addChatMessage,
    setChatHistory,
    updateUploadProgress,
    removeUploadProgress,
    setDashboardStats,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

AppProvider.propTypes = {
  children: PropTypes.node.isRequired,
};