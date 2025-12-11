
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { TimelineBlock, CuratedContent, DirectorScript, TechnicalSpec, MotionManifest, GeneratedScene, CastMember } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- UTILS ---

const safeParseJSON = <T>(text: string | undefined | null, context: string): T => {
  if (!text) {
    console.error(`Empty response text for ${context}`);
    throw new Error(`Failed to parse JSON for ${context}: Response text is empty.`);
  }
  try {
    // 1. First cleanup: Remove markdown code blocks
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // 2. Aggressive cleanup: Find the first '{' or '[' and the last '}' or ']'
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    
    let startIndex = -1;
    if (firstBrace === -1 && firstBracket === -1) startIndex = 0;
    else if (firstBrace === -1) startIndex = firstBracket;
    else if (firstBracket === -1) startIndex = firstBrace;
    else startIndex = Math.min(firstBrace, firstBracket);

    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');
    const endIndex = Math.max(lastBrace, lastBracket);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        cleaned = cleaned.substring(startIndex, endIndex + 1);
    }

    cleaned = cleaned.trim();
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.error(`JSON Parse Error in ${context}:`, error);
    const snippet = text.length > 500 ? text.substring(0, 500) + "..." : text;
    console.log(`Raw Text (snippet):`, snippet); 
    throw new Error(`Failed to parse JSON for ${context}.`);
  }
};

