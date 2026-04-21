import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-9 h-9 text-sm",
  md: "w-11 h-11 text-base",
  lg: "w-16 h-16 text-xl",
};

export const Avatar = ({ name, color, size = "md", className }: AvatarProps) => {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={cn(
        "rounded-full grid place-items-center font-semibold text-white shrink-0 shadow-soft",
        sizeMap[size],
        className
      )}
      style={{ backgroundColor: color ?? "hsl(var(--primary))" }}
    >
      {initials}
    </div>
  );
};
