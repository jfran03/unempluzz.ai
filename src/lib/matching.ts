import { prisma } from "@/lib/db";

/**
 * Skill/experience categories with synonyms and related terms.
 * Each category groups terms that represent the same domain of expertise,
 * so "IT asset lifecycle" on a resume matches "device deployment" in a job.
 */
/**
 * Categories are split into "core" (technical, field-defining) and "supporting"
 * (generic, appear in many fields). A job MUST match at least 2 core categories
 * to qualify. Supporting categories alone cannot make a job a high match.
 */
export const SKILL_CATEGORIES: { name: string; weight: number; core: boolean; terms: string[] }[] = [
  // IT Support & Help Desk
  {
    name: "it-support",
    weight: 3,
    core: true,
    terms: [
      "help desk", "service desk", "it support", "technical support", "tier 1", "tier 2",
      "deskside support", "it service management", "itsm", "itil",
      "service request", "ticket",
    ],
  },
  // Device & Endpoint Management
  {
    name: "endpoint-management",
    weight: 3,
    core: true,
    terms: [
      "endpoint", "device management", "asset lifecycle", "imaging",
      "decommission", "mdm", "intune", "sccm", "mecm", "jamf",
      "mobile device management", "device deployment",
      "windows", "macos", "operating system",
    ],
  },
  // Security & Compliance (IT-specific)
  {
    name: "security",
    weight: 2,
    core: true,
    terms: [
      "cybersecurity", "infosec", "information security",
      "access control", "active directory", "entra id",
      "conditional access", "encryption", "antivirus", "edr",
      "vulnerability", "patching", "patch management", "security baseline",
      "siem", "firewall", "network security",
    ],
  },
  // Programming Languages
  {
    name: "programming",
    weight: 2,
    core: true,
    terms: [
      "python", "java", "javascript", "typescript", "c#", "c++",
      "html", "css", "sql", "powershell", "bash",
      "programming", "software development", "software engineer",
    ],
  },
  // Web Development & Frameworks
  {
    name: "web-dev",
    weight: 2,
    core: true,
    terms: [
      "react", "next.js", "nextjs", "express", "fastapi", "spring boot",
      "node.js", "nodejs", "frontend", "front-end", "backend", "back-end",
      "full-stack", "fullstack", "web application",
    ],
  },
  // Cloud & Infrastructure
  {
    name: "cloud",
    weight: 2,
    core: true,
    terms: [
      "aws", "azure", "gcp", "firebase", "supabase",
      "devops", "ci/cd", "docker", "kubernetes", "cloud computing",
    ],
  },
  // Data Science & ML
  {
    name: "data-ml",
    weight: 2,
    core: true,
    terms: [
      "machine learning", "data science", "data scientist",
      "pytorch", "scikit", "sklearn", "tensorflow",
      "deep learning", "neural network", "nlp", "computer vision",
    ],
  },
  // --- Supporting categories below (cannot qualify a job alone) ---
  // Documentation & Communication
  {
    name: "documentation",
    weight: 1,
    core: false,
    terms: [
      "technical documentation", "sop", "knowledge article",
      "knowledge base", "technical writing",
    ],
  },
  // Automation & Scripting
  {
    name: "automation",
    weight: 1,
    core: false,
    terms: [
      "automation", "scripting", "powershell", "workflow automation",
    ],
  },
  // Collaboration & Teamwork
  {
    name: "teamwork",
    weight: 0.5,
    core: false,
    terms: [
      "cross-functional", "agile", "scrum",
    ],
  },
  // Education Level
  {
    name: "education",
    weight: 0.5,
    core: false,
    terms: [
      "early career", "intern", "internship", "co-op",
      "entry level", "entry-level", "junior", "new grad",
    ],
  },
];

// --- Dynamic weight learning ---
const LEARNING_RATE = 0.1;
const DECAY = 0.95;
const MAX_DELTA_RATIO = 0.5; // never adjust more than 50% of base weight
const WEIGHT_ADJUSTMENTS_KEY = "weightAdjustments";

type CategoryAdjustment = { delta: number; upCount: number; downCount: number };
type WeightAdjustmentsRecord = Record<string, CategoryAdjustment>;

export async function loadWeightAdjustments(): Promise<Map<string, number>> {
  const row = await prisma.setting.findUnique({ where: { key: WEIGHT_ADJUSTMENTS_KEY } });
  if (!row) return new Map();
  const parsed: WeightAdjustmentsRecord = JSON.parse(row.value);
  const map = new Map<string, number>();
  for (const [name, adj] of Object.entries(parsed)) {
    map.set(name, adj.delta);
  }
  return map;
}

