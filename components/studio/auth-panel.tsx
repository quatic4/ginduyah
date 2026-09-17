"use client";
import { useState, type FormEvent } from "react";
import { getStudioClient } from "@/lib/studio/client";

export function AuthPanel({ configured, onPreview, recovery, onRecovered }: { configured: boolean; onPreview: () => void; recovery: boolean; onRecovered: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError(""); setPending(true);
    const form = new FormData(event.currentTarget);
    const client = getStudioClient();
    if (!client) { setPending(false); return; }
    try {
      const email = String(form.get("email") || "").trim();
      const password = String(form.get("password") || "");
      if (recovery) {
        const result = await client.auth.updateUser({ password });
        if (result.error) throw result.error;
        onRecovered();
      } else if (mode === "signin") {
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
      } else if (mode === "signup") {
        const result = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/studio` } });
        if (result.error) throw result.error;
        if (!result.data.session) setMessage("Check your email to confirm your account, then come back and sign in.");
      } else {
        const result = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/studio` });
        if (result.error) throw result.error;
        setMessage("If an account exists for that email, you’ll receive a password reset link.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't sign in. Please try again."); }
    finally { setPending(false); }
  }
  return <div className="studio-entry">
    <div className="entry-copy"><p className="studio-eyebrow">TEAM STUDIO</p><h1>Less chasing.<br /><span>More finished.</span></h1><p>One board for every channel. See what’s missing, claim your part, and give everyone credit.</p><div className="entry-preview"><div><span className="type-badge comic">Comics</span><strong>1 <small>/ 2 finished</small></strong><div className="mini-progress"><i style={{ width: "50%" }} /></div></div><div><span className="type-badge internet_post">Internet posts</span><strong>0 <small>/ 1 finished</small></strong><div className="mini-progress purple"><i style={{ width: "0%" }} /></div></div><span className="example-caption">Example daily target</span></div><button className="secondary" onClick={onPreview}>Try the board with example content <span aria-hidden="true">↗</span></button></div>
    <div className="auth-card"><p className="studio-eyebrow">YOUR CREW, IN ONE PLACE</p><h2>{recovery ? "Set a new password" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h2><p>{configured ? "Your account keeps your contributions attached to you." : "Team accounts are not connected yet. You can explore the board using the preview."}</p>
      <form onSubmit={submit}>
        {!recovery && <label>Email<input required type="email" name="email" autoComplete="email" disabled={!configured} placeholder="you@example.com" /></label>}
        {(recovery || mode !== "forgot") && <label>Password<input required type="password" name="password" minLength={mode === "signup" || recovery ? 8 : 1} autoComplete={mode === "signup" || recovery ? "new-password" : "current-password"} disabled={!configured} placeholder={mode === "signup" || recovery ? "At least 8 characters" : "Your password"} /></label>}
        {error && <p className="studio-error" role="alert">{error}</p>}{message && <p className="studio-notice" role="status">{message}</p>}
        <button className="primary" disabled={!configured || pending}>{pending ? "Please wait…" : recovery ? "Save password" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      </form>
      {!recovery && <div className="auth-links"><button className="text-button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}>{mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}</button>{mode !== "forgot" && <button className="text-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button>}</div>}
    </div>
  </div>;
}
