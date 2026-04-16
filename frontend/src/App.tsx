import { Routes, Route } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import LoginPage from "./pages/LoginPage";
import CallbackPage from "./pages/CallbackPage";
import ParishSelectPage from "./pages/ParishSelectPage";
import DashboardPage from "./pages/DashboardPage";
import AppraisalEntryPage from "./pages/AppraisalEntryPage";
import AccountPage from "./pages/AccountPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/parishes" element={<ProtectedRoute><ParishSelectPage /></ProtectedRoute>} />
      <Route path="/dashboard/:parishId" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/dashboard/:parishId/appraisal-entry" element={<ProtectedRoute><AppraisalEntryPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
    </Routes>
  );
}