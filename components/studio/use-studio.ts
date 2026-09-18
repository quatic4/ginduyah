"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStudioClient } from "@/lib/studio/client";
import type { Operation, Snapshot } from "@/lib/studio/types";

const IDENTITY_KEY = "ginduyah-shared-member-v1";
const SESSION_KEY = "ginduyah-studio-session-v1";
const messageOf = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "Couldn't connect. Please try again.";
const sessionEnded = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "28000");
type PinSession = { access_token: string; expires_at: string };

export function useStudio() {
  const [client] = useState(getStudioClient);
  const [session, setSession] = useState<PinSession | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const token = useRef("");
  const generation = useRef(0);
  const saving = useRef(false);
  const unlocking = useRef(false);
  const reading = useRef<number | null>(null);
  const actorId = data?.members.some(m => m.user_id === selectedId && m.active) ? selectedId : "";

  const clearSession = useCallback((message = "") => {
    generation.current++; token.current = ""; reading.current = null;
    setSession(null); setData(null); setLastSync(null); setSyncFailed(false); setLoading(false); setError(message);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Memory-only sessions still work. */ }
  }, []);

  useEffect(() => {
    try { setSelectedId(localStorage.getItem(IDENTITY_KEY) || ""); } catch { /* Optional name preference only. */ }
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as PinSession | null;
      if (client && saved && /^[0-9a-f]{64}$/.test(saved.access_token) && Date.parse(saved.expires_at) > Date.now()) {
        token.current = saved.access_token; setSession(saved);
      } else { sessionStorage.removeItem(SESSION_KEY); setLoading(false); }
    } catch { setLoading(false); }
  }, [client]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => clearSession("Your session ended. Enter the team PIN again."), Math.max(0, Date.parse(session.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session, clearSession]);

  const acceptSnapshot = useCallback((next: Snapshot) => {
    // A slow read must never replace a more recent committed snapshot.
    setData(previous => !previous || next.workspace.revision >= previous.workspace.revision ? next : previous);
    setLastSync(new Date().toISOString()); setSyncFailed(false);
  }, []);

  const refresh = useCallback(async () => {
    const accessToken = token.current;
    if (!client || !accessToken || saving.current || reading.current !== null) return;
    const request = ++generation.current;
    reading.current = request;
    try {
      const result = await client.rpc("studio_pin_snapshot", { access_token: accessToken }).abortSignal(AbortSignal.timeout(15000));
      if (request !== generation.current || token.current !== accessToken) return;
      if (result.error) throw result.error;
      acceptSnapshot(result.data as Snapshot);
    } catch (error) {
      if (request !== generation.current || token.current !== accessToken) return;
      if (sessionEnded(error)) clearSession(messageOf(error));
      else setSyncFailed(true);
    } finally {
      if (reading.current === request) reading.current = null;
      if (request === generation.current) setLoading(false);
    }
  }, [client, acceptSnapshot, clearSession]);

  useEffect(() => {
    if (!client || !session) return;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible); window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++; reading.current = null; window.clearInterval(timer);
      window.removeEventListener("focus", visible); window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, session, refresh]);

  async function unlock(pin: string) {
    if (!client || unlocking.current || Date.now() < retryAt) return;
    unlocking.current = true; setBusy(true); setError("");
    const request = ++generation.current;
    try {
      const result = await client.rpc("studio_pin_unlock", { pin }).abortSignal(AbortSignal.timeout(15000));
      if (request !== generation.current) return;
      if (result.error) throw new Error("Couldn't unlock the studio. Please try again shortly.");
      if (!result.data?.ok) {
        setError(result.data?.error || "Couldn't unlock the studio.");
        setRetryAt(Date.now() + Math.min(900, Math.max(0, Number(result.data?.retry_after) || 0)) * 1000);
        return;
      }
      const next = { access_token: String(result.data.access_token), expires_at: String(result.data.expires_at) };
      if (!/^[0-9a-f]{64}$/.test(next.access_token) || !(Date.parse(next.expires_at) > Date.now())) throw new Error("Couldn't start a studio session.");
      token.current = next.access_token; setSession(next); setLoading(true); setRetryAt(0);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* Keep session in memory when storage is disabled. */ }
    } catch (error) { if (request === generation.current) setError(messageOf(error)); }
    finally { unlocking.current = false; setBusy(false); }
  }

  async function lock() {
    const accessToken = token.current;
    clearSession();
    // Clear the board immediately, even if revocation cannot reach the server.
    if (client && accessToken) {
      try { await client.rpc("studio_pin_lock", { access_token: accessToken }).abortSignal(AbortSignal.timeout(10000)); } catch { /* The local session is already gone. */ }
    }
  }

  function selectMember(id: string) {
    setSelectedId(id); setError("");
    try { localStorage.setItem(IDENTITY_KEY, id); } catch { /* Optional. */ }
  }

  async function mutate(operation: Operation, payload: Record<string, unknown>) {
    if (saving.current) return false;
    const accessToken = token.current;
    if (!client || !accessToken) { clearSession("Enter the team PIN to make changes."); return false; }
    if (!actorId) { setError("Choose your name before saving a change."); return false; }
    saving.current = true; setBusy(true); setError("");
    const request = ++generation.current;
    try {
      const result = await client.rpc("studio_pin_mutate", { access_token: accessToken, actor_id: actorId, operation, payload }).abortSignal(AbortSignal.timeout(20000));
      if (request !== generation.current || token.current !== accessToken) return false;
      if (result.error) throw result.error;
      acceptSnapshot(result.data as Snapshot);
      return true;
    } catch (error) {
      if (request !== generation.current || token.current !== accessToken) return false;
      if (sessionEnded(error)) clearSession(messageOf(error));
      else {
        setError(`${messageOf(error)} If the connection dropped, refresh to check whether it saved before retrying.`);
        saving.current = false; await refresh();
      }
      return false;
    } finally { saving.current = false; setBusy(false); }
  }

  return { configured: Boolean(client), unlocked: Boolean(session), unlock, lock, retryAt, data, loading, busy, error, setError, lastSync, syncFailed, refresh, mutate, actorId, selectMember };
}
