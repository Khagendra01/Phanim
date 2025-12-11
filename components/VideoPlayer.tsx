
import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { VideoProject, GeneratedScene, MotionManifest, MotionAction } from '../types';
import { Play, Pause, RefreshCw, Volume2, VolumeX, Download, Server, AlertTriangle, Maximize2, SkipBack } from 'lucide-react';

interface VideoPlayerProps {
  project: VideoProject;
}

// --- PHYSICS KERNEL (Updated for "3B1B" smoothness) ---
const PHYSICS_EASING = {
  linear: 'linear',
  easeOut: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)', // "Exponetial-like" ease
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Snappy spring
  springHeavy: 'cubic-bezier(0.2, 2.0, 0.3, 0.9)', 
  bounceDrop: 'cubic-bezier(0.6, -0.28, 0.735, 0.045)', 
  draw: 'cubic-bezier(0.45, 0, 0.55, 1)', // Smooth pen stroke
  elasticOut: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' // Overshoot
};

// --- AUDIO SYNTHESIZER ---
class SfxEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  droneOsc: OscillatorNode | null = null;
  droneLfo: OscillatorNode | null = null;
  droneGain: GainNode | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.4; // Lower volume for SFX
    this.masterGain.connect(ctx.destination);
  }

  startDrone() {
    if (this.droneOsc) return;
    this.droneOsc = this.ctx.createOscillator();
    this.droneLfo = this.ctx.createOscillator();
    this.droneGain = this.ctx.createGain();

    this.droneOsc.type = 'sine';
    this.droneOsc.frequency.value = 60; 

    this.droneLfo.type = 'sine';
    this.droneLfo.frequency.value = 0.2; 

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 10; 
    
    this.droneLfo.connect(lfoGain);
    lfoGain.connect(this.droneOsc.frequency); 

    this.droneGain.gain.value = 0.05; 

    this.droneOsc.connect(this.droneGain);
    this.droneGain.connect(this.ctx.destination); 

    this.droneOsc.start();
    this.droneLfo.start();
  }

  stopDrone() {
    if (this.droneOsc) {
        try {
            this.droneOsc.stop();
            this.droneLfo?.stop();
        } catch(e) {}
        this.droneOsc = null;
    }
  }

  playSfx(type: string, delay: number = 0) {
    const time = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.masterGain);

    if (type === 'bounceDrop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(1, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      osc.start(time);
      osc.stop(time + 0.3);
    } else if (type === 'scaleIn' || type === 'pop') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, time);
      osc.frequency.linearRampToValueAtTime(600, time + 0.05);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.5, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.start(time);
      osc.stop(time + 0.15);
    } else if (type === 'slideIn' || type === 'followPath' || type === 'spin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, time);
      osc.frequency.exponentialRampToValueAtTime(600, time + 0.2);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.1, time + 0.1);
      gain.gain.linearRampToValueAtTime(0, time + 0.3);
      osc.start(time);
      osc.stop(time + 0.3);
    } else if (type === 'drawPath') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, time);
      osc.frequency.linearRampToValueAtTime(400, time + 0.5);
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2000;
      osc.disconnect();
      osc.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.1, time + 0.05);
      gain.gain.linearRampToValueAtTime(0, time + 0.5);
      osc.start(time);
      osc.stop(time + 0.5);
    } else if (type === 'glitch' || type === 'scramble') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, time);
      osc.frequency.linearRampToValueAtTime(800, time + 0.05);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.15, time + 0.02);
      gain.gain.linearRampToValueAtTime(0, time + 0.1);
      osc.start(time);
      osc.stop(time + 0.1);
    } else if (type === 'focusOn') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, time);
      osc.frequency.linearRampToValueAtTime(50, time + 0.5);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3, time + 0.1);
      gain.gain.linearRampToValueAtTime(0, time + 0.5);
      osc.start(time);
      osc.stop(time + 0.5);
    }
  }
}

