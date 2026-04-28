import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Bot } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (isRegisterMode) {
        await register(name, email, pass);
      }
      await login(email, pass, rememberMe);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    }
  };

  return (
    <div className="min-h-full flex flex-col bg-gradient-hero text-primary-foreground">
      {/* Top brand */}
      <div className="px-6 pt-12 pb-8 flex flex-col items-center">
        <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur grid place-items-center mb-4 shadow-elevated">
          <Bot className="w-10 h-10" strokeWidth={2.2} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">AutoBot</h1>
        <p className="text-sm text-primary-foreground/80 mt-1 text-center max-w-xs">
          Vende más autos por WhatsApp y Facebook con tu chatbot inteligente
        </p>
      </div>

      {/* Form card */}
      <div className="flex-1 bg-background text-foreground rounded-t-[2rem] px-6 pt-8 pb-6 shadow-elevated animate-fade-in">
        <h2 className="text-xl font-bold mb-1">Bienvenido de vuelta 👋</h2>
        <p className="text-sm text-muted-foreground mb-6">Inicia sesión para gestionar tus chats</p>

        <form onSubmit={submit} className="space-y-4">
          {isRegisterMode && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email o teléfono</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" className="h-12 rounded-xl" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pass">Contraseña</Label>
            <div className="relative">
              <Input
                id="pass"
                type={show ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl pr-11"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="text-right">
            <button type="button" className="text-xs font-semibold text-primary-dark hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
            <Label htmlFor="remember-me" className="text-sm cursor-pointer">
              Recuérdame
            </Label>
            <Switch
              id="remember-me"
              checked={rememberMe}
              onCheckedChange={setRememberMe}
              aria-label="Activar recordar sesión"
            />
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold shadow-green">
            {isRegisterMode ? "Crear cuenta" : "Entrar"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          ¿Sin cuenta?{" "}
          <button type="button" onClick={() => setIsRegisterMode((v) => !v)} className="text-primary-dark font-semibold hover:underline">
            {isRegisterMode ? "Ya tengo cuenta" : "Crear cuenta"}
          </button>
        </p>
      </div>
    </div>
  );
}
