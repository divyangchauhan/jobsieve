import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const MAX_FRESHNESS_DAYS = 365;
const MAX_FIT_SCORE = 100;

export class UpdateProfileDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  roleFamilies!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  seniorities!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  stack!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  locationTypes!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  regionEligibility!: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  excludeTerms!: string[];

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_FRESHNESS_DAYS)
  @IsOptional()
  @Type(() => Number)
  freshnessDays!: number | null;

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_FIT_SCORE)
  @IsOptional()
  @Type(() => Number)
  minFitScore!: number | null;
}
