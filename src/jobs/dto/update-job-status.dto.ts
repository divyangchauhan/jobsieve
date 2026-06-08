import { IsEnum } from 'class-validator';

export const JOB_STATUSES = ['New', 'Reviewing', 'Applied', 'Skipped'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export class UpdateJobStatusDto {
  @IsEnum(JOB_STATUSES)
  status!: JobStatus;
}
