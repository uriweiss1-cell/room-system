import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import MySchedule from './pages/employee/MySchedule';
import RoomQuery from './pages/employee/RoomQuery';
import OneTimeRequest from './pages/employee/OneTimeRequest';
import AdminUsers from './pages/admin/Users';
import AdminRooms from './pages/admin/Rooms';
import AdminAssignments from './pages/admin/Assignments';
import AdminRequests from './pages/admin/Requests';

function Guard({ adminOnly, children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-lg text-gray-500">טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/my-schedule" replace />;
  return children;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-lg text-gray-500">טוען מערכת...</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to="/my-schedule" replace />} />
        <Route path="my-schedule"      element={<MySchedule />} />
        <Route path="room-query"       element={<RoomQuery />} />
        <Route path="one-time-request" element={<OneTimeRequest />} />
        <Route path="admin/users"       element={<Guard adminOnly><AdminUsers /></Guard>} />
        <Route path="admin/rooms"       element={<Guard adminOnly><AdminRooms /></Guard>} />
        <Route path="admin/assignments" element={<Guard adminOnly><AdminAssignments /></Guard>} />
        <Route path="admin/requests"    element={<Guard adminOnly><AdminRequests /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
