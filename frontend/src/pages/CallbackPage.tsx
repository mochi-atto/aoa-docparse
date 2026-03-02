import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function CallbackPage() {
  const { isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/parishes");
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Completing sign in...</p>
    </div>
  );
}