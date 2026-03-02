import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const { loginWithRedirect, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate("/parishes");
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
      <div className="bg-white rounded-xl shadow-lg p-10 max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          Parish Document Parser
        </h1>
        <p className="text-slate-500 mb-8">
          Upload and analyze utility bills and property appraisals
        </p>
        <button
          onClick={() => loginWithRedirect()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}