// Retry wrapper for API calls to handle 429s
const generateWithRetry = async (
  modelName: string, 
  params: any, 
  retries = 3, 
  delay = 2000
): Promise<any> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      ...params
    });
    
    if (!response.text) {
      console.warn(`[${modelName}] Response returned with no text. FinishReason:`, response.candidates?.[0]?.finishReason);
    }

    return response;
  } catch (error: any) {
    const isRateLimit = error.message?.includes('429') || error.status === 429 || error.message?.includes('quota');
    if (isRateLimit && retries > 0) {
      console.warn(`Rate limit hit for ${modelName}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return generateWithRetry(modelName, params, retries - 1, delay * 2);
    }
    throw error;
  }
};

// --- AGENTS ---

// 1. Curator: Uses 3 Pro for Deep Reasoning
export const runCuratorAgent = async (topic: string): Promise<CuratedContent> => {
  const prompt = `Topic: "${topic}". 
  Identify the key MECHANICAL, PHYSICAL, and MATHEMATICAL cause-and-effect details.
  Focus on: "Input -> Mechanism -> Output".
  If the topic involves physics (e.g. orbits, forces), explicitly mention the vectors (Gravity, Velocity, Inertia) and their relationships.
  Output JSON.`;

  const response = await generateWithRetry('gemini-3-pro-preview', {
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          key_points: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['summary', 'key_points']
      },
    }
  });

  return safeParseJSON<CuratedContent>(response.text, "Curator Agent");
};

// 2. Narrator: Dynamic Persona (3 Pro for nuance)
export const runNarratorAgent = async (
  topic: string, 
  curated: CuratedContent,
  targetDuration: string = 'Auto',
  narrationStyle: string = 'Casual'
): Promise<TimelineBlock[]> => {
  
  // 1. Duration Constraint
  let durationConstraint = "Duration per scene: Variable (5-15s). Total length: Determined by complexity.";
  if (targetDuration !== 'Auto') {
    durationConstraint = `**STRICT TIMING**: The total duration of all scenes combined MUST be approximately **${targetDuration}**. Adjust the number of scenes and their individual lengths to fit exactly.`;
  }

  // 2. Style Persona Logic
  let personaPrompt = "";
  switch(narrationStyle) {
    case 'Academic':
      personaPrompt = `
      You are a Distinguished University Professor.
      TONE: Formal, Precise, Authoritative. NO slang.
      INSTRUCTION: Focus on definitions, axioms, and first principles. Use technical terminology correctly.
      `;
      break;
    case 'Dramatic':
      personaPrompt = `
      You are a Documentary Narrator (Think David Attenborough or NatGeo).
      TONE: Epic, Cinematic, Slow-paced, Awe-inspiring.
      INSTRUCTION: Frame the topic as a grand story of nature or engineering. Use poetic language.
      `;
      break;
    case 'Minimalist':
      personaPrompt = `
      You are a Mathematical Intuitionist (Think 3Blue1Brown).
      TONE: Calm, Socratic, Question-driven.
      INSTRUCTION: Focus on "Why?" and "How?". Guide the viewer to discover the answer themselves. Use clean, simple language.
      `;
      break;
    case 'Casual':
    default:
      personaPrompt = `
      You are an elite Science Communicator (Think Mark Rober or Kurzgesagt Narrator).
      TONE: Enthusiastic, High-Energy, Conversational.
      INSTRUCTION: Use **ANALOGIES** for every complex concept (e.g., "Think of voltage like water pressure").
      `;
      break;
  }

  const prompt = `
  ${personaPrompt}

  Topic: ${topic}. 
  Key Points: ${JSON.stringify(curated.key_points)}.

  **GOAL**: Write a script that strictly follows the requested TONE.
  
  **STRUCTURE**:
  - Break the explanation into a timeline.
  - ${durationConstraint}
  - 'analogy' field: If using the Casual style, state the analogy. If Academic, state the Principle being applied.
  
  Output JSON.`;

  const response = await generateWithRetry('gemini-3-pro-preview', {
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            scene_id: { type: Type.INTEGER },
            time_start: { type: Type.NUMBER },
            time_end: { type: Type.NUMBER },
            visual_description: { type: Type.STRING },
            audio_narration: { type: Type.STRING },
            analogy: { type: Type.STRING } 
          },
          required: ['scene_id', 'time_start', 'time_end', 'visual_description', 'audio_narration']
        }
      },
    }
  });

  return safeParseJSON<TimelineBlock[]>(response.text, "Narrator Agent");
};

// 3. Casting: "Visual Dictionary" - Uses 3 Pro for creative consistency
export const runCastingAgent = async (topic: string, timeline: TimelineBlock[]): Promise<CastMember[]> => {
  const prompt = `Visual Artist. Topic: ${topic}.
  Script: ${JSON.stringify(timeline.map(t => t.visual_description))}.
  
  Create a "Visual Dictionary" for the important concepts.
  
  **DESIGN LANGUAGE: KURZGESAGT (FLAT VECTOR)**:
  1. **BACKGROUND COMPATIBILITY**: The background is DEEP SPACE (Black/Midnight Blue).
  2. **COLORS**: Use **VIBRANT, FLAT COLORS**.
     - **Good**: #FFD700 (Gold), #00BFFF (Deep Sky Blue), #FF4500 (Orange Red), #32CD32 (Lime Green), #FFFFFF (White).
     - **Bad**: Dark Grey, Brown, Maroon, Navy (These disappear on black).
  3. **SHAPE LANGUAGE**: "Chunky" and "Friendly". 
     - Avoid complex realistic textures. Use simple circles, rounded rectangles, and thick lines.
  4. **CONSISTENCY**: Assign a unique color to each concept.
  
  Output JSON.`;

  const response = await generateWithRetry('gemini-3-pro-preview', {
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            concept_name: { type: Type.STRING },
            visual_shape: { type: Type.STRING },
            color_role: { type: Type.STRING, enum: ["Primary", "Secondary", "Accent", "Alert"] },
            icon_hint: { type: Type.STRING },
            construction_advice: { type: Type.STRING, description: "Advice for the Illustrator: 'Use gradient', 'Make it glow', etc." }
          },
          required: ['concept_name', 'visual_shape', 'color_role', 'icon_hint', 'construction_advice']
        }
      }
    }
  });
  
  return safeParseJSON<CastMember[]>(response.text, "Casting Agent");
};

// 4. Director: "Composition Master" - Uses 3 Pro for spatial reasoning
export const runDirectorAgent = async (topic: string, timeline: TimelineBlock[]): Promise<DirectorScript[]> => {
  const prompt = `Motion Graphics Director. Topic: ${topic}.
  Script: ${JSON.stringify(timeline)}.
  
  **STYLE GUIDE: KURZGESAGT EDUCATION**:
  - **Aesthetic**: Flat Vector Art, but with **Soft Glows** for depth.
  - **Layout**: 
    - **Centralized but Spacious**: Main subject in center/thirds.
    - **Floating**: Objects should feel like they are floating in space, not stuck to a floor.
  - **Motion Personality**:
    - "Snappy" for interface/tech elements.
    - "Floaty" for space/nature elements.
  
  Output JSON.`;

  const response = await generateWithRetry('gemini-3-pro-preview', {
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            scene_id: { type: Type.INTEGER },
            visual_style: { type: Type.STRING },
            color_palette: { type: Type.ARRAY, items: { type: Type.STRING } },
            font_family: { type: Type.STRING },
            layout_plan: { type: Type.STRING },
            background_elements: { type: Type.STRING },
            lighting_mood: { type: Type.STRING },
            actors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  initial_position: { type: Type.STRING },
                  motion_personality: { type: Type.STRING, enum: ["heavy", "floaty", "snappy", "elastic"] }
                },
                required: ['name', 'description', 'initial_position', 'motion_personality']
              }
            }
          },
          required: ['scene_id', 'visual_style', 'color_palette', 'layout_plan', 'actors']
        }
      }
    }
  });

  return safeParseJSON<DirectorScript[]>(response.text, "Director Agent");
};

// 5. Technical Illustrator: "Vector Engineer" - STRICT CONSTRAINTS (Already using Pro)
export const runTechnicalIllustratorAgent = async (
  scene: TimelineBlock, 
  directorScript: DirectorScript,
  castList: CastMember[]
): Promise<TechnicalSpec> => {
  const prompt = `You are a Technical Illustrator for an explainer video (Style: Kurzgesagt).
  Goal: Create a HIGH-FIDELITY SVG (1920x1080) for SCENE ID: ${scene.scene_id}.
  Scene Context: ${scene.visual_description}
  Layout: ${directorScript.layout_plan}
  
  CAST: ${JSON.stringify(castList.map(c => ({ name: c.concept_name, advice: c.construction_advice, color: c.color_role })))}
  
  *** CRITICAL INSTRUCTION: SELF-CONTAINED SVG ***
  1. **WRITE FULL TAGS**: You must write the COMPLETE SVG element string in the 'svg_content' field.
     - **Incorrect**: geometry: "M10 10...", fill: "red" (Ambiguous)
     - **Correct**: svg_content: "<path d='M10 10...' stroke='#FF0000' stroke-width='8' fill='none' stroke-linecap='round' />"

  2. **STROKE VS FILL**:
     - **ARROWS / VECTORS / ORBITS**: MUST use 'stroke', 'stroke-width' (min 6), and 'fill="none"'.
     - **SOLID SHAPES (Planets)**: MUST use 'fill'.
     - **DO NOT** apply 'fill' to a line path, it will be invisible or broken.

  3. **ROUNDED SHAPES**:
     - Do not use sharp rectangles. Use <rect rx="20" ry="20" ... />.
     - Use 'stroke-linecap="round"' on ALL lines.

  4. **VISIBILITY**:
     - Canvas is BLACK. Use Bright Colors. NEVER use black strokes.
  
  5. **ANNOTATIONS**:
     - Create a "Main Label" if there is a key concept. Use a large font size (40+).

  Output JSON.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      scene_id: { type: Type.INTEGER },
      definitions: { type: Type.STRING, description: "Raw SVG string for <defs> (gradients, filters, markers)" },
      background_layer: {
         type: Type.OBJECT,
         properties: {
           code: { type: Type.STRING, description: "Full SVG <g> or <rect> for background elements." }
         },
         required: ['code']
      },
      main_components: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "Strict lowercase ID. No spaces." },
            name: { type: Type.STRING },
            svg_content: { type: Type.STRING, description: "FULL SVG Element string (e.g. <path d='...' stroke='...' />). INCLUDE ALL STYLING HERE." },
            initial_transform: { type: Type.STRING }
          },
          required: ['id', 'name', 'svg_content', 'initial_transform']
        }
      },
      annotations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            font_size: { type: Type.NUMBER },
            color: { type: Type.STRING },
            anchor: { type: Type.STRING, enum: ['start', 'middle', 'end'] }
          },
          required: ['text', 'x', 'y', 'font_size', 'color', 'anchor']
        }
      }
    },
    required: ['scene_id', 'background_layer', 'main_components', 'annotations']
  };

  try {
    const response = await generateWithRetry('gemini-3-pro-preview', {
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    }, 3, 3000);

    if (!response.text) {
      throw new Error("Pro model returned empty text.");
    }

    return safeParseJSON<TechnicalSpec>(response.text, "Technical Illustrator Agent (Pro)");

  } catch (error) {
    console.warn("Gemini 3 Pro failed for Technical Illustrator. Falling back to Flash.", error);
    const response = await generateWithRetry('gemini-2.5-flash', {
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    });
    return safeParseJSON<TechnicalSpec>(response.text, "Technical Illustrator Agent (Fallback)");
  }
};

