import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import type { useAuth } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";

type AuthApi = ReturnType<typeof useAuth>;
type Mode = "signin" | "signup" | "reset" | "update";

function Brand() {
  return <div className="brand-lockup"><BrandMark /><span><strong>REPBOOK</strong><small>TRAINING JOURNAL</small></span></div>;
}

export default function AuthGate({ auth, forcePasswordUpdate = false }: { auth: AuthApi; forcePasswordUpdate?: boolean }) {
  const [mode, setMode] = useState<Mode>(forcePasswordUpdate ? "update" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (forcePasswordUpdate) setMode("update");
  }, [forcePasswordUpdate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setFormError("");
    try {
      if (mode === "signin") {
        await auth.signIn(email, password);
      } else if (mode === "signup") {
        const result = await auth.signUp(email, password);
        setMessage(result.confirmationRequired
          ? "Check your email to confirm your account, then return here to sign in."
          : "Your account is ready. Your training stays in your own account.");
      } else if (mode === "reset") {
        await auth.resetPassword(email);
        setMessage("If that address belongs to an account, a password-reset link is on its way.");
      } else {
        await auth.updatePassword(password);
        setMessage("Password updated. Your account is ready.");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We couldn't complete that request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup"
    ? <>Make a space<br /><span>for progress.</span></>
    : mode === "reset" || mode === "update"
      ? <>Get back<br /><span>to your log.</span></>
      : <>Last time is<br /><span>right here.</span></>;
  const submitLabel = mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "update" ? "Save new password" : "Sign in";
  const showEmail = mode !== "update";
  const showPassword = mode !== "reset";

  return (
    <main className="auth-page">
      <div className="auth-paper">
        <Brand />
        <div className="auth-mark-large"><BrandMark /></div>
        <p className="eyebrow">YOUR TRAINING, ON RECORD</p>
        <h1>{title}</h1>
        <p className="auth-copy">Keep every set, rep, and check-in in one place. Your account syncs across devices, and this browser keeps an offline copy.</p>
        {!auth.isConfigured ? (
          <div className="auth-config-warning" role="alert">This deployment needs its Supabase URL and publishable key before sign-in can be enabled.</div>
        ) : (
          <form className="auth-form" onSubmit={event => void submit(event)}>
            {showEmail && <label className="field-block"><span>Email</span><input autoComplete="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required /></label>}
            {showPassword && <label className="field-block"><span>{mode === "update" ? "New password" : "Password"}</span><input autoComplete={mode === "signup" || mode === "update" ? "new-password" : "current-password"} type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} placeholder={mode === "signup" || mode === "update" ? "At least 8 characters" : "Your password"} required /></label>}
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="button button-primary auth-button" type="submit" disabled={busy || !auth.isConfigured}>
              {busy ? <LoaderCircle className="spin" size={18} /> : mode === "reset" ? <Mail size={16} /> : null}
              <span>{busy ? "Working…" : submitLabel}</span>
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>
        )}
        {!forcePasswordUpdate && <div className="auth-links">
          {mode === "signin" && <button className="text-action" type="button" onClick={() => { setMode("reset"); setMessage(""); setFormError(""); }}>Forgot password?</button>}
          {mode !== "signin" && <button className="text-action" type="button" onClick={() => { setMode("signin"); setMessage(""); setFormError(""); }}>Back to sign in</button>}
          {mode === "signin" && <button className="text-action" type="button" onClick={() => { setMode("signup"); setMessage(""); setFormError(""); }}>Create an account</button>}
          {mode === "signup" && <button className="text-action" type="button" onClick={() => { setMode("signin"); setMessage(""); setFormError(""); }}>Already have an account?</button>}
        </div>}
        <div className="auth-footnote"><span className="mini-ledger">✓</span> Private to your account · local-first · built for the gym floor</div>
      </div>
      <div className="auth-side-note"><span>01 / KEEP THE DETAILS</span><span>RECORD IT. REPEAT IT. PROGRESS.</span></div>
    </main>
  );
}
