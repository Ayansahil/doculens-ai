import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useApp } from '../../context/AppContext';

const ProtectedRoute = ({ children }) => {
  const { auth } = useApp();

  if (auth?.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!auth?.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ProtectedRoute;
