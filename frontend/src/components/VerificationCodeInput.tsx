import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;

type VerificationCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-describedby"?: string;
};

function CodeSlot({ index }: { index: number }) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext.slots[index];

  return (
    <div
      className={cn(
        "relative flex h-12 w-11 items-center justify-center rounded-xl border bg-background text-xl font-semibold text-primary transition-all",
        isActive ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      {char ? <span aria-hidden="true">•</span> : null}
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink h-5 w-px bg-primary duration-1000" />
        </div>
      ) : null}
    </div>
  );
}

export function VerificationCodeInput({
  value,
  onChange,
  disabled,
  invalid,
  id,
  "aria-describedby": ariaDescribedBy,
}: VerificationCodeInputProps) {
  return (
    <OTPInput
      id={id}
      maxLength={CODE_LENGTH}
      value={value}
      onChange={onChange}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-invalid={invalid}
      aria-describedby={ariaDescribedBy}
      containerClassName={cn("flex justify-center gap-2", invalid && "[&>div]:border-destructive")}
      className="disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2">
        {Array.from({ length: CODE_LENGTH }).map((_, index) => (
          <CodeSlot key={index} index={index} />
        ))}
      </div>
    </OTPInput>
  );
}
