import type {
  CharacterDefinition,
  ProjectPlan,
  ScenarioDefinition,
  StudioSettings,
} from '../types/studio';
import {
  DEFAULT_STUDIO_SETTINGS,
  STARTER_CHARACTERS,
  STARTER_SCENARIOS,
} from '../data/presets';
import { normalizeToContractV1 } from '../contracts/projectContract';

const KEYS = {
  PROJECTS: 'ai2d_studio_projects_v1',
  CHARACTERS: 'ai2d_studio_characters_v1',
  SCENARIOS: 'ai2d_studio_scenarios_v1',
  SETTINGS: 'ai2d_studio_settings_v1',
};

function safeRead<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedProjects(): ProjectPlan[] {
  const raw = safeRead<unknown>(KEYS.PROJECTS, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ProjectPlan> => Boolean(item && typeof item === 'object' && Array.isArray((item as Partial<ProjectPlan>).scenes)))
    .map((p) => normalizeToContractV1(p));
}

export function saveProjects(projects: ProjectPlan[]): boolean {
  return safeWrite(KEYS.PROJECTS, projects);
}

export function loadLibraryCharacters(): CharacterDefinition[] {
  const raw = safeRead<unknown>(KEYS.CHARACTERS, []);
  const saved = Array.isArray(raw)
    ? raw.filter((c): c is CharacterDefinition => Boolean(c && typeof c === 'object' && typeof (c as CharacterDefinition).id === 'string'))
    : [];
  if (saved.length === 0) return STARTER_CHARACTERS;
  // Ensure starter characters stay available while preserving user edits/additions
  const savedIds = new Set(saved.map((c) => c.id));
  const missingStarters = STARTER_CHARACTERS.filter((c) => !savedIds.has(c.id));
  return [...saved, ...missingStarters];
}

export function saveLibraryCharacters(chars: CharacterDefinition[]): boolean {
  return safeWrite(KEYS.CHARACTERS, chars);
}

export function loadLibraryScenarios(): ScenarioDefinition[] {
  const raw = safeRead<unknown>(KEYS.SCENARIOS, []);
  const saved = Array.isArray(raw)
    ? raw.filter((s): s is ScenarioDefinition => Boolean(s && typeof s === 'object' && typeof (s as ScenarioDefinition).id === 'string'))
    : [];
  if (saved.length === 0) return STARTER_SCENARIOS;
  const savedIds = new Set(saved.map((s) => s.id));
  const missingStarters = STARTER_SCENARIOS.filter((s) => !savedIds.has(s.id));
  return [...saved, ...missingStarters];
}

export function saveLibraryScenarios(scenarios: ScenarioDefinition[]): boolean {
  return safeWrite(KEYS.SCENARIOS, scenarios);
}

export function loadStudioSettings(): StudioSettings {
  const raw = safeRead<unknown>(KEYS.SETTINGS, {});
  const partial = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<StudioSettings>) : {};
  return {
    ...DEFAULT_STUDIO_SETTINGS,
    ...partial,
  };
}

export function saveStudioSettings(settings: StudioSettings): boolean {
  return safeWrite(KEYS.SETTINGS, settings);
}
