import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export type ParsedJob = {
  title: string;
  company: string;
  description: string;
  qualifications: string | null;
  url: string;
  province: string | null;
  city: string | null;
  address: string | null;
  jobType: string | null;
  workplaceType: string | null;
  jobDuration: string | null;
  jobCommitment: string | null;
  applicationDeadline: string | null; // ISO date string
};

export type ParseResult = {
  jobs: ParsedJob[];
  inputTokens: number;
  outputTokens: number;
};

/**
 * Use Claude Haiku to extract structured job postings from raw page text.
 */
export async function parseJobsFromText(
  pageText: string,
  pageUrl: string,
  resumeText: string,
  keywords: string[]
): Promise<ParseResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a job posting parser. Extract all job postings from the following webpage text.

For each job found, extract these fields as a JSON object:
- title: job title (string, required)
- company: company name (string, required)
- description: the job overview and responsibilities only — do NOT include qualifications/requirements here (string, required)
- qualifications: extract ALL qualification-related content into this field. Look for sections with headings like "What you bring", "Requirements", "Qualifications", "Skills", "What we're looking for", "Must have", "Nice to have", "You have", "Education", "Experience required", or similar. Also extract any listed certifications, years of experience, degrees, technical skills, tools, or soft skills mentioned as requirements. Include everything related to what the candidate needs. This should almost always be non-null — most postings mention some form of requirements even if not under a clear heading. (string or null)
- url: the URL of this specific job posting if available, otherwise use "${pageUrl}" (string)
- province: province/state (string or null)
- city: city name (string or null)
- address: street address (string or null)
- jobType: category like "Software Engineering", "Marketing", etc. (string or null)
- workplaceType: one of "remote", "in-person", "hybrid", or null
- jobDuration: one of "permanent", "co-op", "internship", or null
- jobCommitment: one of "full-time", "part-time", "casual", or null
- applicationDeadline: deadline as ISO date string "YYYY-MM-DD" or null

User's resume keywords for context: ${keywords.join(", ")}

User's resume summary for relevance context:
${resumeText.slice(0, 2000)}

Webpage text:
${pageText.slice(0, 12000)}

Respond ONLY with a JSON array of job objects. If no jobs are found, respond with [].`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const { input_tokens, output_tokens } = response.usage;

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { jobs: [], inputTokens: input_tokens, outputTokens: output_tokens };
    return {
      jobs: JSON.parse(jsonMatch[0]) as ParsedJob[],
      inputTokens: input_tokens,
      outputTokens: output_tokens,
    };
  } catch {
    console.error("Failed to parse Haiku response:", text);
    return { jobs: [], inputTokens: input_tokens, outputTokens: output_tokens };
  }
}
