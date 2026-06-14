import React from "react";
import { Save, Clipboard, Trash2, Play, Terminal, HelpCircle, Code } from "lucide-react";

interface MacroIdeProps {
  content: string;
  onChangeContent: (val: string) => void;
  onSave: () => void;
  onClear: () => void;
  onSimulate: () => void;
  showSuccessMessage: (msg: string) => void;
}

export default function MacroIde({
  content,
  onChangeContent,
  onSave,
  onClear,
  onSimulate,
  showSuccessMessage,
}: MacroIdeProps) {
  // Line counter calculation
  const lines = content.split("\n");
  const lineCount = Math.max(lines.length, 1);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(content);
    showSuccessMessage("Macro text copied to clipboard!");
  };

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col rounded-lg border border-neutral-800 shadow-lg overflow-hidden min-h-[500px]">
      
      {/* Editor Tab Bar & Actions bar */}
      <div className="h-10 bg-[#252526] border-b border-[#333333] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e1e] rounded-t-lg border-t-2 border-blue-500 text-[11px] text-[#cccccc] font-mono">
            <Code className="w-3.5 h-3.5 text-blue-400" />
            Active_Synthesis.macro
          </div>
        </div>

        {/* Buttons Group */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={onSimulate}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-[#ffffff] font-semibold rounded transition-colors text-[11px]"
            title="Simulate current block cycle parsed inside Console output below"
          >
            <Play className="w-3 h-3 fill-white" />
            Run Simulation
          </button>
          
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#333333] hover:bg-[#444444] text-[#cccccc] rounded transition-colors text-[11px]"
            title="Copy entire macro block string to system clipboard"
          >
            <Clipboard className="w-3 h-3" />
            Copy
          </button>

          <button
            onClick={onSave}
            className="flex items-center gap-1 px-2.5 py-1 bg-[#333333] hover:bg-[#444444] text-[#cccccc] rounded transition-colors text-[11px]"
            title="Download block cycle as .txt file format"
          >
            <Save className="w-3 h-3" />
            Save File
          </button>

          <button
            onClick={onClear}
            className="flex items-center gap-1 px-2 py-1 bg-red-900 hover:bg-red-800 text-red-100 rounded transition-colors text-[11px]"
            title="Wipe entire workspace script"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      {/* Code Text zone with Gutter */}
      <div className="flex-1 flex overflow-hidden font-mono text-sm leading-6 relative">
        
        {/* Line Gutter numbers */}
        <div className="w-12 bg-[#1e1e1e] text-right pr-3 pt-3 text-[#565656] select-none border-r border-[#2d2d2d] flex flex-col items-stretch text-xs">
          {Array.from({ length: lineCount }).map((_, idx) => (
            <div key={idx} className="h-6">
              {idx + 1}
            </div>
          ))}
        </div>

        {/* Big Code Textarea overlaying */}
        <textarea
          value={content}
          onChange={(e) => onChangeContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const target = e.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              const newVal = val.substring(0, start) + "\t" + val.substring(end);
              onChangeContent(newVal);
              
              // Move cursor forward by one tab
              setTimeout(() => {
                target.selectionStart = target.selectionEnd = start + 1;
              }, 0);
            }
          }}
          placeholder={`// Advion NanoTek standard script editor zone.\n// Click "Build Macro Block" under Reaction Settings to append dynamic code blocks,\n// or edit synthesis commands manually using the reference on the left.`}
          className="flex-1 w-full bg-[#1e1e1e] text-[#d4d4d4] caret-blue-500 font-mono text-xs leading-6 p-3 outline-none focus:outline-none resize-none overflow-y-auto block whitespace-pre"
          style={{ height: "100%", tabSize: 4 }}
        />
      </div>

      {/* Quick Hints bottom bar */}
      <div className="bg-[#1e1e1e] border-t border-[#29292d] p-2 flex justify-between items-center text-[10px] text-gray-500 font-sans shrink-0 px-4">
        <span>Encoding: Tab-delimited ANSI standard (Kloehn layout)</span>
        <span className="flex items-center gap-1 text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Simulator Ready. {lineCount} {lineCount === 1 ? "line" : "lines"} rendered.
        </span>
      </div>
    </div>
  );
}
