import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_PATH!: string;

  @IsString()
  @IsOptional()
  CRON_SCHEDULE?: string;

  // Optional: a fresh desktop install has no .env. The web3career adapter
  // no-ops (returns []) when the token is absent; all other sources still run.
  @IsString()
  @IsOptional()
  WEB3CAREER_TOKEN?: string;

  // Retired: scoring now sources stack/seniority from the relevance profile +
  // taxonomy. Kept optional so existing .env files still validate.
  @IsString()
  @IsOptional()
  STACK_KEYWORDS?: string;

  @IsString()
  @IsOptional()
  SENIORITY_KEYWORDS?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  MIN_FIT_SCORE?: number;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  API_PORT?: number;

  @IsString()
  @IsOptional()
  NOTION_TOKEN?: string;

  @IsString()
  @IsOptional()
  NOTION_DATABASE_ID?: string;

  // Notion column-name overrides. These are the only NOTION_COL_* vars the sync
  // service reads (see notion-column-map.ts). Defaults: Company, Position, Link, Stage.
  @IsString()
  @IsOptional()
  NOTION_COL_NAME?: string;

  @IsString()
  @IsOptional()
  NOTION_COL_POSITION?: string;

  @IsString()
  @IsOptional()
  NOTION_COL_LINK?: string;

  @IsString()
  @IsOptional()
  NOTION_COL_STAGE?: string;

  @IsString()
  @IsOptional()
  TITLE_ALLOWLIST_ENABLED?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
