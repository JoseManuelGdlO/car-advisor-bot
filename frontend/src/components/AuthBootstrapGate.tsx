import { useAuth } from "@/context/AuthContext";

export function AuthBootstrapGate({ children }: { children: React.ReactNode }) {
  const { authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-full grid place-items-center bg-background text-muted-foreground">
        <p className="text-sm">Cargando sesión…</p>
      </div>
    );
  }

  return <>{children}</>;
}
