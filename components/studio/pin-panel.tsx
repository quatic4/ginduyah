"use client";
import { useEffect, useState } from "react";

type Props = { configured: boolean; busy: boolean; error: string; retryAt: number; onUnlock: (pin: string) => Promise<void> };

export function PinPanel({ configured, busy, error, retryAt, onUnlock }: Props) {
  const [pin, setPin] = useState("");
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  return <div className="setup-card pin-card">
    <span className="pin-icon" aria-hidden="true">▦</span>
    <p className="studio-eyebrow">TEAM STUDIO</p>
    <h1>A space for the crew.</h1>
    <p id="pin-help">Enter the shared PIN to open your team’s board.</p>
    <form className="pin-form" onSubmit={event => {
      event.preventDefault();
      if (busy || remaining > 0 || !configured || !/^[0-9]{3,12}$/.test(pin)) return;
      const submitted = pin; setPin(""); void onUnlock(submitted);
    }}>
      <label htmlFor="studio-pin">Team PIN</label>
      <input id="studio-pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{3,12}" minLength={3} maxLength={12} required value={pin} disabled={busy || !configured || remaining > 0} aria-describedby="pin-help pin-status" autoFocus onChange={event => setPin(event.target.value.replace(/\D/g, ""))} />
      <div id="pin-status">{error && <p className="studio-error" role="alert">{error}</p>}{remaining > 0 && <p className="detail-hint" role="status">Try again in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}.</p>}{!configured && <p className="studio-error" role="alert">Team studio is being connected. Please try again shortly.</p>}</div>
      <button className="primary" type="submit" disabled={busy || !configured || remaining > 0 || pin.length < 3}>{busy ? "Opening studio…" : "Open team studio →"}</button>
    </form>
    <p className="detail-hint">One shared PIN. No account needed.</p>
  </div>;
}
