import React from "react";

const base =
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

const variants = {
  default: "bg-[#8f6075] text-white hover:bg-[#71485b]",
  outline: "border border-current bg-transparent",
  ghost: "bg-transparent hover:bg-black/5",
};

const sizes = {
  default: "h-10 px-4 py-2",
  icon: "h-10 w-10",
};

export function Button({ className = "", variant = "default", size = "default", children, ...props }) {
  const variantClass = variants[variant] || variants.default;
  const sizeClass = sizes[size] || sizes.default;
  return (
    <button className={`${base} ${variantClass} ${sizeClass} ${className}`} {...props}>
      {children}
    </button>
  );
}
