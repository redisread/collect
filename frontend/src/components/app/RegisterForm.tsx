import { useState } from "react";
import { signUp } from "@/lib/auth-client";

export default function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要 8 位");
      return;
    }

    setLoading(true);
    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        setError(result.error.message ?? "注册失败");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--bg-main)]">
      <div className="w-full max-w-sm px-6 py-8">
        <img src="/collect.svg" width="48" height="48" alt="" className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-center mb-2 text-[var(--text-primary)]">Collect</h1>
        <p className="text-sm text-center text-[var(--text-tertiary)] mb-8">创建新账号</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="registerform-name" className="block text-sm text-[var(--text-secondary)] mb-1">用户名</label>
            <input
              type="text"
              id="registerform-name"
              aria-describedby={error ? "registerform-error" : undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="min-h-11 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-base outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="registerform-email" className="block text-sm text-[var(--text-secondary)] mb-1">邮箱</label>
            <input
              type="email"
              id="registerform-email"
              aria-describedby={error ? "registerform-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="min-h-11 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-base outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="registerform-password" className="block text-sm text-[var(--text-secondary)] mb-1">密码</label>
            <input
              type="password"
              id="registerform-password"
              aria-describedby={error ? "registerform-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="min-h-11 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-base outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="registerform-confirmPassword" className="block text-sm text-[var(--text-secondary)] mb-1">确认密码</label>
            <input
              type="password"
              id="registerform-confirmPassword"
              aria-describedby={error ? "registerform-error" : undefined}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="min-h-11 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] text-base outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {error && (
            <p id="registerform-error" role="alert" className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "注册中..." : "注册"}
          </button>
        </form>

        <p className="text-sm text-center text-[var(--text-tertiary)] mt-6">
          已有账号？{" "}
          <a href="/login" className="text-[var(--accent)] hover:underline">
            去登录
          </a>
        </p>
      </div>
    </div>
  );
}
