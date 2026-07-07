import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AuthBootstrapGate } from "@/components/AuthBootstrapGate";

export function GuestOnly({ children }: { children: JSX.Element }) {
  const { token } = useAuth();

  return (
    <AuthBootstrapGate>
      {token ? <Navigate to="/dashboard" replace /> : children}
    </AuthBootstrapGate>
  );
}
