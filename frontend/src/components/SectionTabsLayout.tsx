import { createContext, useContext, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BrowserTabs, type BrowserTab } from "@/components/BrowserTabs";
import { useConversationsQuery } from "@/hooks/useConversationsQuery";

const ToolbarSlotContext = createContext<HTMLDivElement | null | undefined>(undefined);

export function useToolbarSlot() {
  return useContext(ToolbarSlotContext);
}

export function SectionTabsLayout({ tabs, label }: { tabs: BrowserTab[]; label: string }) {
  const location = useLocation();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  return (
    <ToolbarSlotContext.Provider value={slot}>
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur">
        <BrowserTabs tabs={tabs} label={label} pathname={location.pathname} />
        <div ref={setSlot} />
      </div>
      <div key={location.pathname} className="tab-panel">
        <Outlet />
      </div>
    </ToolbarSlotContext.Provider>
  );
}

export function ChatsSectionLayout() {
  const { data } = useConversationsQuery();
  const unread = ((data || []) as { unread?: number }[]).reduce((acc, conversation) => acc + (Number(conversation.unread) || 0), 0);

  return (
    <SectionTabsLayout
      label="Chats"
      tabs={[
        { to: "/chats", label: "Conversaciones", badge: unread, match: (pathname) => pathname === "/chats" },
        { to: "/clientes", label: "Clientes", match: (pathname) => pathname.startsWith("/clientes") },
      ]}
    />
  );
}

export function AccountSectionLayout() {
  return (
    <SectionTabsLayout
      label="Cuenta"
      tabs={[
        { to: "/perfil", label: "Perfil", match: (pathname) => pathname === "/perfil" },
        { to: "/config", label: "Configuración", match: (pathname) => pathname === "/config" },
      ]}
    />
  );
}
