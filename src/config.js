import { join } from 'path';

export const WRATH_DIR = '.wrath';
export const INDEX_FILE = 'index.json';
export const INDEX_PATH = join(WRATH_DIR, INDEX_FILE);

export const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.wrath',
  '.next',
  '.nuxt',
  'coverage',
  '.turbo',
  'out',
  '.cache',
  '__pycache__',
  '.DS_Store',
];

export const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.lua',
  '.html', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.txt',
  '.sh', '.bash', '.zsh',
  '.env.example', '.gitignore', '.dockerignore',
  'Dockerfile', 'Makefile',
];

// ── AI Configuration ───────────────────────────────────────────────────────

export const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic';

// Anthropic
export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
export const ANTHROPIC_API_VERSION = '2023-06-01';

// OpenAI
export const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Gemini
export const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

// Grok (xAI)
export const GROK_API_URL = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
export const GROK_MODEL = process.env.GROK_MODEL || 'grok-2-latest';

// Mistral
export const MISTRAL_API_URL = process.env.MISTRAL_API_URL || 'https://api.mistral.ai/v1/chat/completions';
export const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';

// Cohere
export const COHERE_API_URL = process.env.COHERE_API_URL || 'https://api.cohere.com/v1/chat';
export const COHERE_MODEL = process.env.COHERE_MODEL || 'command-r-plus';

// ── System Constraints ─────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB cap per file
export const MAX_CONTEXT_FILES = 10;