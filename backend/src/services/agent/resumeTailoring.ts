import { improveResumeForJob } from './matcher';

export class ResumeTailor {
  /**
   * Rewrites the candidate's resume bullets dynamically using OpenRouter to align with the job description.
   */
  async tailorForJob(
    baseResumeText: string,
    skills: string[],
    jobTitle: string,
    jobDescription: string,
    targetField?: string | null,
    experienceLevel?: string | null,
    userId?: string
  ): Promise<string> {
    return improveResumeForJob(
      baseResumeText,
      skills,
      jobTitle,
      jobDescription,
      targetField,
      experienceLevel,
      userId
    );
  }
}

export const resumeTailor = new ResumeTailor();
