import React, { useRef, useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Underline,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Type,
  Maximize,
  HelpCircle,
  ChevronDown
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  availableVariables?: string[];
}

const PRESET_COLORS = [
  { name: "Dark Slate", value: "#1e293b" },
  { name: "Royal Blue", value: "#2563eb" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Emerald Green", value: "#059669" },
  { name: "Amber Orange", value: "#d97706" },
  { name: "Crimson Red", value: "#dc2626" },
  { name: "Hot Pink", value: "#db2777" },
  { name: "Slate Gray", value: "#64748b" }
];

const PRESET_BACKGROUNDS = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Red", value: "#fecaca" },
  { name: "Orange", value: "#ffedd5" },
  { name: "Purple", value: "#e9d5ff" }
];

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Courier New", value: "Courier New" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Verdana", value: "Verdana" },
  { label: "Trebuchet MS", value: "Trebuchet MS" },
  { label: "Impact", value: "Impact" }
];

const FONT_SIZES = [
  { label: "Small", value: "2" }, // ExecCommand fontSize ranges from 1 to 7
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Extra Large", value: "6" }
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write email body here...",
  availableVariables = []
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRangeRef = useRef<Range | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const toggleFontDropdown = () => {
    setShowFontDropdown(!showFontDropdown);
    setShowSizeDropdown(false);
    setShowColorPicker(false);
    setShowBgPicker(false);
  };

  const toggleSizeDropdown = () => {
    setShowSizeDropdown(!showSizeDropdown);
    setShowFontDropdown(false);
    setShowColorPicker(false);
    setShowBgPicker(false);
  };

  // Initialize content once when component loads or if value is reset/empty
  useEffect(() => {
    if (editorRef.current) {
      const currentHTML = editorRef.current.innerHTML;
      if (currentHTML !== value) {
        // If value is empty, provide default or empty string
        editorRef.current.innerHTML = value || "";
      }
    }
  }, [value]);

  // Save selection range so we can restore it when clicking formatting buttons or placeholders
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        lastRangeRef.current = range.cloneRange();
      }
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    saveSelection();
  };

  // Run document commands
  const runCommand = (command: string, arg: string = "") => {
    if (editorRef.current) {
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel && lastRangeRef.current) {
        sel.removeAllRanges();
        sel.addRange(lastRangeRef.current);
      }
      
      document.execCommand(command, false, arg);
      
      // Update state
      onChange(editorRef.current.innerHTML);
      saveSelection();
    }
  };

  // Insert standard plain text placeholders safely
  const insertPlaceholder = (placeholderText: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        if (lastRangeRef.current) {
          sel.addRange(lastRangeRef.current);
        } else {
          // Put cursor at the end
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel.addRange(range);
        }
      }

      // insertText is fully supported and safe against injection
      document.execCommand("insertText", false, placeholderText);
      
      // Update local state
      onChange(editorRef.current.innerHTML);
      saveSelection();
    }
  };

  return (
    <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white shadow-3xs group">
      {/* Editor Toolbar */}
      <div 
        className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border-b border-slate-200"
        onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on editor when clicking toolbar
      >
        {/* Undo/Redo Group */}
        <div className="flex items-center gap-0.5 bg-white border border-slate-200/80 rounded-md p-0.5 shadow-3xs">
          <button
            type="button"
            onClick={() => runCommand("undo")}
            className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title="Undo"
          >
            <Undo size={14} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("redo")}
            className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title="Redo"
          >
            <Redo size={14} />
          </button>
        </div>

        {/* Basic Styles Group */}
        <div className="flex items-center gap-0.5 bg-white border border-slate-200/80 rounded-md p-0.5 shadow-3xs">
          <button
            type="button"
            onClick={() => runCommand("bold")}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded font-bold transition-colors"
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("italic")}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded italic transition-colors"
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("underline")}
            className="p-1 text-slate-600 hover:bg-slate-100 rounded underline transition-colors"
            title="Underline"
          >
            <Underline size={14} />
          </button>
        </div>

        {/* Font Family Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleFontDropdown}
            className={`flex items-center gap-1 px-2 py-1 text-xs bg-white border rounded-md hover:bg-slate-100 transition-colors shadow-3xs ${
              showFontDropdown ? "border-indigo-500 text-indigo-600 ring-1 ring-indigo-500/25" : "border-slate-200 text-slate-600"
            }`}
            title="Font Family"
          >
            <span>Font Family</span>
            <ChevronDown size={12} className="text-slate-400 shrink-0" />
          </button>

          {showFontDropdown && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg p-1 shadow-lg w-40 flex flex-col gap-0.5 animate-fade-in max-h-56 overflow-y-auto scrollbar-thin">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font.label}
                  type="button"
                  onClick={() => {
                    runCommand("fontName", font.value);
                    setShowFontDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded transition-colors font-medium"
                  style={{ fontFamily: font.value }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleSizeDropdown}
            className={`flex items-center gap-1 px-2 py-1 text-xs bg-white border rounded-md hover:bg-slate-100 transition-colors shadow-3xs ${
              showSizeDropdown ? "border-indigo-500 text-indigo-600 ring-1 ring-indigo-500/25" : "border-slate-200 text-slate-600"
            }`}
            title="Font Size"
          >
            <span>Size</span>
            <ChevronDown size={12} className="text-slate-400 shrink-0" />
          </button>

          {showSizeDropdown && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg p-1 shadow-lg w-32 flex flex-col gap-0.5 animate-fade-in">
              {FONT_SIZES.map((sz) => (
                <button
                  key={sz.label}
                  type="button"
                  onClick={() => {
                    runCommand("fontSize", sz.value);
                    setShowSizeDropdown(false);
                  }}
                  className="w-full text-left px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 hover:text-indigo-600 rounded transition-colors font-medium"
                >
                  {sz.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Alignment Group */}
        <div className="flex items-center gap-0.5 bg-white border border-slate-200/80 rounded-md p-0.5 shadow-3xs">
          <button
            type="button"
            onClick={() => runCommand("justifyLeft")}
            className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title="Align Left"
          >
            <AlignLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("justifyCenter")}
            className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title="Align Center"
          >
            <AlignCenter size={14} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("justifyRight")}
            className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title="Align Right"
          >
            <AlignRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => runCommand("justifyFull")}
            className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
            title="Justify"
          >
            <AlignJustify size={14} />
          </button>
        </div>

        {/* Text Color Picker Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowBgPicker(false);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
            }}
            className={`flex items-center gap-1 px-1.5 py-1 text-xs bg-white border rounded-md hover:bg-slate-100 transition-colors shadow-3xs ${
              showColorPicker ? "border-indigo-500 text-indigo-600 ring-1 ring-indigo-500/25" : "border-slate-200 text-slate-600"
            }`}
            title="Text Color"
          >
            <Palette size={13} className="text-rose-500" />
            <span>Color</span>
          </button>

          {showColorPicker && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg p-2 shadow-lg w-44 grid grid-cols-4 gap-1.5 animate-fade-in">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => {
                    runCommand("foreColor", color.value);
                    setShowColorPicker(false);
                  }}
                  className="w-7 h-7 rounded-full border border-slate-200 shadow-3xs cursor-pointer transition-transform hover:scale-110 flex items-center justify-center"
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  <span className="sr-only">{color.name}</span>
                </button>
              ))}
              <div className="col-span-4 border-t border-slate-150 pt-1.5 flex items-center gap-1.5">
                <input
                  type="color"
                  onChange={(e) => runCommand("foreColor", e.target.value)}
                  className="w-6 h-6 border rounded cursor-pointer shrink-0"
                  title="Custom Color"
                />
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Custom</span>
              </div>
            </div>
          )}
        </div>

        {/* Text Highlight Color Picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowBgPicker(!showBgPicker);
              setShowColorPicker(false);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
            }}
            className={`flex items-center gap-1 px-1.5 py-1 text-xs bg-white border rounded-md hover:bg-slate-100 transition-colors shadow-3xs ${
              showBgPicker ? "border-indigo-500 text-indigo-600 ring-1 ring-indigo-500/25" : "border-slate-200 text-slate-600"
            }`}
            title="Highlight Text"
          >
            <div className="w-3.5 h-3.5 rounded bg-yellow-200 flex items-center justify-center font-bold text-[9px] text-slate-800">H</div>
            <span>Highlight</span>
          </button>

          {showBgPicker && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg p-2 shadow-lg w-44 grid grid-cols-4 gap-1.5 animate-fade-in">
              {PRESET_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => {
                    runCommand("hiliteColor", bg.value);
                    setShowBgPicker(false);
                  }}
                  className="w-7 h-7 rounded border border-slate-200 shadow-3xs cursor-pointer transition-transform hover:scale-110"
                  style={{ backgroundColor: bg.value }}
                  title={bg.name}
                >
                  <span className="sr-only">{bg.name}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  runCommand("hiliteColor", "transparent");
                  setShowBgPicker(false);
                }}
                className="col-span-4 text-center py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[10px] text-slate-600 font-semibold"
              >
                Clear Highlight
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div className="relative bg-white flex flex-col min-h-[220px]">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={() => {
            setIsFocused(false);
            saveSelection();
          }}
          onFocus={() => setIsFocused(true)}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          className="w-full flex-1 p-3 outline-none overflow-y-auto max-h-[360px] text-sm text-slate-800 min-h-[220px] font-sans leading-relaxed"
          style={{ minHeight: "220px" }}
        />
        
        {/* Placeholder label overlays if empty */}
        {(!value || value === "<br>" || value === "<div><br></div>") && !isFocused && (
          <div 
            className="absolute left-3 top-3 text-slate-400 text-xs pointer-events-none font-sans"
            dangerouslySetInnerHTML={{ __html: placeholder }}
          />
        )}
      </div>

      {/* Variables tray inside editor - EXTREMELY USER FRIENDLY */}
      {availableVariables && availableVariables.length > 0 && (
        <div className="p-2 bg-slate-50 border-t border-slate-150 flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <HelpCircle size={11} className="text-slate-400" />
            <span>Interactive Variables (Click to Insert at Cursor)</span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-[110px] overflow-y-auto scrollbar-thin p-0.5">
            {Array.from(new Set(availableVariables)).map((variable, idx) => (
              <button
                key={`${variable}-${idx}`}
                type="button"
                onClick={() => insertPlaceholder(variable)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200/60 px-1.5 py-0.5 rounded text-[10.5px] font-mono transition-all font-semibold active:scale-95 shadow-3xs"
              >
                {variable}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
