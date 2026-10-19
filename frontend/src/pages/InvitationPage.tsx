import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { setAuthToken } from "../services/api";

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently, user, logout } = useAuth0();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isLoading || isAuthenticated || !token) return;
    sessionStorage.setItem("invitationReturnTo", `/invite/${token}`);
    loginWithRedirect({ appState: { returnTo: `/invite/${token}` } }).catch(() => setMessage("Could not start sign in. Please refresh and try again."));
  }, [token, isLoading, isAuthenticated, loginWithRedirect]);
  const accept = async () => {
    if (busy || !token) return;
    setBusy(true); setMessage("");
    try {
      setAuthToken(await getAccessTokenSilently());
      const response = await api.post(`/account/invitations/${token}/accept`);
      sessionStorage.removeItem("invitationReturnTo");
      navigate(`/dashboard/${response.data.parish_id}`, { replace: true });
    } catch (error: any) { setMessage(error?.response?.data?.detail || "This invitation could not be accepted."); }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
    <div className="bg-white border border-stone-200 rounded-2xl p-8 w-full max-w-md shadow-sm text-center">
      <h1 className="text-xl font-semibold text-stone-800">Parish invitation</h1>
      <p className="text-sm text-stone-500 mt-3">{isAuthenticated ? `Signed in as ${user?.email || "your Auth0 account"}. Accept using the email address that was invited.` : "Redirecting to secure sign in?"}</p>
      {message && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mt-4">{message}</p>}
      {isAuthenticated && <><button disabled={busy} onClick={accept} className="w-full mt-5 bg-stone-800 text-white rounded-lg px-4 py-2.5 disabled:opacity-50">{busy ? "Accepting?" : "Accept Invitation"}</button>
        <button disabled={busy} onClick={() => { sessionStorage.setItem("invitationReturnTo", `/invite/${token}`); logout({ logoutParams: { returnTo: window.location.origin } }); }} className="text-sm text-stone-500 mt-4">Sign in with another account</button></>}
    </div>
  </div>;
}
