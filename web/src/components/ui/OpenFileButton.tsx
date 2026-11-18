import { useRef, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn, isJsonFile } from "../../lib/utils";
import { useModelStore } from "../../store/useModelStore";

interface OpenFileButtonProps {
  className?: string;
  children?: ReactNode;
}

export default function OpenFileButton({
  className,
  children,
}: OpenFileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const loadFromFile = useModelStore((state) => state.loadFromFile);

  return (
    <>
      <button
        type="button"
        className={cn("btn", className)}
        onClick={() => inputRef.current?.click()}
        title="Abrir un archivo JSON de pymas"
        aria-label="Abrir un archivo JSON de pymas"
      >
        {children ?? (
          <>
            <Upload size={13} />
            <span className="hidden sm:inline">Abrir JSON</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && isJsonFile(file)) void loadFromFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
}
