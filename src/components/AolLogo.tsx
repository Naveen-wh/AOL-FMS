import React from "react";

interface AolLogoProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  lightText?: boolean;
}

export const AolLogo: React.FC<AolLogoProps> = ({ 
  className = "", 
  size = "md",
  lightText = false 
}) => {
  let heightClass = "h-8";
  if (size === "xs") heightClass = "h-5";
  if (size === "sm") heightClass = "h-6";
  if (size === "md") heightClass = "h-8";
  if (size === "lg") heightClass = "h-11";
  if (size === "xl") heightClass = "h-16";

  const textColor = lightText ? "#FFFFFF" : "#18181B";

  return (
    <svg
      viewBox="0 0 340 180"
      className={`${heightClass} w-auto inline-block shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AOL Logo"
    >
      {/* Letter A */}
      <text
        x="42"
        y="126"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="112"
        fill={textColor}
        textAnchor="middle"
      >
        A
      </text>

      {/* Hexagon - Vertically aligned red hexagon */}
      <polygon
        points="170,22 225,55 225,125 170,158 115,125 115,55"
        fill="#B83228"
      />

      {/* Letter O (White ring inside red hexagon) */}
      <circle
        cx="170"
        cy="90"
        r="28"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="13"
      />

      {/* Letter L */}
      <text
        x="292"
        y="126"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="112"
        fill={textColor}
        textAnchor="middle"
      >
        L
      </text>
    </svg>
  );
};

export default AolLogo;
