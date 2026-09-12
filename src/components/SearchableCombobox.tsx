/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, X, Building2, Package, Plus, ArrowUpDown } from "lucide-react";
import { Product, Client } from "../types";

/**
 * Hook to calculate floating portal position relative to a trigger element
 */
function usePortalPosition(isOpen: boolean, triggerRef: React.RefObject<HTMLElement | null>, minWidth = 300) {
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placeAbove: boolean;
  }>({
    top: 0,
    left: 0,
    width: minWidth,
    maxHeight: 280,
    placeAbove: false,
  });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownEstHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const placeAbove = spaceBelow < 220 && rect.top > 220;

      const top = placeAbove
        ? Math.max(8, rect.top - dropdownEstHeight - 4)
        : rect.bottom + 4;
      const width = Math.max(rect.width, minWidth);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const maxHeight = placeAbove
        ? Math.min(rect.top - 16, dropdownEstHeight)
        : Math.min(spaceBelow - 16, dropdownEstHeight);

      setCoords({ top, left, width, maxHeight, placeAbove });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, triggerRef, minWidth]);

  return coords;
}

// ============================================================================
// 1. Searchable Company Dropdown
// ============================================================================
export interface SearchableCompanySelectProps {
  companies: string[];
  value: string;
  onChange: (companyName: string) => void;
  clients?: Client[];
  onRegisterNewClick?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const SearchableCompanySelect: React.FC<SearchableCompanySelectProps> = ({
  companies,
  value,
  onChange,
  clients = [],
  onRegisterNewClick,
  placeholder = "-- Select or Type Company Name --",
  required = false,
  disabled = false,
  id,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Alphabetically sorted companies list (A-Z, case-insensitive)
  const sortedCompanies = useMemo(() => {
    return [...companies].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [companies]);

  // Filtered companies based on search input
  const filteredCompanies = useMemo(() => {
    if (!searchTerm.trim()) return sortedCompanies;
    const term = searchTerm.toLowerCase().trim();
    return sortedCompanies.filter((c) => c.toLowerCase().includes(term));
  }, [sortedCompanies, searchTerm]);

  // Keep highlighted index within bounds
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredCompanies.length]);

  // When value prop changes, update search term if not actively editing
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(value || "");
    }
  }, [value, isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm(value || "");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen, value]);

  const handleSelect = (company: string) => {
    onChange(company);
    setSearchTerm(company);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredCompanies.length - 1 ? prev + 1 : 0
      );
      scrollItemIntoView(highlightedIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCompanies.length - 1
      );
      scrollItemIntoView(highlightedIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCompanies.length > 0 && filteredCompanies[highlightedIndex]) {
        handleSelect(filteredCompanies[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm(value || "");
    }
  };

  const scrollItemIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-company-item]");
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  };

  const coords = usePortalPosition(isOpen, containerRef, 320);

  // Pre-calculate contacts count per company for display
  const contactsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const client of clients) {
      if (client.companyName) {
        map.set(client.companyName, (map.get(client.companyName) || 0) + 1);
      }
    }
    return map;
  }, [clients]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML5 form required validation */}
      <input
        type="text"
        tabIndex={-1}
        className="sr-only"
        required={required}
        value={value}
        onChange={() => {}}
      />

      {/* Main input trigger */}
      <div
        className={`relative flex items-center border rounded-xl bg-slate-50 transition-all ${
          isOpen
            ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-white"
            : "border-slate-200 hover:border-slate-300"
        } ${disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : ""}`}
      >
        <div className="pl-3 text-slate-400 shrink-0">
          <Search size={14} className={isOpen ? "text-indigo-600" : ""} />
        </div>

        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          value={searchTerm}
          placeholder={placeholder}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full text-sm px-2.5 py-2 bg-transparent outline-none text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400"
          autoComplete="off"
        />

        <div className="flex items-center gap-1 pr-2.5 shrink-0">
          {searchTerm && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition-colors"
              title="Clear selection"
            >
              <X size={13} />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setIsOpen((prev) => !prev);
              if (!isOpen) inputRef.current?.focus();
            }}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-transform"
            tabIndex={-1}
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-600" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Floating Dropdown Portal */}
      {isOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
            }}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col font-sans"
          >
            {/* Header with search stats & A-Z indicator */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1 text-indigo-700 font-bold font-mono">
                <ArrowUpDown size={11} /> Sorted A-Z
              </span>
              <span>
                {filteredCompanies.length === sortedCompanies.length
                  ? `${sortedCompanies.length} companies`
                  : `Showing ${filteredCompanies.length} of ${sortedCompanies.length}`}
              </span>
            </div>

            {/* List of sorted companies */}
            <div
              ref={listRef}
              style={{ maxHeight: `${coords.maxHeight}px` }}
              className="overflow-y-auto scrollbar-thin divide-y divide-slate-50 p-1"
            >
              {filteredCompanies.length > 0 ? (
                filteredCompanies.map((comp, idx) => {
                  const isSelected = comp === value;
                  const isHighlighted = idx === highlightedIndex;
                  const contactCount = contactsCountMap.get(comp) || 0;

                  return (
                    <div
                      key={comp}
                      data-company-item
                      onClick={() => handleSelect(comp)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                        isSelected
                          ? "bg-indigo-50/80 text-indigo-950 font-bold"
                          : isHighlighted
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Building2
                          size={13}
                          className={isSelected ? "text-indigo-600 shrink-0" : "text-slate-400 shrink-0"}
                        />
                        <span className="truncate">{comp}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {contactCount > 0 && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-medium">
                            {contactCount} {contactCount === 1 ? "contact" : "contacts"}
                          </span>
                        )}
                        {isSelected && <Check size={14} className="text-indigo-600" />}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    No registered companies match &quot;
                    <span className="font-semibold text-slate-700">{searchTerm}</span>&quot;
                  </p>
                  {onRegisterNewClick && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onRegisterNewClick();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus size={12} /> Register New Company
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick footer registration link if not empty */}
            {filteredCompanies.length > 0 && onRegisterNewClick && (
              <div className="p-2 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 text-[10px]">Can&apos;t find company?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onRegisterNewClick();
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <Plus size={11} /> Register New
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

// ============================================================================
// 2. Searchable Product Dropdown (For Line Items)
// ============================================================================
export interface SearchableProductSelectProps {
  products: Product[];
  value: string; // Product ID
  onChange: (productId: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  theme?: "indigo" | "amber";
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  products,
  value,
  onChange,
  placeholder = "-- Select Product --",
  required = false,
  disabled = false,
  id,
  className = "",
  theme = "indigo",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Alphabetically sorted products by product name (A-Z)
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
    );
  }, [products]);

  // Current selected product
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === value);
  }, [products, value]);

  // Filtered products list matching search term (by name, hsnCode, or category)
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return sortedProducts;
    const term = searchTerm.toLowerCase().trim();
    return sortedProducts.filter((p) => {
      const nameMatch = (p.name || "").toLowerCase().includes(term);
      const hsnMatch = (p.hsnCode || "").toLowerCase().includes(term);
      const catMatch = (p.category || "").toLowerCase().includes(term);
      const groupMatch = (p.group || "").toLowerCase().includes(term);
      return nameMatch || hsnMatch || catMatch || groupMatch;
    });
  }, [sortedProducts, searchTerm]);

  // Reset highlight on filter change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProducts.length]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm("");
    }
  }, [isOpen]);

  // Outside click listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelect = (productId: string) => {
    onChange(productId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : 0
      );
      scrollItemIntoView(highlightedIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredProducts.length - 1
      );
      scrollItemIntoView(highlightedIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredProducts.length > 0 && filteredProducts[highlightedIndex]) {
        handleSelect(filteredProducts[highlightedIndex].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const scrollItemIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-product-item]");
    if (items[index]) {
      (items[index] as HTMLElement).scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  };

  const coords = usePortalPosition(isOpen, triggerRef, 340);
  const isAmber = theme === "amber";

  return (
    <div className={`relative w-full ${className}`}>
      {/* Hidden input for HTML5 form required validation */}
      <input
        type="text"
        tabIndex={-1}
        className="sr-only"
        required={required}
        value={value}
        onChange={() => {}}
      />

      {/* Trigger button replacing the standard select */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full text-xs border rounded-md p-1.5 flex items-center justify-between gap-1 text-left transition-all ${
          isOpen
            ? isAmber
              ? "border-amber-500 ring-1 ring-amber-500 bg-white"
              : "border-indigo-500 ring-1 ring-indigo-500 bg-white"
            : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300"
        } ${disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : "cursor-pointer"}`}
        title={selectedProduct ? selectedProduct.name : placeholder}
      >
        <span
          className={`truncate font-semibold text-xs ${
            selectedProduct ? "text-slate-800" : "text-slate-400 font-normal"
          }`}
        >
          {selectedProduct ? selectedProduct.name : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${
              isOpen
                ? isAmber
                  ? "rotate-180 text-amber-600"
                  : "rotate-180 text-indigo-600"
                : ""
            }`}
          />
        </div>
      </button>

      {/* Floating Searchable Dropdown Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
            }}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col font-sans"
            onKeyDown={handleKeyDown}
          >
            {/* Search Input Header */}
            <div className="p-2 border-b border-slate-100 bg-slate-50 space-y-1.5">
              <div className="relative flex items-center bg-white border border-slate-200 rounded-lg focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30">
                <Search size={13} className="ml-2.5 text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Type to search product (name, HSN)..."
                  className="w-full text-xs px-2 py-1.5 bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="p-1 mr-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5 font-medium">
                <span className="flex items-center gap-1 font-bold text-indigo-700 font-mono">
                  <ArrowUpDown size={10} /> Sorted A-Z
                </span>
                <span>
                  {filteredProducts.length === sortedProducts.length
                    ? `${sortedProducts.length} products`
                    : `Showing ${filteredProducts.length} of ${sortedProducts.length}`}
                </span>
              </div>
            </div>

            {/* Scrollable Products List */}
            <div
              ref={listRef}
              style={{ maxHeight: `${coords.maxHeight}px` }}
              className="overflow-y-auto scrollbar-thin divide-y divide-slate-50 p-1"
            >
              {filteredProducts.length > 0 ? (
                filteredProducts.map((prod, idx) => {
                  const isSelected = prod.id === value;
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={prod.id}
                      data-product-item
                      onClick={() => handleSelect(prod.id)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? isAmber
                            ? "bg-amber-50 text-amber-950 font-bold"
                            : "bg-indigo-50 text-indigo-950 font-bold"
                          : isHighlighted
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 pr-1">
                          <div className="flex items-center gap-1.5">
                            <Package
                              size={12}
                              className={
                                isSelected
                                  ? isAmber
                                    ? "text-amber-600 shrink-0"
                                    : "text-indigo-600 shrink-0"
                                  : "text-slate-400 shrink-0"
                              }
                            />
                            <span className="truncate font-semibold text-slate-800">
                              {prod.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-mono">
                            {prod.hsnCode && (
                              <span className="bg-slate-100 text-slate-600 px-1 py-0.2 rounded border border-slate-200/50">
                                HSN: {prod.hsnCode}
                              </span>
                            )}
                            {prod.category && (
                              <span className="text-slate-400 font-sans">
                                • {prod.category}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <Check
                            size={14}
                            className={
                              isAmber
                                ? "text-amber-600 shrink-0"
                                : "text-indigo-600 shrink-0"
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No products found matching &quot;
                  <span className="font-semibold text-slate-600">{searchTerm}</span>&quot;
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
