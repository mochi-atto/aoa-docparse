import { useAuth0 } from "@auth0/auth0-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AccountPage() {
  const { user, logout } = useAuth0();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [profilePic, setProfilePic] = useState<string | null>(
    localStorage.getItem("user-profile-pic") || user?.picture || null
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true); setMsg("");
    localStorage.setItem("user-display-name", name.trim());
    setMsg("Display name updated.");
    setSaving(false);
  };

  const handleProfilePic = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const d = r.result as string;
      setProfilePic(d);
      localStorage.setItem("user-profile-pic", d);
      setMsg("Profile picture updated.");
    };
    r.readAsDataURL(f);
  };

  const deleteAccount = () => {
    // In production: call Auth0 Management API to delete user
    localStorage.clear();
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet" />
      <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-30">
          <button onClick={() => navigate(-1)} className="text-stone-400 hover:text-stone-600 text-sm">← Back</button>
          <div className="w-px h-5 bg-stone-200" />
          <h1 className="text-lg font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Account Settings</h1>
        </header>

        <div className="max-w-xl mx-auto px-6 py-8 space-y-6">
          {/* Profile */}
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="text-base font-semibold text-stone-800 mb-4" style={{ fontFamily: "'Fraunces', serif" }}>Profile</h2>
            <div className="flex items-center gap-4 mb-6">
              <label className="cursor-pointer group relative">
                <div className="w-16 h-16 rounded-full bg-stone-200 flex items-center justify-center text-2xl font-medium text-stone-600 overflow-hidden">
                  {profilePic ? <img src={profilePic} alt="" className="w-full h-full object-cover" /> : (user?.name?.[0] || "U").toUpperCase()}
                </div>
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleProfilePic} />
              </label>
              <div>
                <p className="text-sm font-medium text-stone-700">{user?.name || "User"}</p>
                <p className="text-xs text-stone-400">{user?.email}</p>
                <p className="text-xs text-stone-300 mt-0.5">Click photo to change</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1">Display Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1">Email</label>
                <input value={user?.email || ""} disabled
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-400" />
                <p className="text-xs text-stone-400 mt-1">Managed by your authentication provider.</p>
              </div>
              <button onClick={saveName} disabled={saving || !name.trim()}
                className="bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white px-4 py-2 rounded-lg text-sm font-medium">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Security */}
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="text-base font-semibold text-stone-800 mb-4" style={{ fontFamily: "'Fraunces', serif" }}>Security</h2>
            <p className="text-sm text-stone-600 mb-3">Password changes are handled through Auth0.</p>
            <button className="border border-stone-300 text-stone-700 hover:bg-stone-50 px-4 py-2 rounded-lg text-sm font-medium">
              Send Password Reset Email
            </button>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h2 className="text-base font-semibold text-red-700 mb-4" style={{ fontFamily: "'Fraunces', serif" }}>Danger Zone</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-stone-600 mb-2">Sign out of your account.</p>
                <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                  className="bg-stone-600 hover:bg-stone-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Sign Out</button>
              </div>
              <div className="pt-4 border-t border-red-100">
                <p className="text-sm text-stone-600 mb-2">Permanently delete your account and all associated data.</p>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 font-medium">Are you sure? This cannot be undone.</span>
                    <button onClick={deleteAccount} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-medium">Delete</button>
                    <button onClick={() => setShowDeleteConfirm(false)} className="text-stone-400 text-xs">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Delete Account</button>
                )}
              </div>
            </div>
          </div>

          {msg && <div className="rounded-lg p-3 text-sm bg-emerald-50 text-emerald-700">{msg}</div>}
        </div>
      </div>
    </>
  );
}