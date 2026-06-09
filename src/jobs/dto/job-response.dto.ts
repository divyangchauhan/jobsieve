export class JobResponseDto {
  id!: number;
  dedup_key!: string;
  source!: string;
  source_job_id!: string | null;
  title!: string;
  company!: string;
  url!: string;
  posted_at!: Date | null;
  tags!: string[];
  remote!: boolean;
  salary!: string | null;
  description!: string | null;
  fit_score!: number | null;
  status!: string;
  notion_page_id!: string | null;
  first_seen_at!: Date;
  last_seen_at!: Date;
}