// 6. Kinematics: "Bouncy & Alive" - Upgraded to 3 Pro for complex animation logic
export const runKinematicEngineAgent = async (
  scene: TimelineBlock,
  directorScript: DirectorScript,
  techSpec: TechnicalSpec
): Promise<MotionManifest> => {
  const prompt = `You are a Physics Engine Configurator.
  Scene ID: ${scene.scene_id}
  Scene Duration: ${scene.time_end - scene.time_start}s.
  Actors: ${JSON.stringify(directorScript.actors)}.
  
  AVAILABLE COMPONENT IDs: 
  ${JSON.stringify(techSpec.main_components.map(c => ({ name: c.name, id: c.id })))}.

  Create a Motion Manifest JSON.
  
  *** ANIMATION RULES: THE "POP" FACTOR ***
  1. **ENTRANCES**: Use 'scaleIn' or 'bounceDrop' for almost EVERYTHING. Things should pop into existence, not just fade.
     - Set magnitude to 1.2 for scaleIn to create an "Overshoot" pop.
  
  2. **CONSTANT MOTION**:
     - **Always** add 'cameraPan' to 'camera_rig' (magnitude 0.3).
     - **Always** add 'float' or 'pulse' to static objects (magnitude 0.5).
  
  3. **COORDINATION**:
     - If drawing a path ('drawPath'), make the object 'followPath' simultaneously.

  Output JSON only.`;

  const response = await generateWithRetry('gemini-3-pro-preview', {
    contents: prompt,
    config: {
      temperature: 0.4, 
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scene_id: { type: Type.INTEGER },
          actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                target_id: { type: Type.STRING, description: "Must match one of the provided component IDs or 'camera_rig'." },
                effect: { type: Type.STRING, enum: ['fadeIn', 'scaleIn', 'slideIn', 'bounceDrop', 'float', 'pulse', 'orbit', 'spin', 'drawPath', 'followPath', 'glitch', 'scramble', 'cameraPan', 'focusOn'] },
                start_time_offset: { type: Type.NUMBER },
                duration: { type: Type.NUMBER },
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    magnitude: { type: Type.NUMBER },
                    direction: { type: Type.NUMBER },
                    stiffness: { type: Type.NUMBER },
                    damping: { type: Type.NUMBER },
                    path_data: { type: Type.STRING },
                    path_target_id: { type: Type.STRING },
                    zoom_level: { type: Type.NUMBER }
                  },
                  required: ['magnitude']
                }
              },
              required: ['target_id', 'effect', 'start_time_offset', 'duration', 'parameters']
            }
          }
        },
        required: ['scene_id', 'actions']
      }
    }
  });

  return safeParseJSON<MotionManifest>(response.text, "Kinematic Engine Agent");
};

