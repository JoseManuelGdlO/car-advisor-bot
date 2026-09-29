import { Link, Navigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { authPillBlack, authPillWhite } from "@/components/AuthShell";
import { AuthBootstrapGate } from "@/components/AuthBootstrapGate";
import { useAuth } from "@/context/AuthContext";

function Welcome() {
  return (
    <div className="relative flex h-full min-h-full flex-col overflow-hidden text-white">
      <div className="lava-field" aria-hidden>
        <span className="lava-blob lava-blob-a" />
        <span className="lava-blob lava-blob-b" />
        <span className="lava-blob lava-blob-c" />
        <span className="lava-blob lava-blob-d" />
      </div>

      <div className="relative z-10 flex h-full min-h-full flex-col px-6 pb-8 pt-8">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="grid h-36 w-36 place-items-center rounded-[2.25rem] border border-white/40 bg-white/10 shadow-[0_24px_50px_-28px_hsl(160_40%_4%/0.7)]">
            <Bot className="h-[4.5rem] w-[4.5rem]" strokeWidth={1.75} />
          </div>
          <p className="mt-5 text-[1.85rem] font-semibold tracking-tight">AutoBot</p>
          <h1 className="mt-6 max-w-[14ch] text-[1.85rem] font-semibold leading-[1.08] tracking-[-0.03em] text-balance">
            Atiende el lote sin salir del chat.
          </h1>
          <p className="mt-3 max-w-[26ch] text-[15px] leading-relaxed text-white/80">
            El bot contesta por WhatsApp. Tú entras cuando el cliente ya quiere ver el coche.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link to="/login" className={authPillBlack}>
            Entrar
          </Link>
          <Link to="/registro" className={authPillWhite}>
            Crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}

const Index = () => {
  const { token } = useAuth();

  return (
    <AuthBootstrapGate>
      {token ? <Navigate to="/dashboard" replace /> : <Welcome />}
    </AuthBootstrapGate>
  );
};

export default Index;
