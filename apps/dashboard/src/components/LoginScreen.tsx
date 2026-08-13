"use client";

type LoginScreenProps = {
  username: string;
  password: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
};

export default function LoginScreen({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  loading,
  error,
}: LoginScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <main className="w-full max-w-sm">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-sky-700">
          Distribuidor · Dashboard Admin
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="mt-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h2 className="text-xl font-semibold">Login admin</h2>
          <p className="mt-2 text-sm text-slate-600">
            Inicia sesion para acceder a ventas, auditoria y gastos.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="text-sm text-slate-600">
              Usuario
              <input
                type="text"
                value={username}
                autoComplete="username"
                autoFocus
                onChange={(event) => onUsernameChange(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600">
              Password
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => onPasswordChange(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        </form>
      </main>
    </div>
  );
}
