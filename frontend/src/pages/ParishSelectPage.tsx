import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuthToken } from "../services/api";

interface Parish {
  id: number;
  name: string;
  diocese: string | null;
  address: string | null;
  buildings?: { id: number; name: string }[];
}

export default function ParishSelectPage() {
  const { getAccessTokenSilently, user, logout } = useAuth0();
  const navigate = useNavigate();

  const [parishes, setParishes] = useState<Parish[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDiocese, setNewDiocese] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newBuildings, setNewBuildings] = useState<string[]>([""]); // Start with one empty input
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        setAuthToken(token);
        const res = await api.get("/parishes/");
        setParishes(res.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [getAccessTokenSilently]);

  const createParish = async () => {
    if (!newName.trim()) return;
    const buildingNames = newBuildings.map((b) => b.trim()).filter(Boolean);
    if (buildingNames.length === 0) {
      setError("Add at least one building.");
      return;
    }
    setCreating(true); setError("");
    try {
      const token = await getAccessTokenSilently();
      setAuthToken(token);
      const res = await api.post("/parishes/", {
        name: newName.trim(),
        buildings: buildingNames,
      });
      setParishes((prev) => [...prev, res.data]);
      setNewName(""); setNewBuildings([""]); setShowCreate(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create parish");
    } finally { setCreating(false); }
  };

  const addBuildingInput = () => setNewBuildings((prev) => [...prev, ""]);
  const updateBuildingInput = (idx: number, val: string) => setNewBuildings((prev) => prev.map((b, i) => i === idx ? val : b));
  const removeBuildingInput = (idx: number) => setNewBuildings((prev) => prev.filter((_, i) => i !== idx));

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet" />

      <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="max-w-2xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>Select a Parish</h1>
              <p className="text-stone-400 text-sm mt-1">Signed in as {user?.email}</p>
            </div>
            <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              className="text-sm text-stone-400 hover:text-stone-600 transition-colors">Sign Out</button>
          </div>

          {/* Parish list */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-2 mb-6">
              {parishes.map((p) => (
                <button key={p.id} onClick={() => navigate(`/dashboard/${p.id}`)}
                  className="w-full text-left bg-white rounded-xl border border-stone-200 p-4 hover:border-stone-400 hover:shadow-sm transition-all group">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-stone-800" style={{ fontFamily: "'Fraunces', serif" }}>{p.name}</span>
                      {p.diocese && <span className="text-sm text-stone-400 ml-2">· {p.diocese}</span>}
                    </div>
                    <span className="text-stone-300 group-hover:text-stone-500 transition-colors">→</span>
                  </div>
                  {p.buildings && p.buildings.length > 0 && (
                    <div className="flex gap-1.5 mt-2">{p.buildings.map((b) => (
                      <span key={b.id} className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">{b.name}</span>
                    ))}</div>
                  )}
                </button>
              ))}
              {parishes.length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl border border-stone-200">
                  <p className="text-stone-400 mb-2">No parishes yet.</p>
                  <p className="text-sm text-stone-300">Create one to get started.</p>
                </div>
              )}
            </div>
          )}

          {/* Create button / form */}
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              className="w-full bg-stone-800 hover:bg-stone-900 text-white py-3 rounded-xl text-sm font-medium transition-colors">
              + Create New Parish
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="text-base font-semibold text-stone-800 mb-4" style={{ fontFamily: "'Fraunces', serif" }}>New Parish</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1">Parish Name *</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., St. Mary's Catholic Church"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
                </div>

                {/* Buildings */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-stone-500">Buildings *</label>
                    <button onClick={addBuildingInput} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add another</button>
                  </div>
                  <p className="text-xs text-stone-400 mb-2">List each building on the property (church, rectory, school, hall, etc.)</p>
                  <div className="space-y-2">
                    {newBuildings.map((b, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={b} onChange={(e) => updateBuildingInput(i, e.target.value)}
                          placeholder={i === 0 ? "e.g., Main Church" : `Building ${i + 1}`}
                          className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
                        {newBuildings.length > 1 && (
                          <button onClick={() => removeBuildingInput(i)} className="text-stone-400 hover:text-red-500 text-sm px-1">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2 pt-2">
                  <button onClick={createParish} disabled={creating || !newName.trim()}
                    className="flex-1 bg-stone-800 hover:bg-stone-900 disabled:bg-stone-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                    {creating ? "Creating…" : "Create Parish"}
                  </button>
                  <button onClick={() => { setShowCreate(false); setError(""); }}
                    className="px-4 py-2.5 text-sm text-stone-500 hover:text-stone-700 transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}