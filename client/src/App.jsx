import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/employee/Home';
import MySchedule from './pages/employee/MySchedule';
import AbsenceReport from './pages/employee/AbsenceReport';
import RoomQuery from './pages/employee/RoomQuery';
import OneTimeRequest from './pages/employee/OneTimeRequest';
import Library from './pages/employee/Library';
import MeetingRoom from './pages/employee/MeetingRoom';
import Mamod from './pages/employee/Mamod';
import AdminUsers from './pages/admin/Users';
import AdminRooms from './pages/admin/Rooms';
import AdminAssignments from './pages/admin/Assignments';
import AdminRequests from './pages/admin/Requests';

function Guard({ perm, role, children }) {
  const { user, loading, perms, isSecretary } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-lg text-gray-500">טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'secretary' && !isSecretary) return <Navigate to="/my-schedule" replace />;
  if (perm && !perms[perm]) return <Navigate to="/my-schedule" replace />;
  return children;
}

function HomeRedirect() {
  return <Home />;
}

// Blocks secretary from employee-only pages and redirects to her grid
function NotForSecretary({ children }) {
  const { isSecretary } = useAuth();
  if (isSecretary) return <Navigate to="/secretary/grid" replace />;
  return children;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-lg text-gray-500">טוען מערכת...</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<HomeRedirect />} />
        <Route path="my-schedule"      element={<NotForSecretary><MySchedule /></NotForSecretary>} />
        <Route path="absence"          element={<NotForSecretary><AbsenceReport /></NotForSecretary>} />
        <Route path="room-query"       element={<RoomQuery />} />
        <Route path="one-time-request" element={<NotForSecretary><OneTimeRequest /></NotForSecretary>} />
        <Route path="library"          element={<Library />} />
        <Route path="meeting-room"     element={<MeetingRoom />} />
        <Route path="mamod"            element={<Mamod />} />
        {/* Secretary-only: read-only weekly grid */}
        <Route path="secretary/grid"   element={<Guard role="secretary"><AdminAssignments readOnly /></Guard>} />
        <Route path="admin/users"       element={<Guard perm="users"><AdminUsers /></Guard>} />
        <Route path="admin/rooms"       element={<Guard perm="rooms"><AdminRooms /></Guard>} />
        <Route path="admin/assignments" element={<Guard perm="assignments"><AdminAssignments /></Guard>} />
        <Route path="admin/requests"    element={<Guard perm="requests"><AdminRequests /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
