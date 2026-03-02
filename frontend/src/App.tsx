import { Routes, Route } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import LoginPage from "./pages/LoginPage";
import CallbackPage from "./pages/CallbackPage";
import ParishSelectPage from "./pages/ParishSelectPage";
import DashboardPage from "./pages/DashboardPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth0();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Loading...</div>
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
      <Route
        path="/parishes"
        element={
          <ProtectedRoute>
            <ParishSelectPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/:parishId"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}