// 7. Assembler (Local - No API)
export const runSVGAssemblerAgent = async (techSpec: TechnicalSpec): Promise<string> => {
  const bg = techSpec.background_layer;
  
  const components = techSpec.main_components.map(c => {
    // The Illustrator now provides full SVG elements, so we just wrap them in the ID group
    return `
      <g transform="${c.initial_transform}" filter="url(#soft-pop)"> 
        <g id="${c.id}">
           ${c.svg_content}
        </g>
        <desc>${c.name}</desc>
      </g>
    `;
  }).join('\n');

  const annotations = (techSpec.annotations || []).map((a, i) => {
    const uniqueId = `text-annotation-${i}`;
    return `
      <g id="${uniqueId}" opacity="0"> 
        <text 
          x="${a.x}" 
          y="${a.y}" 
          font-family="'JetBrains Mono', monospace" 
          font-size="${a.font_size}" 
          fill="${a.color}" 
          text-anchor="${a.anchor}"
          font-weight="700"
          filter="url(#text-outline)"
          style="paint-order: stroke; stroke: #000000; stroke-width: 4px;"
          data-original-text="${a.text}"
        >
          ${a.text}
        </text>
      </g>
    `;
  }).join('\n');

  const svgBody = `
    <defs>
      <!-- SYSTEM GRADIENTS -->
      <radialGradient id="sys-atmosphere" cx="50%" cy="50%" r="80%" fx="50%" fy="50%">
         <stop offset="0%" stop-color="#1e293b" stop-opacity="0" />
         <stop offset="100%" stop-color="#020617" stop-opacity="1" />
      </radialGradient>

      <!-- STYLE FILTERS: CLEAN VECTOR -->
      
      <filter id="soft-pop" x="-50%" y="-50%" width="200%" height="200%">
        <!-- Soft Drop Shadow for separation -->
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.5" />
        <!-- Subtle Inner Light for "rounded" feel -->
        <feGaussianBlur stdDeviation="2" result="blur" in="SourceAlpha"/>
        <feSpecularLighting surfaceScale="2" specularConstant="0.5" specularExponent="10" lighting-color="#ffffff" in="blur" result="specular">
           <fePointLight x="0" y="-10000" z="10000"/>
        </feSpecularLighting>
        <feComposite in="specular" in2="SourceAlpha" operator="in" result="specular-masked"/>
        <feMerge>
           <feMergeNode in="SourceGraphic"/>
           <feMergeNode in="specular-masked"/>
        </feMerge>
      </filter>

      <filter id="text-outline">
         <feMorphology operator="dilate" radius="1" in="SourceAlpha" result="expanded"/>
         <feFlood flood-color="#000000"/>
         <feComposite in2="expanded" operator="in"/>
         <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
         </feMerge>
      </filter>

      <!-- Tron Grid Pattern -->
      <pattern id="grid-pattern" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#3b82f6" stroke-width="1" stroke-opacity="0.2"/>
      </pattern>

      <!-- Agent Generated Definitions -->
      ${techSpec.definitions || ''}
    </defs>
    
    <g id="camera_rig" transform-origin="center">
      <g id="background-layer">
        <!-- BASE: Deep Space Blue/Black -->
        <rect width="1920" height="1080" fill="#020617" />
        
        <!-- LAYER 1: Dynamic Grid (Makes movement visible) -->
        <rect width="1920" height="1080" fill="url(#grid-pattern)" />
        
        <!-- LAYER 2: Atmosphere Vignette -->
        <rect width="1920" height="1080" fill="url(#sys-atmosphere)" />

        <!-- LAYER 3: Agent generated background specifics -->
        <g opacity="0.6">
           ${bg.code}
        </g>
      </g>

      ${components}

      <g id="annotations-layer">
        ${annotations}
      </g>
    </g>
  `;

  return `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">${svgBody}</svg>`;
};

// 8. Audio: Uses TTS (Zephyr for the "cool science teacher" vibe)
export const runAudioAgent = async (text: string): Promise<string | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: { parts: [{ text: text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }, // Changed to Zephyr for energetic/neutral tone
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("Audio generation failed", error);
    return null;
  }
};
