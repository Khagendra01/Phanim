
import React, { useState, useCallback } from 'react';
import { 
  Agent, 
  AgentStatus, 
  VideoProject, 
  TimelineBlock, 
  GeneratedScene,
  CuratedContent,
  DirectorScript,
  TechnicalSpec,
  MotionManifest
} from './types';
import AgentCard from './components/AgentCard';
import VideoPlayer from './components/VideoPlayer';
import { 
  runCuratorAgent, 
  runNarratorAgent, 
  runDirectorAgent, 
  runCastingAgent, 
  runTechnicalIllustratorAgent, 
  runKinematicEngineAgent, 
  runSVGAssemblerAgent, 
  runAudioAgent 
} from './services/geminiService';
import { DEMO_PROJECT, DEMO_CURATED, DEMO_TIMELINE, DEMO_CAST } from './services/demoData';
import { Sparkles, ArrowRight, Command, Layout, Download, ChevronLeft, Clock, Mic, Info, X } from 'lucide-react';

const INITIAL_AGENTS: Agent[] = [
  { id: 'orch', name: 'Orchestrator', role: 'System', description: 'Pipeline Manager', status: AgentStatus.IDLE, logs: [] },
  { id: 'info', name: 'Researcher', role: 'Data', description: 'Curates topic facts', status: AgentStatus.IDLE, logs: [] },
  { id: 'narrator', name: 'Scriptwriter', role: 'Story', description: 'Drafts timeline', status: AgentStatus.IDLE, logs: [] },
  { id: 'director', name: 'Director', role: 'Visuals', description: 'Defines style', status: AgentStatus.IDLE, logs: [] },
  { id: 'casting', name: 'Casting', role: 'Assets', description: 'Creates visual dictionary', status: AgentStatus.IDLE, logs: [] },
  { id: 'illustrator', name: 'Illustrator', role: 'Geometry', description: 'Builds SVG paths', status: AgentStatus.IDLE, logs: [] },
  { id: 'kinematics', name: 'Physics Engine', role: 'Motion', description: 'Simulates forces', status: AgentStatus.IDLE, logs: [] },
  { id: 'renderer', name: 'Renderer', role: 'Output', description: 'Compiles frames', status: AgentStatus.IDLE, logs: [] },
  { id: 'assembly', name: 'Assembler', role: 'Final', description: 'Stitches stream', status: AgentStatus.IDLE, logs: [] }
];

