
import { CuratedContent, TimelineBlock, CastMember, GeneratedScene, VideoProject } from '../types';

export const DEMO_TOPIC = "How a Mechanical Watch Works (Demo)";

export const DEMO_CURATED: CuratedContent = {
  summary: "A mechanical watch uses a mainspring to store energy, transmitted through gears to the escapement, which regulates the release of energy to move the hands.",
  key_points: [
    "Mainspring stores potential energy.",
    "Gear train transmits torque.",
    "Escapement regulates timekeeping."
  ]
};

export const DEMO_TIMELINE: TimelineBlock[] = [
  {
    scene_id: 1,
    time_start: 0,
    time_end: 6,
    visual_description: "Energy flows from the wound Mainspring to the Center Wheel.",
    audio_narration: "Inside the watch, the mainspring uncoils, releasing raw energy into the system."
  },
  {
    scene_id: 2,
    time_start: 6,
    time_end: 12,
    visual_description: "The Escapement rocks back and forth, locking and unlocking the Gear Train.",
    audio_narration: "This raw energy is tamed by the escapement, which ticks precisely back and forth."
  }
];

export const DEMO_CAST: CastMember[] = [
  { concept_name: "Mainspring", visual_shape: "Spiral", color_role: "Primary", icon_hint: "Coil", construction_advice: "Spiral path" },
  { concept_name: "Gear", visual_shape: "Toothed Circle", color_role: "Secondary", icon_hint: "Cog", construction_advice: "Circle with teeth" }
];

// Simple SVG strings for the demo - Updated with Camera Rig group for cameraPan
const SVG_SCENE_1 = `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/></pattern></defs><g id="camera_rig" transform-origin="center"><rect width="1920" height="1080" fill="#0f172a"/><rect width="1920" height="1080" fill="url(#grid-pattern)" opacity="0.3" /><g transform="translate(960, 540)"><circle r="200" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.2"/><g id="spring"><path d="M0,0 m-100,0 a100,100 0 1,0 200,0 a100,100 0 1,0 -200,0 a80,80 0 1,0 160,0 a80,80 0 1,0 -160,0 a60,60 0 1,0 120,0" fill="none" stroke="#6366f1" stroke-width="8" stroke-linecap="round" /></g></g><text x="960" y="900" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="24">Mainspring Energy</text></g></svg>`;

const SVG_SCENE_2 = `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/></pattern></defs><g id="camera_rig" transform-origin="center"><rect width="1920" height="1080" fill="#0f172a"/><rect width="1920" height="1080" fill="url(#grid-pattern)" opacity="0.3" /><g transform="translate(960, 540)"><g id="gear"><circle r="150" fill="none" stroke="#10b981" stroke-width="15"/><line x1="0" y1="-150" x2="0" y2="150" stroke="#10b981" stroke-width="15"/><line x1="-150" y1="0" x2="150" y2="0" stroke="#10b981" stroke-width="15"/><circle r="50" fill="#0f172a" stroke="#10b981" stroke-width="5"/></g></g><text x="960" y="900" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="24">Escapement Mechanism</text></g></svg>`;

export const DEMO_SCENES: GeneratedScene[] = [
  {
    id: 1,
    svgContent: SVG_SCENE_1,
    motionManifest: {
      scene_id: 1,
      actions: [
        { target_id: "spring", effect: "scaleIn", start_time_offset: 0, duration: 2, parameters: { magnitude: 1 } },
        { target_id: "spring", effect: "pulse", start_time_offset: 2, duration: 3, parameters: { magnitude: 0.1 } },
        { target_id: "camera_rig", effect: "cameraPan", start_time_offset: 0, duration: 6, parameters: { magnitude: 0.5 } } // Added camera move
      ]
    },
    audioBase64: null, 
    duration: 6
  },
  {
    id: 2,
    svgContent: SVG_SCENE_2,
    motionManifest: {
      scene_id: 2,
      actions: [
        { target_id: "gear", effect: "orbit", start_time_offset: 0, duration: 5, parameters: { magnitude: 1 } }
      ]
    },
    audioBase64: null,
    duration: 6
  }
];

export const DEMO_PROJECT: VideoProject = {
  topic: DEMO_TOPIC,
  curatedContent: DEMO_CURATED,
  script: DEMO_TIMELINE,
  castList: DEMO_CAST,
  scenes: DEMO_SCENES
};
