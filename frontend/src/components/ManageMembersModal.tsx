import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { memberApi, setAuthToken, type ParishMember, type ParishRole } from "../services/api";

const badges = { admin: "bg-violet-100 text-violet-700", editor: "bg-amber-100 text-amber-800", viewer: "bg-sky-100 text-sky-700" };
const errorMessage = (e: any) => typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Could not complete the request. Please try again.";

export default function ManageMembersModal({ parishId, parishName, onClose, onChanged }: {
  parishId: string; parishName: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [members, setMembers] = useState<ParishMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [link, setLink] = useState("");
  const [confirmation, setConfirmation] = useState<{ member: ParishMember; role?: ParishRole } | null>(null);
  const load = async () => {
    setAuthToken(await getAccessTokenSilently());
    setMembers((await memberApi.list(parishId)).data);
  };
  useEffect(() => { load().catch(e => setError(errorMessage(e))).finally(() => setLoading(false)); }, [parishId]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy, onClose]);
  const mutate = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(""); setSuccess("");
    try { setAuthToken(await getAccessTokenSilently()); await action(); await load(); setSuccess(message); setConfirmation(null); await onChanged(); }
    catch(e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setLink("");
    await mutate(async () => {
      const response = await memberApi.invite(parishId, email.trim(), role);
      setLink(response.data.invitation_url); setEmail("");
      return response;
    }, "Invitation generated. Share the link below; email is sent only when SMTP is configured.");
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="members-title" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-stone-100 flex justify-between items-start">
        <div><h2 id="members-title" className="text-xl font-semibold text-stone-800">Manage Members</h2><p className="text-sm text-stone-500 mt-1">{parishName} ? Access applies to this parish only</p></div>
        <button autoFocus disabled={busy} onClick={onClose} aria-label="Close member management" className="text-stone-500 px-2 py-1">?</button>
      </div>
      <div className="p-6 space-y-6">
        {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">{success}</p>}
        <section><h3 className="font-semibold text-stone-700 mb-3">Parish members</h3>
          {loading ? <p className="text-sm text-stone-500">Loading members?</p> : members.length === 0 ? <p className="text-sm text-stone-500">No members found.</p> :
            <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">{members.map(member => {
              const lastAdmin = member.role === "admin" && members.filter(m => m.role === "admin" && m.account_id !== null).length <= 1;
              return <div key={member.id} className="p-3 flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[180px]"><p className="text-sm text-stone-700 break-all">{member.email}</p><p className="text-xs text-stone-400 mt-1">{member.status === "pending" ? "Invitation pending" : "Active member"}{lastAdmin ? " ? Last administrator" : ""}</p></div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${badges[member.role]}`}>{member.role}</span>
                <select aria-label={`Role for ${member.email}`} disabled={busy || lastAdmin} value={member.role} onChange={e => setConfirmation({ member, role: e.target.value as ParishRole })} className="border border-stone-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-50">
                  <option value="admin" disabled={member.status === "pending"}>Admin</option><option value="editor">Editor / Technician</option><option value="viewer">Viewer</option>
                </select>
                <button disabled={busy || lastAdmin} onClick={() => setConfirmation({ member })} className="text-xs text-red-600 disabled:opacity-40">Remove Member</button>
              </div>;
            })}</div>}
        </section>
        {confirmation && <div className="border border-amber-200 bg-amber-50 p-4 rounded-xl text-sm">
          <p>{confirmation.role ? `Change ${confirmation.member.email} to ${confirmation.role}?` : `Remove ${confirmation.member.email} from this parish?`} {confirmation.member.role === "admin" && "This removes administrator permissions."}</p>
          <div className="flex gap-3 mt-3"><button disabled={busy} onClick={() => mutate(() => confirmation.role ? memberApi.changeRole(parishId, confirmation.member.id, confirmation.role) : memberApi.remove(parishId, confirmation.member.id), confirmation.role ? "Member role updated." : "Member removed.")} className="bg-stone-800 text-white px-3 py-2 rounded-lg disabled:opacity-50">{busy ? "Saving?" : "Confirm"}</button><button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button></div>
        </div>}
        <section className="border-t border-stone-100 pt-5"><h3 className="font-semibold text-stone-700 mb-1">Invite a member</h3><p className="text-xs text-stone-500 mb-3">The recipient must sign in with the invited email address.</p>
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <input required type="email" aria-label="Invitation email" value={email} onChange={e => setEmail(e.target.value)} placeholder="member@example.com" className="flex-1 min-w-[180px] border border-stone-300 rounded-lg px-3 py-2 text-sm" />
            <select aria-label="Invitation role" value={role} onChange={e => setRole(e.target.value as "editor" | "viewer")} className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"><option value="viewer">Viewer</option><option value="editor">Editor / Technician</option></select>
            <button disabled={busy || loading} className="bg-stone-800 text-white rounded-lg px-3 py-2 text-sm disabled:opacity-50">{busy ? "Working?" : "Generate Invitation"}</button>
          </form>
          {link && <div className="mt-3 bg-stone-50 rounded-lg p-3"><label className="text-xs text-stone-500">Invitation link</label><div className="flex gap-2 mt-1"><input aria-label="Generated invitation link" readOnly value={link} onFocus={e => e.target.select()} className="flex-1 min-w-0 border border-stone-200 rounded-lg px-2 py-2 text-xs" /><button onClick={async () => { try { await navigator.clipboard.writeText(link); setSuccess("Invitation link copied."); } catch { setError("Copy unavailable. Select and copy the link manually."); } }} className="text-sm text-blue-700 font-medium">Copy link</button></div></div>}
        </section>
      </div>
    </div>
  </div>;
}
