import { Facebook, MessageCircle } from "lucide-react";
import { Channel } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface ChannelIconProps {
  channel: Channel;
  size?: number;
  className?: string;
}

export const ChannelIcon = ({ channel, size = 14, className }: ChannelIconProps) => {
  if (channel === "whatsapp") {
    return (
      <span
        className={cn("inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground", className)}
        style={{ width: size + 8, height: size + 8 }}
        aria-label="WhatsApp"
      >
        <MessageCircle style={{ width: size, height: size }} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full bg-info text-info-foreground", className)}
      style={{ width: size + 8, height: size + 8 }}
      aria-label="Facebook Messenger"
    >
      <Facebook style={{ width: size, height: size }} strokeWidth={2.5} />
    </span>
  );
};
