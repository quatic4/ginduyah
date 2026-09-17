"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStudioClient } from "@/lib/studio/client";
import { mutatePreview, previewSnapshot } from "@/lib/studio/preview";
import { torontoDate, type Operation, type Snapshot } from "@/lib/studio/types";

const IDENTITY_KEY = "ginduyah-shared-member-v1";
const messageOf = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "Couldn't connect. Please try again.";

export function useStudio() {
  const [client] = useState(getStudioClient);
  const [preview, setPreview] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const reading = useRef(false);
  const actorId = data?.members.some(m => m.user_id === selectedId && m.active) ? selectedId : "";

  useEffect(() => {
    try { setSelectedId(localStorage.getItem(IDENTITY_KEY) || ""); } catch { /* Optional name preference only. */ }
  }, []);

  const acceptSnapshot = useCallback((next: Snapshot) => {
    // A slow read must never replace a more recent committed snapshot.
    setData(previous => !previous || next.workspace.revision >= previous.workspace.revision ? next : previous);
    setLastSync(new Date().toISOString()); setSyncFailed(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!client || preview || saving.current || reading.current) return;
    reading.current = true;
    const request = ++generation.current;
    try {
      const result = await client.rpc("studio_shared_snapshot").abortSignal(AbortSignal.timeout(15000));
      if (request !== generation.current) return;
      if (result.error) throw result.error;
      acceptSnapshot(result.data as Snapshot);
    } catch {
      if (request === generation.current) setSyncFailed(true);
    } finally { reading.current = false; if (request === generation.current) setLoading(false); }
  }, [client, preview, acceptSnapshot]);

  useEffect(() => {
    if (preview || !client) return;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++; window.clearInterval(timer);
      window.removeEventListener("focus", visible); window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, preview, refresh]);

  function selectMember(id: string) {
    setSelectedId(id); setError("");
    if (!preview) { try { localStorage.setItem(IDENTITY_KEY, id); } catch { /* Optional. */ } }
  }

  async function mutate(operation: Operation, payload: Record<string, unknown>) {
    if (saving.current) return false;
    if (!actorId) { setError("Choose your name before saving a change."); return false; }
    saving.current = true; setBusy(true); setError(""); generation.current++;
    try {
      if (preview && data) setData(mutatePreview(data, operation, payload, actorId));
      else if (client) {
        const result = await client.rpc("studio_shared_mutate", { actor_id: actorId, operation, payload }).abortSignal(AbortSignal.timeout(20000));
        if (result.error) throw result.error;
        acceptSnapshot(result.data as Snapshot);
      } else throw new Error("Shared storage is not connected yet.");
      return true;
    } catch (error) {
      setError(`${messageOf(error)} If the connection dropped, refresh to check whether it saved before retrying.`);
      saving.current = false;
      await refresh();
      return false;
    } finally { saving.current = false; setBusy(false); }
  }

  function startPreview() {
    generation.current++; setPreview(true); setData(previewSnapshot(torontoDate()));
    setSelectedId("preview-you"); setError(""); setLoading(false);
  }
  function endPreview() {
    generation.current++; setPreview(false); setData(null); setError(""); setLastSync(null); setLoading(Boolean(client));
    try { setSelectedId(localStorage.getItem(IDENTITY_KEY) || ""); } catch { setSelectedId(""); }
  }
  return { configured: Boolean(client), preview, startPreview, endPreview, data, loading, busy, error, setError, lastSync, syncFailed, refresh, mutate, actorId, selectMember };
}
