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
  @IsNotEmpty()
  CRON_SCHEDULE!: string;

  @IsString()
  @IsNotEmpty()
  WEB3CAREER_TOKEN!: string;

  @IsString()
  @IsNotEmpty()
  STACK_KEYWORDS!: string;

  @IsString()
  @IsNotEmpty()
  SENIORITY_KEYWORDS!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  MIN_FIT_SCORE!: number;

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
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
