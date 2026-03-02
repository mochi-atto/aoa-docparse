import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuthToken } from "../services/api";
import type { Parish } from "../types";

export default function ParishSelectPage() {
  const { getAccessTokenSilently, logout, user } = useAuth0();
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [newName, setNewName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.get("/parishes/");
      setParishes(res.data);
    })();
  }, [getAccessTokenSilently]);

  const createParish = async () => {
    if (!newName.trim()) return;
    const res = await api.post("/parishes/", { name: newName.trim() });
    setParishes([...parishes, res.data]);
    setNewName("");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Select a Parish</h1>
            <p className="text-slate-500 text-sm mt-1">
              Signed in as {user?.email}
            </p>
          </div>
          <button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Sign Out
          </button>
        </div>

        {/* Parish list */}
        <div className="space-y-3 mb-8">
          {parishes.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/dashboard/${p.id}`)}
              className="w-full text-left bg-white rounded-lg border border-slate-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <span className="font-medium text-slate-800">{p.name}</span>
              {p.diocese && (
                <span className="text-sm text-slate-400 ml-2">· {p.diocese}</span>
              )}
            </button>
          ))}
          {parishes.length === 0 && (
            <p className="text-slate-400 text-center py-8">
              No parishes yet. Create one below to get started.
            </p>
          )}
        </div>

        {/* Create parish */}
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createParish()}
            placeholder="New parish name..."
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={createParish}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}