const DURATION_OPTIONS = ['Auto', '10s', '20s', '30s', '60s'];
const STYLE_OPTIONS = ['Casual', 'Academic', 'Dramatic', 'Minimalist'];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function App() {
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState('Auto');
  const [narrationStyle, setNarrationStyle] = useState('Casual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const updateAgent = (id: string, updates: Partial<Agent>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const logAgent = (id: string, message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
    setAgents(prev => prev.map(a => {
      if (a.id === id) return { ...a, logs: [...a.logs, `[${time}] ${message}`] };
      return a;
    }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        if (!json.scenes || !Array.isArray(json.scenes)) { alert("Invalid project file."); return; }
        setProject(json as VideoProject);
        setTopic(json.topic || "Imported Project");
        setAgents(INITIAL_AGENTS.map(a => ({ ...a, status: AgentStatus.DONE, logs: ['[System] Loaded from file.'] })));
      } catch (err) { alert("Failed to parse project file."); }
    };
    reader.readAsText(file);
    event.target.value = ''; 
  };

  const handleBack = () => {
    setProject(null);
    setTopic('');
    setIsProcessing(false);
    setAgents(INITIAL_AGENTS.map(a => ({ ...a, status: AgentStatus.IDLE, logs: [], payload: undefined })));
  };

  const runSimulation = useCallback(async () => {
    setIsProcessing(true);
    setProject(null);
    setTopic(DEMO_PROJECT.topic);
    setAgents(INITIAL_AGENTS.map(a => ({...a, status: AgentStatus.IDLE, logs: [], payload: undefined })));
    try {
      updateAgent('orch', { status: AgentStatus.WORKING });
      logAgent('orch', 'Booting Demo Simulation...');
      await sleep(500);
      updateAgent('info', { status: AgentStatus.WORKING });
      await sleep(800);
      updateAgent('info', { status: AgentStatus.DONE, payload: DEMO_CURATED });
      updateAgent('narrator', { status: AgentStatus.WORKING });
      await sleep(800);
      updateAgent('narrator', { status: AgentStatus.DONE, payload: DEMO_TIMELINE });
      updateAgent('director', { status: AgentStatus.WORKING });
      updateAgent('casting', { status: AgentStatus.WORKING });
      await sleep(1000);
      updateAgent('director', { status: AgentStatus.DONE });
      updateAgent('casting', { status: AgentStatus.DONE });
      setProject({ topic: DEMO_PROJECT.topic, curatedContent: DEMO_CURATED, script: DEMO_TIMELINE, castList: DEMO_CAST, scenes: [] });
      updateAgent('illustrator', { status: AgentStatus.WORKING });
      updateAgent('kinematics', { status: AgentStatus.WORKING });
      updateAgent('renderer', { status: AgentStatus.WORKING });
      for (const scene of DEMO_PROJECT.scenes) {
         await sleep(1500); 
         logAgent('renderer', `Generated Scene ${scene.id}`);
         setProject(prev => prev ? { ...prev, scenes: [...prev.scenes, scene].sort((a,b) => a.id - b.id) } : null);
      }
      updateAgent('illustrator', { status: AgentStatus.DONE });
      updateAgent('kinematics', { status: AgentStatus.DONE });
      updateAgent('renderer', { status: AgentStatus.DONE });
      updateAgent('assembly', { status: AgentStatus.DONE });
      updateAgent('orch', { status: AgentStatus.DONE });
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  }, []);

  const startPipeline = useCallback(async () => {
    if (!topic.trim()) return;
    setIsProcessing(true);
    setProject(null);
    setAgents(INITIAL_AGENTS.map(a => ({...a, status: AgentStatus.IDLE, logs: [], payload: undefined })));
    try {
      updateAgent('orch', { status: AgentStatus.WORKING });
      logAgent('orch', `Init: "${topic}" [${duration}, ${narrationStyle}]`);
      updateAgent('info', { status: AgentStatus.WORKING });
      const curated = await runCuratorAgent(topic);
      updateAgent('info', { status: AgentStatus.DONE, payload: curated });
      updateAgent('narrator', { status: AgentStatus.WORKING });
      // Pass duration and style to the narrator
      const timeline = await runNarratorAgent(topic, curated, duration, narrationStyle);
      updateAgent('narrator', { status: AgentStatus.DONE, payload: timeline });
      updateAgent('director', { status: AgentStatus.WORKING });
      const directorScripts = await runDirectorAgent(topic, timeline);
      updateAgent('director', { status: AgentStatus.DONE, payload: directorScripts });
      updateAgent('casting', { status: AgentStatus.WORKING });
      const castList = await runCastingAgent(topic, timeline);
      updateAgent('casting', { status: AgentStatus.DONE, payload: castList });
      setProject({ topic, curatedContent: curated, script: timeline, castList: castList, scenes: [] });
      updateAgent('illustrator', { status: AgentStatus.WORKING });
      updateAgent('kinematics', { status: AgentStatus.WORKING });
      updateAgent('renderer', { status: AgentStatus.WORKING });
      const techSpecs: TechnicalSpec[] = [];
      const motionManifests: MotionManifest[] = [];
      for (const block of timeline) {
        logAgent('orch', `Processing Scene ${block.scene_id}...`);
        const plan = directorScripts.find(ds => ds.scene_id === block.scene_id)!;
        const spec = await runTechnicalIllustratorAgent(block, plan, castList);
        techSpecs.push(spec); 
        const manifest = await runKinematicEngineAgent(block, plan, spec);
        motionManifests.push(manifest);
        const [svgContent, audioBase64] = await Promise.all([
           runSVGAssemblerAgent(spec),
           runAudioAgent(block.audio_narration)
        ]);
        const newScene: GeneratedScene = { id: block.scene_id, svgContent, motionManifest: manifest, audioBase64, duration: block.time_end - block.time_start };
        setProject(prev => { if (!prev) return null; return { ...prev, scenes: [...prev.scenes, newScene].sort((a, b) => a.id - b.id) }; });
        logAgent('renderer', `Scene ${block.scene_id} Ready`);
        await new Promise(r => setTimeout(r, 1000));
      }
      updateAgent('illustrator', { status: AgentStatus.DONE, payload: techSpecs });
      updateAgent('kinematics', { status: AgentStatus.DONE, payload: motionManifests });
      updateAgent('renderer', { status: AgentStatus.DONE });
      updateAgent('assembly', { status: AgentStatus.DONE });
      updateAgent('orch', { status: AgentStatus.DONE });
    } catch (error) {
      console.error(error);
      updateAgent('orch', { status: AgentStatus.ERROR });
    } finally { setIsProcessing(false); }
  }, [topic, duration, narrationStyle]);

  const downloadProject = () => {
    if(!project) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const a = document.createElement('a'); a.href = dataStr; a.download = `${project.topic.replace(/\s+/g, '_')}_project.json`; document.body.appendChild(a); a.click(); a.remove();
  };

  // --- VIEW: HERO (Landing) ---
  if (!project && !isProcessing) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Info Modal */}
        {showInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
             <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
                <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition">
                  <X size={20} />
                </button>
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                       <Sparkles className="text-white" size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Phanim</h2>
                      <span className="text-xs font-mono text-indigo-400">Gemini 3 Pro Powered</span>
                    </div>
                  </div>
                  
                  <div className="space-y-4 text-sm text-neutral-400 leading-relaxed">
                    <p>
                      <strong className="text-white">What we built:</strong> Phanim is an autonomous "Director-in-a-Box" that transforms abstract educational topics into high-fidelity, physics-simulated SVG animations. Addressing the global challenge of accessible education, we built a LangGraph-inspired pipeline where a team of specialized AI agents (Curator, Scriptwriter, Director, Illustrator, and Physicist) collaborate to produce "Kurzgesagt-style" explainer videos in real-time.
                    </p>
                    <p>
                      <strong className="text-white">How we used Gemini:</strong> We harnessed <strong>Gemini 3 Pro's</strong> advanced reasoning and multimodal capabilities.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Reasoning:</strong> The Curator and Narrator agents use 3 Pro to deconstruct complex physics into intuitive analogies.</li>
                      <li><strong>Creativity:</strong> The Director agent leverages the model's large context window to maintain visual consistency.</li>
                      <li><strong>Coding:</strong> The Illustrator and Kinematics agents utilize Gemini's code generation skills to write raw SVG paths and complex animations.</li>
                    </ul>
                    <p>
                      <strong className="text-white">Impact:</strong> This project reimagines learning by removing the technical barrier to creating high-quality visual education.
                    </p>
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-indigo-900/10 blur-[120px] rounded-full pointer-events-none"></div>

        {/* Top Bar */}
        <div className="absolute top-6 right-6">
           <button onClick={() => setShowInfo(true)} className="p-2 text-neutral-500 hover:text-white transition rounded-full hover:bg-white/5">
             <Info size={20} />
           </button>
        </div>

        <div className="relative z-10 w-full max-w-2xl text-center space-y-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-400 text-xs font-medium">
            <Sparkles size={12} className="text-indigo-400" />
            <span>Generative Kinematics Engine</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-white">
            Phanim.
          </h1>
          
          <p className="text-lg text-neutral-500 max-w-lg mx-auto leading-relaxed">
            Turn any complex topic into a physics-simulated explanation video using Gemini 3 Pro.
          </p>

          <div className="relative w-full max-w-lg mx-auto flex flex-col gap-6">
             {/* Input Group */}
             <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative flex items-center bg-[#0A0A0A] rounded-2xl border border-white/10 shadow-2xl p-2 transition-transform group-hover:scale-[1.01] z-10">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Explain Quantum Entanglement..."
                      className="flex-1 bg-transparent px-4 py-4 text-lg outline-none text-white placeholder-neutral-600 font-medium"
                      onKeyDown={(e) => e.key === 'Enter' && startPipeline()}
                      autoFocus
                    />
                    <button 
                      onClick={startPipeline}
                      disabled={!topic}
                      className="bg-white text-black hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl transition-all"
                    >
                      <ArrowRight size={20} />
                    </button>
                </div>
             </div>
             
             {/* Control Deck */}
             <div className="relative z-20 flex flex-wrap items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                 
                 {/* Duration Selector */}
                 <div className="flex flex-col items-center gap-2">
                   <div className="flex items-center gap-1.5 text-neutral-500 text-[10px] font-bold tracking-widest uppercase">
                     <Clock size={10} /> Duration
                   </div>
                   <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
                      {DURATION_OPTIONS.map(opt => (
                         <button
                            key={opt}
                            onClick={() => setDuration(opt)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                               duration === opt 
                               ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-white/10' 
                               : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                            }`}
                         >
                            {opt}
                         </button>
                      ))}
                   </div>
                 </div>

                 {/* Style Selector */}
                 <div className="flex flex-col items-center gap-2">
                   <div className="flex items-center gap-1.5 text-neutral-500 text-[10px] font-bold tracking-widest uppercase">
                     <Mic size={10} /> Narration Style
                   </div>
                   <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
                      {STYLE_OPTIONS.map(opt => (
                         <button
                            key={opt}
                            onClick={() => setNarrationStyle(opt)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                               narrationStyle === opt 
                               ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-white/10' 
                               : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                            }`}
                         >
                            {opt}
                         </button>
                      ))}
                   </div>
                 </div>

             </div>
          </div>

          <div className="flex items-center justify-center gap-6 pt-6 text-xs font-medium text-neutral-600">
             <button onClick={runSimulation} className="hover:text-indigo-400 transition flex items-center gap-1.5">
               <Command size={12} /> Try Demo
             </button>
             <label className="hover:text-indigo-400 transition flex items-center gap-1.5 cursor-pointer">
               <Layout size={12} /> Import Project
               <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
             </label>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW: STUDIO (Active) ---
  return (
    <div className="h-screen bg-[#000000] text-neutral-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#050505]">
         <div className="flex items-center gap-4">
             <button 
               onClick={handleBack} 
               className="group flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
               title="Back to Home"
             >
                <ChevronLeft size={20} className="relative right-[1px]" />
             </button>
             <div className="h-6 w-px bg-white/10"></div>
             <div className="flex items-center gap-2 font-semibold text-white tracking-tight">
                <div className="w-5 h-5 bg-white rounded-sm"></div>
                Phanim
             </div>
         </div>
         <div className="flex items-center gap-4">
            {project && (
              <button onClick={downloadProject} className="text-xs text-neutral-500 hover:text-white transition flex items-center gap-1">
                <Download size={12} /> Export JSON
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500"></div>
         </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Stage (Video) */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center relative bg-[#050505]">
           <div className="w-full max-w-5xl animate-fade-in space-y-6">
              {project && <VideoPlayer project={project} />}
              
              <div className="text-center space-y-2">
                 <h2 className="text-2xl font-semibold text-white">{project?.topic || topic}</h2>
                 <p className="text-neutral-500 max-w-2xl mx-auto leading-relaxed text-sm">
                   {project?.curatedContent?.summary || "Initializing generative context..."}
                 </p>
              </div>
           </div>
        </div>

        {/* Right Sidebar (Pipeline) */}
        <div className="w-80 border-l border-white/5 bg-[#000000] flex flex-col">
           <div className="p-4 border-b border-white/5">
             <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Production Stream</h3>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
           </div>
           
           <div className="p-4 border-t border-white/5 bg-[#050505]">
             <div className="text-[10px] text-neutral-600 font-mono text-center">
               v3.0.0-pro • Gemini 3 Pro
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
