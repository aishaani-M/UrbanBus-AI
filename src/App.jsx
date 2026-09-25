import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/Common/ProtectedRoute';
import GovHeader from './components/Common/GovHeader';
import GovFooter from './components/Common/GovFooter';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CongestionPage from './pages/CongestionPage';
import RoadConditionsPage from './pages/RoadConditionsPage';
import IncidentsPage from './pages/IncidentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import FleetPage from './pages/FleetPage';
import { useEdgeWebSocket } from './hooks/useEdgeWebSocket';
import { useAuth } from './contexts/AuthContext';

function AuthenticatedApp() {
  const { events, busUpdates, isConnected, stats } = useEdgeWebSocket(3000);
  const { isAuthenticated, loading } = useAuth();

  // Show nothing while Supabase checks session
  if (loading) {
    return null;
  }

  // Login page renders its own layout (no header/footer)
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <GovHeader isConnected={isConnected} />
      <main className="main-content">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage liveEvents={events} stats={stats} /></ProtectedRoute>} />
          <Route path="/congestion" element={<ProtectedRoute><CongestionPage /></ProtectedRoute>} />
          <Route path="/road-conditions" element={<ProtectedRoute><RoadConditionsPage /></ProtectedRoute>} />
          <Route path="/incidents" element={<ProtectedRoute><IncidentsPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/fleet" element={<ProtectedRoute><FleetPage /></ProtectedRoute>} />
        </Routes>
      </main>
      <GovFooter />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <AuthenticatedApp />
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  );
}
