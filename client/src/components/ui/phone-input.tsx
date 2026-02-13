import { IMaskInput } from "react-imask";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function PhoneInput({ value, onChange, className, placeholder }: PhoneInputProps) {
  return (
    <IMaskInput
      mask="+{7} (000) 000-00-00"
      value={value}
      unmask={false}
      onAccept={(val: string) => onChange(val)}
      placeholder={placeholder || "+7 (___) ___-__-__"}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}