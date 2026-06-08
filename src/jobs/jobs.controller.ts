import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';

import { GetJobsQueryDto } from './dto/get-jobs-query.dto.js';
import { PaginatedJobsResponseDto } from './dto/paginated-jobs-response.dto.js';
import { JobResponseDto } from './dto/job-response.dto.js';
import { UpdateJobStatusDto } from './dto/update-job-status.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  findAll(@Query() query: GetJobsQueryDto): Promise<PaginatedJobsResponseDto> {
    return this.jobsService.findAll(query);
  }

  @Patch(':id')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobStatusDto,
  ): Promise<JobResponseDto> {
    return this.jobsService.updateStatus(id, dto.status);
  }
}
