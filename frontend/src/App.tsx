import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PhoneFrame } from "@/components/PhoneFrame";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Clientes from "./pages/Clientes.tsx";
import ClienteDetalle from "./pages/ClienteDetalle.tsx";
import Conversaciones from "./pages/Conversaciones.tsx";
import ChatDetalle from "./pages/ChatDetalle.tsx";
import Configuracion from "./pages/Configuracion.tsx";
import ConfigFaqs from "./pages/ConfigFaqs.tsx";
import ConfigFinanciamiento from "./pages/ConfigFinanciamiento.tsx";
import ConfigProductos from "./pages/ConfigProductos.tsx";
import ConfigPromos from "./pages/ConfigPromos.tsx";
import ConfigBot from "./pages/ConfigBot.tsx";
import ConfigComportamientoBot from "./pages/ConfigComportamientoBot.tsx";
import Vehiculos from "./pages/Vehiculos.tsx";
import Perfil from "./pages/Perfil.tsx";
import Integraciones from "./pages/Integraciones.tsx";
import ConfigNotificaciones from "./pages/ConfigNotificaciones.tsx";
import Privacidad from "./pages/Privacidad.tsx";
import Terminos from "./pages/Terminos.tsx";
import EliminarDatos from "./pages/EliminarDatos.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/context/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import { GuestOnly } from "@/components/GuestOnly";
import { PushBridge } from "@/mobile/PushBridge";
import { DelayedQueryLoadingOverlay } from "@/components/DelayedQueryLoadingOverlay";
import { AccountSectionLayout, ChatsSectionLayout } from "@/components/SectionTabsLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DelayedQueryLoadingOverlay />
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <PushBridge />
          <PhoneFrame>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
              <Route path="/reset-password" element={<GuestOnly><ResetPassword /></GuestOnly>} />
              <Route path="/privacidad" element={<Privacidad />} />
              <Route path="/terminos" element={<Terminos />} />
              <Route path="/eliminar-datos" element={<EliminarDatos />} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route element={<RequireAuth><ChatsSectionLayout /></RequireAuth>}>
                <Route path="/chats" element={<Conversaciones />} />
                <Route path="/clientes" element={<Clientes />} />
              </Route>
              <Route path="/cliente/:id" element={<RequireAuth><ClienteDetalle /></RequireAuth>} />
              <Route path="/chat/:id" element={<RequireAuth><ChatDetalle /></RequireAuth>} />
              <Route element={<RequireAuth><AccountSectionLayout /></RequireAuth>}>
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/config" element={<Configuracion />} />
              </Route>
              <Route path="/config/faqs" element={<RequireAuth><ConfigFaqs /></RequireAuth>} />
              <Route path="/config/bot" element={<RequireAuth><ConfigBot /></RequireAuth>} />
              <Route path="/config/comportamiento-bot" element={<RequireAuth><ConfigComportamientoBot /></RequireAuth>} />
              <Route path="/vehiculos" element={<RequireAuth><Vehiculos /></RequireAuth>} />
              <Route path="/vehiculos/productos" element={<RequireAuth><ConfigProductos /></RequireAuth>} />
              <Route path="/vehiculos/financiamiento" element={<RequireAuth><ConfigFinanciamiento /></RequireAuth>} />
              <Route path="/vehiculos/promociones" element={<RequireAuth><ConfigPromos /></RequireAuth>} />
              <Route path="/config/productos" element={<RequireAuth><Navigate to="/vehiculos/productos" replace /></RequireAuth>} />
              <Route path="/config/financiamiento" element={<RequireAuth><Navigate to="/vehiculos/financiamiento" replace /></RequireAuth>} />
              <Route path="/config/promociones" element={<RequireAuth><Navigate to="/vehiculos/promociones" replace /></RequireAuth>} />
              <Route path="/perfil/integraciones" element={<RequireAuth><Integraciones /></RequireAuth>} />
              <Route path="/perfil/notificaciones" element={<RequireAuth><ConfigNotificaciones /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PhoneFrame>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
