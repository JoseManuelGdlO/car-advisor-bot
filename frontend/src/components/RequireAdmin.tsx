import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { SELLER_FALLBACK_PATH } from "@/lib/roles";

/** Gate de UI para rutas de admin. Debe ir dentro de RequireAuth (el backend valida igualmente con 403). */
export function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to={SELLER_FALLBACK_PATH} replace />;
}
