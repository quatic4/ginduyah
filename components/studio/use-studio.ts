"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getStudioClient } from "@/lib/studio/client";
import { mutatePreview, previewSnapshot } from "@/lib/studio/preview";
import { torontoDate, type Operation, type Snapshot } from "@/lib/studio/types";

export function useStudio() {
  const [client] = useState(getStudioClient);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!client);
  const [recovery, setRecovery] = useState(false);
  const [preview, setPreview] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [teamId, setTeamId] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setUser(session?.user ?? null); setAuthReady(true);
    });
    client.auth.getSession().then(({ data: session, error }) => {
      if (active) { setUser(session.session?.user ?? null); setAuthReady(true); if (error) setError(error.message); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!client || preview) return;
    let active = true;
    generation.current++;
    setData(null); setTeamId(""); setWorkspaces([]); setLastSync(null); setError("");
    if (!user) return;
    setLoading(true);
    client.rpc("studio_list_workspaces").then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) { setError(error.message.includes("function") ? "The team database needs its one-time setup before you can create a workspace." : error.message); return; }
      const teams = data as { id: string; name: string }[];
      setWorkspaces(teams);
      let saved = "";
      try { saved = localStorage.getItem(`ginduyah-team-${user.id}`) || ""; } catch { /* Storage is optional. */ }
      setTeamId(teams.find(t => t.id === saved)?.id || teams[0]?.id || "");
    });
    return () => { active = false; };
  }, [client, user?.id, preview]); // Identity changes, not token refreshes, reset the board.

  const refresh = useCallback(async () => {
    if (!client || !teamId || preview) return;
    const request = ++generation.current;
    const result = await client.rpc("studio_snapshot", { team_id: teamId });
    if (request !== generation.current) return;
    setLoading(false);
    if (result.error) {
      setSyncFailed(true); setError(result.error.message);
      if (result.error.message.includes("access")) setData(null);
    } else { setData(result.data as Snapshot); setLastSync(new Date().toISOString()); setSyncFailed(false); }
  }, [client, teamId, preview]);

  useEffect(() => {
    if (!teamId || preview) return;
    setData(null); setLoading(true); setError("");
    if (user) { try { localStorage.setItem(`ginduyah-team-${user.id}`, teamId); } catch { /* Optional. */ } }
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { generation.current++; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [teamId, preview, refresh, user?.id]);

  async function mutate(operation: Operation, payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      if (preview && data) setData(mutatePreview(data, operation, payload));
      else if (client && teamId) {
        generation.current++; // Invalidate an older background read.
        const result = await client.rpc("studio_mutate", { team_id: teamId, operation, payload });
        if (result.error) throw result.error;
        await refresh();
      } else throw new Error("Sign in to save this change.");
      return true;
    } catch (e) { setError(e && typeof e === "object" && "message" in e ? String(e.message) : "Couldn't save. Please try again."); return false; }
    finally { setBusy(false); }
  }

  async function setup(mode: "create" | "join", name: string, value: string) {
    if (!client || busy) return;
    setBusy(true); setError("");
    const result = mode === "create" ? await client.rpc("studio_create_workspace", { team_name: value, member_name: name }) : await client.rpc("studio_join_workspace", { invite: value, member_name: name });
    if (result.error) setError(result.error.message);
    else {
      const teams = await client.rpc("studio_list_workspaces");
      if (teams.error) setError(teams.error.message);
      else setWorkspaces(teams.data);
      setTeamId(result.data);
    }
    setBusy(false);
  }

  function startPreview() { generation.current++; setPreview(true); setData(previewSnapshot(torontoDate())); setError(""); setLoading(false); }
  function endPreview() { setPreview(false); setData(null); setError(""); }
  async function signOut() {
    if (!client) return;
    const result = await client.auth.signOut();
    if (result.error) setError(result.error.message);
    else { generation.current++; setData(null); setWorkspaces([]); setTeamId(""); setUser(null); }
  }
  return { configured: Boolean(client), user, authReady, recovery, setRecovery, preview, startPreview, endPreview, workspaces, teamId, setTeamId, data, loading, busy, error, setError, lastSync, syncFailed, refresh, mutate, setup, signOut, actorId: preview ? "preview-you" : user?.id || "" };
}
