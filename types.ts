
export enum AgentStatus {
  IDLE = 'IDLE',
  WORKING = 'WORKING',
  DONE = 'DONE',
  ERROR = 'ERROR',
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  logs: string[];
  payload?: any; // Stores the output/state of the agent
}

export interface TimelineBlock {
  scene_id: number;
  time_start: number;
  time_end: number;
  visual_description: string;
  audio_narration: string;
  analogy?: string; // NEW: Forces the model to generate a "Mark Rober" style metaphor
}

export interface CuratedContent {
  summary: string;
  key_points: string[];
}

// Enhanced Director Script for precise animation control
export interface DirectorScript {
  scene_id: number;
  visual_style: string;
  color_palette: string[];
  font_family: string;
  layout_plan: string;
  background_elements: string;
  lighting_mood: string;
  actors: Array<{
    name: string;
    description: string;
    initial_position: string;
    // We now ask for "Physics Personality" instead of script
    motion_personality: "heavy" | "floaty" | "snappy" | "elastic"; 
  }>;
}

// --- NEW: VISUAL DICTIONARY ---
export interface CastMember {
  concept_name: string; 
  visual_shape: string; 
  color_role: "Primary" | "Secondary" | "Accent" | "Alert";
  icon_hint: string; 
  // New field to guide the illustrator with geometric primitives
  construction_advice: string;
}

// --- ENGINE TYPES ---

export type MotionEffectType = 
  | 'fadeIn' 
  | 'scaleIn' 
  | 'slideIn' 
  | 'bounceDrop' 
  | 'float' 
  | 'pulse' 
  | 'orbit'      // Revolution around a point
  | 'spin'       // Axial rotation (self-rotation)
  | 'drawPath'
  | 'followPath' // Object moves along a bezier curve
  | 'glitch'     
  | 'scramble'   // Matrix-style text decode
  | 'cameraPan'
  | 'focusOn';   // NEW: Camera zooms to center specific element

export interface MotionAction {
  target_id: string;
  effect: MotionEffectType;
  start_time_offset: number; // Seconds from scene start
  duration: number;
  parameters: {
    // Generic parameters that the physics engine interprets
    magnitude?: number; // How big is the movement?
    direction?: number; // Angle in degrees
    stiffness?: number; // For springs (1-500)
    damping?: number;   // For springs (1-50)
    path_data?: string; // Manual SVG Path Data
    path_target_id?: string; // Reference an existing SVG element ID to use as the path
    zoom_level?: number; // For focusOn (e.g., 1.5x zoom)
  };
}

export interface MotionManifest {
  scene_id: number;
  actions: MotionAction[];
}

export interface TechnicalSpec {
  scene_id: number;
  // New field for custom SVG definitions (gradients, clips, patterns)
  definitions?: string; 
  background_layer: {
    code: string; // FULL SVG string for background group
  };
  main_components: Array<{
    id: string; // STRICT ID required for the engine
    name: string;
    svg_content: string; // FULL SVG Element (e.g. <circle ... /> or <path ... />) including styles
    initial_transform: string; // e.g. "translate(960, 540) scale(0)"
  }>;
  // NEW: Labels and Text
  annotations: Array<{
    text: string;
    x: number;
    y: number;
    font_size: number;
    color: string;
    anchor: 'middle' | 'start' | 'end';
  }>;
}

export interface GeneratedScene {
  id: number;
  svgContent: string;
  motionManifest: MotionManifest; // The Engine Instruction Set
  audioBase64: string | null;
  duration: number;
}

export interface VideoProject {
  topic: string;
  curatedContent?: CuratedContent;
  script?: TimelineBlock[];
  castList?: CastMember[]; // The Visual Dictionary
  scenes: GeneratedScene[];
}
