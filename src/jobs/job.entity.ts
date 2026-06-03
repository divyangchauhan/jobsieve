import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('jobs')
@Index(['status', 'first_seen_at'])
export class Job {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ unique: true })
  dedup_key!: string;

  @Column()
  source!: string;

  @Column({ type: 'text', nullable: true })
  source_job_id!: string | null;

  @Column()
  title!: string;

  @Column()
  company!: string;

  @Column()
  url!: string;

  @Column({ type: 'datetime', nullable: true })
  posted_at!: Date | null;

  @Column({ type: 'simple-json' })
  tags!: string[];

  @Column({ default: false })
  remote!: boolean;

  @Column({ type: 'text', nullable: true })
  salary!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int', nullable: true })
  fit_score!: number | null;

  @Column({ default: 'New' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notion_page_id!: string | null;

  @CreateDateColumn()
  first_seen_at!: Date;

  @Column({ type: 'datetime' })
  last_seen_at!: Date;
}
