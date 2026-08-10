import React, { useState } from "react";
import { Trash2, Check, X } from "lucide-react";

interface InlineDeleteConfirmProps {
  onConfirm: () => void;
  title?: string;
  disabled?: boolean;
  disabledTitle?: string;
  id?: string;
  buttonClassName?: string;
  size?: "sm" | "md";
  label?: string;
  confirmText?: string;
}

export const InlineDeleteConfirm: React.FC<InlineDeleteConfirmProps> = ({
  onConfirm,
  title = "Delete item",
  disabled = false,
  disabledTitle,
  id,
  buttonClassName,
  size = "md",
  label,
  confirmText = "Confirm?",
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  if (disabled) {
    return (
      <button
        disabled
        type="button"
        title={disabledTitle || "Delete forbidden"}
        className="text-slate-300 bg-slate-50 p-1 rounded border border-slate-100 cursor-not-allowed"
      >
        <Trash2 size={size === "sm" ? 11 : 12} className="opacity-45" />
      </button>
    );
  }

  if (isConfirming) {
    return (
      <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 px-1.5 py-0.5 rounded-lg text-xs font-mono font-bold animate-fade-in shadow-2xs">
        <span className="text-[10px] text-rose-800 font-semibold mr-0.5">{confirmText}</span>
        <button
          id={id ? `${id}-yes` : undefined}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsConfirming(false);
            onConfirm();
          }}
          title="Confirm Delete"
          className="bg-rose-600 hover:bg-rose-700 text-white p-0.5 rounded transition-colors cursor-pointer"
        >
          <Check size={12} />
        </button>
        <button
          id={id ? `${id}-no` : undefined}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsConfirming(false);
          }}
          title="Cancel"
          className="text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 p-0.5 rounded border border-slate-200 transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      id={id}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsConfirming(true);
      }}
      title={title}
      className={
        buttonClassName ||
        "text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1 rounded border border-rose-200 transition-all cursor-pointer"
      }
    >
      {label ? (
        <span className="flex items-center gap-1 text-xs font-semibold">
          <Trash2 size={size === "sm" ? 11 : 12} /> {label}
        </span>
      ) : (
        <Trash2 size={size === "sm" ? 11 : 12} />
      )}
    </button>
  );
};

export default InlineDeleteConfirm;
