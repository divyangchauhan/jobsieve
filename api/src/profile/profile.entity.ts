import { Column, Entity, PrimaryColumn } from 'typeorm';

// Singleton relevance profile — exactly one row, id = PROFILE_ID. Single source
// of truth for both ranking (scoring) and hard filtering of the jobs list.
export const PROFILE_ID = 1;

@Entity('profile')
export class Profile {
  @PrimaryColumn()
  id!: number;

  @Column({ type: 'simple-json' })
  roleFamilies!: string[];

  @Column({ type: 'simple-json' })
  seniorities!: string[];

  @Column({ type: 'simple-json' })
  stack!: string[];

  @Column({ type: 'simple-json' })
  locationTypes!: string[];

  @Column({ type: 'simple-json' })
  regionEligibility!: string[];

  @Column({ type: 'simple-json' })
  excludeTerms!: string[];

  @Column({ type: 'int', nullable: true })
  freshnessDays!: number | null;

  @Column({ type: 'int', nullable: true })
  minFitScore!: number | null;
}
