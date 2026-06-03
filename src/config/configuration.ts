export const configuration = () => ({
  database: {
    path: process.env['DATABASE_PATH'] ?? './data/jobsieve.sqlite',
  },
  cron: {
    schedule: process.env['CRON_SCHEDULE'] ?? '0 */4 * * *',
  },
  api: {
    port: parseInt(process.env['API_PORT'] ?? '3000', 10),
  },
  scoring: {
    minFitScore: parseInt(process.env['MIN_FIT_SCORE'] ?? '4', 10),
    stackKeywords: (process.env['STACK_KEYWORDS'] ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    seniorityKeywords: (process.env['SENIORITY_KEYWORDS'] ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  },
  adapters: {
    web3careerToken: process.env['WEB3CAREER_TOKEN'] ?? '',
  },
  notion: {
    token: process.env['NOTION_TOKEN'] || null,
    databaseId: process.env['NOTION_DATABASE_ID'] || null,
  },
});

export type AppConfig = ReturnType<typeof configuration>;