export async function applyFeedbackToWeights(
  jobText: string,
  oldFeedback: string | null,
  newFeedback: string | null
): Promise<void> {
  if (oldFeedback === newFeedback) return;

  const jobCategories = detectCategories(jobText);
  if (jobCategories.size === 0) return;

  // Load current adjustments
  const row = await prisma.setting.findUnique({ where: { key: WEIGHT_ADJUSTMENTS_KEY } });
  const adjustments: WeightAdjustmentsRecord = row ? JSON.parse(row.value) : {};

  for (const [catName, strength] of jobCategories) {
    const cat = SKILL_CATEGORIES.find((c) => c.name === catName);
    if (!cat) continue;

    const maxDelta = cat.weight * MAX_DELTA_RATIO;
    const current = adjustments[catName] ?? { delta: 0, upCount: 0, downCount: 0 };

    // Undo old feedback
    if (oldFeedback === "up") {
      current.delta = DECAY * current.delta - LEARNING_RATE * strength;
      current.upCount = Math.max(current.upCount - 1, 0);
    } else if (oldFeedback === "down") {
      current.delta = DECAY * current.delta + LEARNING_RATE * strength;
      current.downCount = Math.max(current.downCount - 1, 0);
    }

    // Apply new feedback
    if (newFeedback === "up") {
      current.delta = DECAY * current.delta + LEARNING_RATE * strength;
      current.upCount++;
    } else if (newFeedback === "down") {
      current.delta = DECAY * current.delta - LEARNING_RATE * strength;
      current.downCount++;
    }

    // Clamp
    current.delta = Math.max(-maxDelta, Math.min(maxDelta, current.delta));
    adjustments[catName] = current;
  }

  await prisma.setting.upsert({
    where: { key: WEIGHT_ADJUSTMENTS_KEY },
    create: { key: WEIGHT_ADJUSTMENTS_KEY, value: JSON.stringify(adjustments) },
    update: { value: JSON.stringify(adjustments) },
  });
}

/**
 * Find which skill categories are present in a text.
 * Returns a map of category name -> match strength (0-1).
 */
export function detectCategories(text: string): Map<string, number> {
  const lower = text.toLowerCase();
  const result = new Map<string, number>();

  for (const cat of SKILL_CATEGORIES) {
    let matchCount = 0;
    for (const term of cat.terms) {
      if (lower.includes(term)) matchCount++;
    }
    if (matchCount > 0) {
      // Ratio of matched terms, capped at 1
      result.set(cat.name, Math.min(matchCount / Math.max(cat.terms.length * 0.2, 2), 1));
    }
  }

  return result;
}

/**
 * Score a job against the resume using category-based matching.
 *
 * The algorithm:
 * 1. Detect which skill categories the job requires (from its text)
 * 2. Check how many of those the resume covers
 * 3. Weight by category importance and penalize mismatches
 * 4. Require at least 2 substantive category overlaps (not just generic ones)
 * 5. Apply seniority penalty — "Senior" / "PhD" jobs score lower for junior resumes
 */
export function scoreJob(
  jobText: string,
  resumeCategories: Map<string, number>,
  weightAdjustments?: Map<string, number>
): number {
  const jobCategories = detectCategories(jobText);
  const jobLower = jobText.toLowerCase();

  if (jobCategories.size === 0 || resumeCategories.size === 0) return 0;

  let weightedMatches = 0;
  let totalWeight = 0;
  let coreOverlaps = 0;

  for (const [catName, jobStrength] of jobCategories) {
    const cat = SKILL_CATEGORIES.find((c) => c.name === catName)!;
    const adjustment = weightAdjustments?.get(catName) ?? 0;
    const effectiveWeight = Math.max(cat.weight + adjustment, 0.1);
    const resumeStrength = resumeCategories.get(catName) ?? 0;

    totalWeight += effectiveWeight;

    if (resumeStrength > 0) {
      const matchQuality = Math.min(resumeStrength, jobStrength);
      weightedMatches += effectiveWeight * matchQuality;

      if (cat.core) {
        coreOverlaps++;
      }
    }
  }

  // Must match at least 2 core (technical/field-defining) categories
  if (totalWeight === 0 || coreOverlaps < 2) return 0;

  let score = weightedMatches / totalWeight;

  // Seniority penalty: "Senior", "Principal", "Staff", "Lead", "PhD" roles
  // are poor matches for a student/intern resume
  const isSenior = /\b(senior|sr\.|principal|staff|lead|phd|director|manager|head of)\b/i.test(jobLower);
  if (isSenior) {
    score *= 0.4;
  }

  // Small boost for entry-level alignment
  const isEntryLevel = /\b(intern|co-op|entry.level|junior|early career|new grad)\b/i.test(jobLower);
  if (isEntryLevel) {
    score *= 1.15;
  }

  return Math.min(score, 1);
}

/** Minimum score for a job to be considered a high match */
export const HIGH_MATCH_THRESHOLD = 0.25;
