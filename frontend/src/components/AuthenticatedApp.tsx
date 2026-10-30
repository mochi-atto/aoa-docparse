import { useAuth0 } from "@auth0/auth0-react";
import { useLayoutEffect } from "react";
import App from "../App";
import { attachAuthToken } from "../services/api";

export default function AuthenticatedApp() {
  const { getAccessTokenSilently, isAuthenticated, error } = useAuth0();
  useLayoutEffect(() => {
    if (isAuthenticated) return attachAuthToken(getAccessTokenSilently);
  }, [getAccessTokenSilently, isAuthenticated]);

  if (error) return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
    <p role="alert">Sign in could not be completed. Please try again.</p>
    <a href="/" className="underline">Return to sign in</a>
  </main>;
  return <App />;
}
