import { JobResponseDto } from './job-response.dto.js';

export class PaginatedJobsResponseDto {
  data!: JobResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
}