// Minimal Scene View
const SceneView = memo(({ svgContent, containerRef }: { svgContent: string, containerRef: React.RefObject<HTMLDivElement> }) => {
  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-black overflow-hidden [&>svg]:w-full [&>svg]:h-full select-none"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}, (prev, next) => prev.svgContent === next.svgContent);

const VideoPlayer: React.FC<VideoPlayerProps> = ({ project }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const sfxEngineRef = useRef<SfxEngine | null>(null);
  const animationsRef = useRef<Animation[]>([]);
  const scrambleIntervalsRef = useRef<number[]>([]);
  
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0); 
  const rafRef = useRef<number | null>(null);
  const sfxTimeoutsRef = useRef<number[]>([]);
  
  const currentScene = project.scenes[currentSceneIndex];
  const currentNarration = project.script?.find(s => s.scene_id === currentScene?.id)?.audio_narration;

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      sfxEngineRef.current = new SfxEngine(audioContextRef.current);
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const decodeAudio = async (base64: string): Promise<AudioBuffer> => {
    const ctx = initAudioContext();
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const safeLen = len % 2 === 0 ? len : len - 1;
    const int16Data = new Int16Array(bytes.buffer, 0, safeLen / 2);
    const buffer = ctx.createBuffer(1, int16Data.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < int16Data.length; i++) {
      channelData[i] = int16Data[i] / 32768.0;
    }
    return buffer;
  };

  // --- MOTION ENGINE ---
  const buildKeyframes = (action: MotionAction): Keyframe[] => {
    const { effect } = action;
    const parameters = action.parameters || {}; 
    const mag = parameters.magnitude ?? 1;

    switch (effect) {
      case 'fadeIn': return [{ opacity: 0 }, { opacity: 1 }];
      case 'scaleIn':
        // Elastic Pop: 0 -> 1.1 -> 1.0
        return [
           { transform: 'scale(0)', opacity: 0, offset: 0 }, 
           { transform: 'scale(1.1)', opacity: 1, offset: 0.7 },
           { transform: 'scale(1)', opacity: 1, offset: 1 }
        ];
      case 'bounceDrop':
        return [
          { transform: `translateY(${-300 * mag}px)`, opacity: 0, offset: 0 },
          { transform: 'translateY(0px)', opacity: 1, offset: 0.6 }, 
          { transform: `translateY(${-40 * mag}px)`, offset: 0.75 }, 
          { transform: 'translateY(0px)', offset: 1 }
        ];
      case 'slideIn':
        let dir = parameters.direction ?? 0;
        if (typeof dir === 'string' || isNaN(Number(dir))) {
           const d = String(dir).toLowerCase();
           if (d.includes('up')) dir = 270;
           else if (d.includes('down')) dir = 90;
           else if (d.includes('left')) dir = 180;
           else if (d.includes('right')) dir = 0;
           else dir = 0;
        }

        const rad = Number(dir) * Math.PI / 180;
        const tx = Math.cos(rad) * 500 * mag;
        const ty = Math.sin(rad) * 500 * mag;
        return [{ transform: `translate(${tx}px, ${ty}px)`, opacity: 0 }, { transform: 'translate(0, 0)', opacity: 1 }];
      case 'float':
        return [{ transform: 'translateY(0px)' }, { transform: `translateY(${-20 * mag}px)` }, { transform: 'translateY(0px)' }];
      case 'pulse':
        // Boosted Pulse
        return [{ transform: 'scale(1)' }, { transform: `scale(${1 + 0.15 * mag})` }, { transform: 'scale(1)' }];
      case 'orbit':
        return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];
      case 'spin':
        return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];
      case 'cameraPan':
        // Massive boost to Camera Pan for "Drift" effect
        // 1920x1080 -> 100px drift is meaningful
        return [
          { transform: 'scale(1) translate(0,0)' },
          { transform: `scale(${1 + 0.05 * mag}) translate(${150 * mag}px, ${-50 * mag}px)` }
        ];
      case 'glitch':
        const shake = 10 * mag;
        return [
          { transform: 'translate(0,0) skewX(0deg)', opacity: 1, offset: 0 },
          { transform: `translate(-${shake}px, ${shake}px) skewX(20deg)`, opacity: 0.8, offset: 0.1 },
          { transform: `translate(${shake}px, -${shake}px) skewX(-10deg)`, opacity: 1, offset: 0.2 },
          { transform: `translate(-${shake}px, 0) skewX(5deg)`, opacity: 0.4, offset: 0.3 },
          { transform: 'translate(0,0) skewX(0deg)', opacity: 1, offset: 0.4 },
          { transform: `translate(${shake}px, ${shake}px) skewX(-20deg)`, opacity: 0.9, offset: 0.8 },
          { transform: 'translate(0,0) skewX(0deg)', opacity: 1, offset: 1 }
        ];
      case 'followPath':
        return [{ offsetDistance: '0%' }, { offsetDistance: '100%' }];
      default:
        return [{ opacity: 0 }, { opacity: 1 }];
    }
  };

  const getEasing = (action: MotionAction): string => {
    const params = action.parameters || {};
    if (action.effect === 'bounceDrop') return 'linear'; // Managed by keyframes
    if (action.effect === 'scaleIn') return PHYSICS_EASING.elasticOut; // Overshoot
    if (['float', 'pulse'].includes(action.effect)) return 'ease-in-out';
    if (action.effect === 'cameraPan') return 'linear'; 
    if (action.effect === 'focusOn') return 'ease-in-out';
    if (action.effect === 'glitch' || action.effect === 'scramble') return 'steps(3, end)'; 
    if (action.effect === 'drawPath') return PHYSICS_EASING.draw;
    if (action.effect === 'followPath' || action.effect === 'spin' || action.effect === 'orbit') return 'linear';
    if (params.stiffness && params.stiffness > 100) return PHYSICS_EASING.springHeavy;
    return PHYSICS_EASING.spring; 
  };

  const scrambleTextEffect = (element: Element, duration: number, delay: number) => {
    if (!(element instanceof SVGTextElement)) return;
    let originalText = element.getAttribute('data-original-text');
    if (!originalText) {
        originalText = element.textContent || "";
        element.setAttribute('data-original-text', originalText);
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*";
    const startTime = Date.now() + (delay * 1000);
    const endTime = startTime + (duration * 1000);
    element.style.opacity = "0";
    
    const interval = window.setInterval(() => {
        const now = Date.now();
        if (now < startTime) return;
        element.style.opacity = "1";
        if (now >= endTime) {
            element.textContent = originalText;
            window.clearInterval(interval);
            return;
        }
        const progress = (now - startTime) / (duration * 1000);
        const revealIndex = Math.floor(progress * originalText!.length);
        let scrambled = "";
        for (let i = 0; i < originalText!.length; i++) {
            if (i <= revealIndex) scrambled += originalText![i];
            else scrambled += chars[Math.floor(Math.random() * chars.length)];
        }
        element.textContent = scrambled;
    }, 50);
    scrambleIntervalsRef.current.push(interval);
  };

  const applyMotionManifest = (manifest: MotionManifest, currentTimeOffset: number) => {
    if (!containerRef.current) return;
    animationsRef.current.forEach(anim => anim.cancel());
    animationsRef.current = [];
    sfxTimeoutsRef.current.forEach(t => window.clearTimeout(t));
    sfxTimeoutsRef.current = [];
    scrambleIntervalsRef.current.forEach(i => window.clearInterval(i));
    scrambleIntervalsRef.current = [];

    const svgRoot = containerRef.current.querySelector('svg');
    if (!svgRoot) return;
    if (!manifest || !manifest.actions) return; 

    // --- PRE-FLIGHT CHECK ---
    // Scan for entry effects and force hide them initially
    manifest.actions.forEach(action => {
      if (['fadeIn', 'scaleIn', 'slideIn', 'bounceDrop'].includes(action.effect)) {
        if (action.start_time_offset > 0.05) { // Only if there's a delay
           const element = svgRoot.getElementById(action.target_id);
           if (element) element.style.opacity = '0';
        }
      }
    });

    manifest.actions.forEach(action => {
      let element = svgRoot.getElementById(action.target_id);
      
      // Fallback search strategy if ID is slightly mismatched
      if (!element) {
        const allGroups = svgRoot.querySelectorAll('g[id], path[id], circle[id], rect[id]');
        for (let i = 0; i < allGroups.length; i++) {
           const id = allGroups[i].id;
           if (id === action.target_id || id.includes(action.target_id) || action.target_id.includes(id)) {
             element = allGroups[i] as HTMLElement;
             break;
           }
        }
      }

      if (!element) {
          if (action.effect === 'scramble') {
              const texts = svgRoot.querySelectorAll('text');
              const idx = parseInt(action.target_id.replace(/\D/g, ''));
              if (!isNaN(idx) && texts[idx]) element = texts[idx];
          }
      }
      if (!element) return;

      if (element instanceof SVGGraphicsElement) {
          element.style.transformBox = 'fill-box';
          element.style.transformOrigin = 'center';
      }

      // --- FOCUS ON EFFECT (Camera Dynamics) ---
      if (action.effect === 'focusOn') {
         if (element instanceof SVGGraphicsElement) {
            try {
              const bbox = element.getBBox();
              const cx = bbox.x + bbox.width / 2;
              const cy = bbox.y + bbox.height / 2;
              // Default center of SVG 1920x1080 is 960, 540
              // To focus on (cx, cy), we need to translate the camera_rig opposite to that vector
              // And scale up
              const zoom = action.parameters.zoom_level || 1.5;
              const moveX = (960 - cx) * zoom; // Adjust logic for center scaling
              const moveY = (540 - cy) * zoom;
              
              // We apply this to the camera_rig
              const camera = svgRoot.getElementById('camera_rig');
              if (camera) {
                 const kf = [
                   { transform: 'translate(0px, 0px) scale(1)' },
                   { transform: `translate(${960 - cx}px, ${540 - cy}px) scale(${zoom})` } // Simplified Center-based zoom
                 ];
                 const camEffect = new KeyframeEffect(camera, kf, {
                   duration: action.duration * 1000,
                   delay: action.start_time_offset * 1000,
                   fill: 'both',
                   easing: getEasing(action)
                 });
                 animationsRef.current.push(new Animation(camEffect, document.timeline));
              }
            } catch(e) { console.warn("Cannot calculate BBox for focusOn", e); }
         }
         return; // focusOn doesn't animate the target itself, it animates the camera
      }

      if (action.effect === 'scramble') {
          const textEl = element.tagName === 'text' ? element : element.querySelector('text');
          if (textEl) scrambleTextEffect(textEl, action.duration, action.start_time_offset);
          return;
      }

      if (action.effect === 'followPath') {
          let pathData = action.parameters.path_data;
          
          if (action.parameters.path_target_id) {
             let pathElement = svgRoot.getElementById(action.parameters.path_target_id);
             // Fallback search for path
             if (!pathElement) {
                const paths = svgRoot.querySelectorAll('path');
                for(let i=0; i<paths.length; i++) {
                    if (paths[i].id.includes(action.parameters.path_target_id)) {
                        pathElement = paths[i];
                        break;
                    }
                }
             }

             if (pathElement) {
                const d = pathElement.getAttribute('d');
                if (d) pathData = d;
             }
          }

          if (pathData) {
            // We use 'path()' which expects the geometry to be in the same coordinate space.
            // transform-box: fill-box is crucial here if the element has its own transform.
            (element as HTMLElement).style.setProperty('offset-path', `path('${pathData}')`);
            (element as HTMLElement).style.setProperty('offset-rotate', 'auto'); // Objects point forward along path
          }
      }

      if (action.effect === 'drawPath') {
        const findShapes = (el: Element): SVGGeometryElement[] => {
          const shapes: SVGGeometryElement[] = [];
          if (['path','line','circle','rect','ellipse','polyline'].includes(el.tagName)) {
            shapes.push(el as SVGGeometryElement);
          }
          Array.from(el.children).forEach(child => shapes.push(...findShapes(child)));
          return shapes;
        };
        const shapes = findShapes(element);
        shapes.forEach(shape => {
          try {
            const length = shape.getTotalLength();
            shape.style.strokeDasharray = `${length}`;
            shape.style.strokeDashoffset = `${length}`;
            shape.style.opacity = '1'; 
            shape.style.fillOpacity = '0'; 
            
            const effect = new KeyframeEffect(shape, [{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
                duration: action.duration * 1000, delay: action.start_time_offset * 1000, fill: 'both', easing: getEasing(action)
            });
            animationsRef.current.push(new Animation(effect, document.timeline));
            
            const fillEffect = new KeyframeEffect(shape, [{ fillOpacity: 0 }, { fillOpacity: 1 }], {
                duration: (action.duration * 0.3) * 1000, delay: (action.start_time_offset + (action.duration * 0.7)) * 1000, fill: 'both', easing: 'ease-out'
            });
            animationsRef.current.push(new Animation(fillEffect, document.timeline));
          } catch (e) {}
        });
        return; 
      }

      const effect = new KeyframeEffect(element, buildKeyframes(action), {
          duration: action.duration * 1000, 
          delay: action.start_time_offset * 1000, 
          fill: 'both', 
          easing: getEasing(action), 
          iterations: ['float', 'pulse', 'orbit', 'spin'].includes(action.effect) ? Infinity : 1,
          composite: action.effect === 'spin' || action.effect === 'orbit' ? 'add' : 'replace'
      });
      animationsRef.current.push(new Animation(effect, document.timeline));

      if (!isMuted && sfxEngineRef.current) {
        let triggerTime = action.start_time_offset;
        if (action.effect === 'bounceDrop') triggerTime += (action.duration * 0.6);
        const delayMs = (triggerTime * 1000) - currentTimeOffset;
        if (delayMs >= 0) {
          const t = window.setTimeout(() => { if (!isMuted) sfxEngineRef.current?.playSfx(action.effect); }, delayMs);
          sfxTimeoutsRef.current.push(t);
        }
      }
    });
  };

  const playCurrentScene = async () => {
    if (!currentScene) {
      setIsBuffering(true);
      return; 
    }
    setIsBuffering(false);

    try {
      const ctx = initAudioContext();
      if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch(e) {} audioSourceRef.current.disconnect(); }
      if (!isMuted) sfxEngineRef.current?.startDrone();

      let buffer: AudioBuffer | null = null;
      if (currentScene.audioBase64) {
        buffer = await decodeAudio(currentScene.audioBase64);
      }
      
      const durationMs = buffer ? buffer.duration * 1000 : currentScene.duration * 1000;
      const offset = pauseTimeRef.current / 1000;

      if (buffer && !isMuted) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        audioSourceRef.current = source;
        source.start(0, offset); 
      }

      applyMotionManifest(currentScene.motionManifest, pauseTimeRef.current);
      animationsRef.current.forEach(anim => { anim.currentTime = pauseTimeRef.current; anim.play(); });

      startTimeRef.current = Date.now() - pauseTimeRef.current;

      const loop = () => {
        const now = Date.now();
        const elapsed = now - startTimeRef.current;
        pauseTimeRef.current = elapsed;
        const p = Math.min(100, (elapsed / durationMs) * 100);
        if (progressBarRef.current) progressBarRef.current.style.width = `${p}%`;

        if (elapsed >= durationMs) {
           handleSceneComplete();
        } else {
           rafRef.current = requestAnimationFrame(loop);
        }
      };
      
      cancelAnimationFrame(rafRef.current!);
      rafRef.current = requestAnimationFrame(loop);

    } catch (e) {
      console.error("Playback error", e);
      setIsPlaying(false);
    }
  };

  const pausePlayback = () => {
    if (audioSourceRef.current) try { audioSourceRef.current.stop(); } catch(e) {}
    if (sfxEngineRef.current) sfxEngineRef.current.stopDrone();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    animationsRef.current.forEach(anim => anim.pause());
    sfxTimeoutsRef.current.forEach(t => window.clearTimeout(t));
    scrambleIntervalsRef.current.forEach(i => window.clearInterval(i));
  };

  const resetSceneState = () => {
    pauseTimeRef.current = 0;
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
    animationsRef.current.forEach(anim => anim.cancel());
    animationsRef.current = [];
    sfxTimeoutsRef.current.forEach(t => window.clearTimeout(t));
    scrambleIntervalsRef.current.forEach(i => window.clearInterval(i));
  };

  const handleSceneComplete = () => {
    if (currentSceneIndex < project.scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
      resetSceneState();
    } else {
      setIsPlaying(false);
      resetSceneState();
      setCurrentSceneIndex(0);
      sfxEngineRef.current?.stopDrone();
    }
  };

  useEffect(() => {
    if (isBuffering && project.scenes[currentSceneIndex]) {
        playCurrentScene();
    }
  }, [project.scenes.length, isBuffering]);

  const handleRenderOnServer = async () => {
    if (isPlaying) pausePlayback();
    setIsRendering(true);
    setRenderError(null);
    try {
      const response = await fetch('http://localhost:5000/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${project.topic.replace(/\s+/g, '_')}_final.mp4`; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
    } catch (err: any) {
      setRenderError(err.message || "Connection refused.");
    } finally { setIsRendering(false); }
  };

  useEffect(() => {
    if (isPlaying) playCurrentScene(); else pausePlayback();
    return () => {
      if (audioSourceRef.current) try { audioSourceRef.current.stop(); } catch(e) {}
      if (sfxEngineRef.current) sfxEngineRef.current.stopDrone();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      sfxTimeoutsRef.current.forEach(t => window.clearTimeout(t));
      scrambleIntervalsRef.current.forEach(i => window.clearInterval(i));
    };
  }, [isPlaying, currentSceneIndex, isMuted, project.scenes.length]); 

  // Empty State - Minimal
  if (!currentScene && project.scenes.length === 0) {
      return (
          <div className="w-full h-full min-h-[500px] bg-neutral-900/50 rounded-2xl flex flex-col items-center justify-center border border-white/5 text-neutral-500 gap-4">
               <div className="relative">
                 <div className="absolute inset-0 bg-white/20 blur-xl rounded-full animate-pulse"></div>
                 <RefreshCw className="animate-spin relative z-10" size={32} />
               </div>
               <span className="text-sm font-medium tracking-wide">Initializing Engine...</span>
          </div>
      );
  }

  return (
    <div 
        className="group/player relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
    >
        {/* CINEMATIC OVERLAY */}
        <div className="absolute inset-0 z-30 pointer-events-none mix-blend-overlay opacity-30 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat"></div>
        <div className="absolute inset-0 z-30 pointer-events-none bg-[radial-gradient(circle,transparent_40%,rgba(0,0,0,0.6)_100%)]"></div>

        {/* Render View */}
        {currentScene ? (
          <SceneView key={currentScene.id} svgContent={currentScene.svgContent} containerRef={containerRef} />
        ) : (
           <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500 gap-4">
              <RefreshCw className="animate-spin text-white" size={32} />
              <div className="text-center">
                  <p className="text-white text-sm font-medium mb-1">Buffering Scene {currentSceneIndex + 1}</p>
                  <p className="text-xs opacity-50">Stream incoming...</p>
              </div>
           </div>
        )}
        
        {/* Subtitles (Clean Glass) */}
        {isPlaying && currentNarration && (
            <div className="absolute bottom-20 left-0 right-0 flex justify-center z-20 px-12 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full text-white/90 text-sm font-medium text-center shadow-lg animate-fade-in border border-white/5">
                    {currentNarration}
                </div>
            </div>
        )}

        {/* Rendering Overlay */}
        {isRendering && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
             <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
             <h3 className="text-lg font-medium text-white mb-1">Exporting High-Res Video</h3>
             <p className="text-neutral-400 text-xs">Processing frames on server...</p>
          </div>
        )}

        {renderError && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
             <AlertTriangle size={32} className="text-red-500 mb-4" />
             <p className="text-red-400 text-sm mb-4">{renderError}</p>
             <button onClick={() => setRenderError(null)} className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-md border border-neutral-700">Dismiss</button>
          </div>
        )}

        {/* Floating Controls Island */}
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-out ${showControls || !isPlaying ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
           <div className="flex items-center gap-2 px-2 py-2 bg-neutral-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
             
             {/* Play/Pause */}
             <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-black hover:bg-neutral-200 transition active:scale-95">
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
             </button>

             <div className="w-px h-6 bg-white/10 mx-1"></div>

             {/* Restart */}
             <button onClick={() => { setCurrentSceneIndex(0); resetSceneState(); setIsPlaying(false); }} className="p-2.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition">
                <SkipBack size={18} />
             </button>

             {/* Mute */}
             <button onClick={() => setIsMuted(!isMuted)} className="p-2.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition">
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
             </button>

             {/* Progress Bar (Mini) */}
             <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden mx-2">
                <div ref={progressBarRef} className="h-full bg-white transition-all duration-100 ease-linear" style={{ width: '0%' }} />
             </div>

             <div className="w-px h-6 bg-white/10 mx-1"></div>

             {/* Render */}
             <button onClick={handleRenderOnServer} disabled={isRendering} className="p-2.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition" title="Render MP4">
                <Server size={18} />
             </button>

             <div className="px-3 text-xs font-mono text-neutral-500">
               {currentSceneIndex + 1} / {project.scenes.length || '-'}
             </div>

           </div>
        </div>
        
    </div>
  );
};

export default VideoPlayer;
