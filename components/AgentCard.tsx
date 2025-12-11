import React, { useEffect, useRef, useState } from 'react';
import { Agent, AgentStatus } from '../types';
import { Check, Loader2, AlertCircle, ChevronDown, ChevronRight, Terminal } from 'lucide-react';

interface AgentCardProps {
  agent: Agent;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs if expanded
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.logs, expanded]);

  const isActive = agent.status === AgentStatus.WORKING;
  const isDone = agent.status === AgentStatus.DONE;
  const isError = agent.status === AgentStatus.ERROR;

  // Get the latest log message for the summary view
  const lastLog = agent.logs.length > 0 ? agent.logs[agent.logs.length - 1] : agent.description;
  // Strip timestamp for cleaner display
  const cleanLastLog = lastLog.replace(/^\[.*?\]\s*/, '');

  return (
    <div className={`group relative flex flex-col transition-all duration-300 ${isActive ? 'bg-neutral-900/50' : 'bg-transparent'} border-b border-neutral-800 last:border-0`}>
      
      {/* Main Row */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 transition-colors rounded-lg mx-1 my-0.5"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          {isActive && <Loader2 className="w-4 h-4 text-white animate-spin" />}
          {isDone && <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center"><Check className="w-2.5 h-2.5 text-black" strokeWidth={3} /></div>}
          {isError && <AlertCircle className="w-4 h-4 text-red-500" />}
          {agent.status === AgentStatus.IDLE && <div className="w-2 h-2 rounded-full bg-neutral-700" />}
        </div>

        {/* Text Content */}
        <div className="flex-grow min-w-0 flex flex-col">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${isActive || isDone ? 'text-neutral-200' : 'text-neutral-500'}`}>
              {agent.name}
            </span>
            {agent.payload && (
               <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-600 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                 Data Ready
               </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
             <span className={`text-xs truncate transition-colors duration-300 ${isActive ? 'text-blue-400' : 'text-neutral-500'}`}>
               {isActive ? cleanLastLog : agent.role}
             </span>
          </div>
        </div>

        {/* Chevron */}
        <div className="text-neutral-600">
           {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Expanded Details (Logs & Payload) */}
      {expanded && (
        <div className="px-10 pb-4 animate-in slide-in-from-top-1 fade-in duration-200">
           {/* Logs Console */}
           <div className="bg-[#0A0A0A] rounded-md border border-neutral-800 p-2 font-mono text-[10px] text-neutral-400 max-h-32 overflow-y-auto custom-scrollbar shadow-inner" ref={scrollRef}>
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-800 text-neutral-500">
                <Terminal size={10} /> 
                <span>Activity Log</span>
              </div>
              {agent.logs.length === 0 ? (
                <span className="opacity-50">Waiting to start...</span>
              ) : (
                agent.logs.map((log, i) => (
                  <div key={i} className="mb-0.5 break-words">
                    <span className="opacity-30 mr-2">{log.match(/^\[(.*?)\]/)?.[1] || ''}</span>
                    <span className={log.toLowerCase().includes('error') ? 'text-red-400' : ''}>
                      {log.replace(/^\[.*?\]\s*/, '')}
                    </span>
                  </div>
                ))
              )}
           </div>

           {/* Payload Viewer (Optional) */}
           {agent.payload && (
             <div className="mt-2">
               <div className="text-[10px] font-medium text-neutral-500 mb-1">OUTPUT PAYLOAD</div>
               <pre className="bg-[#0A0A0A] rounded-md border border-neutral-800 p-2 font-mono text-[10px] text-green-500/80 overflow-x-auto">
                 {JSON.stringify(agent.payload, null, 2)}
               </pre>
             </div>
           )}
        </div>
      )}
    </div>
  );
};

export default AgentCard;