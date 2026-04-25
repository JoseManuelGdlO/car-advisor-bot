import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PhoneFrame } from "@/components/PhoneFrame";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
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
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/context/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import { PushBridge } from "@/mobile/PushBridge";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <PushBridge />
          <PhoneFrame>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/clientes" element={<RequireAuth><Clientes /></RequireAuth>} />
              <Route path="/cliente/:id" element={<RequireAuth><ClienteDetalle /></RequireAuth>} />
              <Route path="/chats" element={<RequireAuth><Conversaciones /></RequireAuth>} />
              <Route path="/chat/:id" element={<RequireAuth><ChatDetalle /></RequireAuth>} />
              <Route path="/config" element={<RequireAuth><Configuracion /></RequireAuth>} />
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
              <Route path="/perfil" element={<RequireAuth><Perfil /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PhoneFrame>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
