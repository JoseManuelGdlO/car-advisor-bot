import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AuthBootstrapGate } from "@/components/AuthBootstrapGate";

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { token } = useAuth();

  return (
    <AuthBootstrapGate>
      {token ? children : <Navigate to="/login" replace />}
    </AuthBootstrapGate>
  );
}
