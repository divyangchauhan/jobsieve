import { Body, Controller, Get, Put } from '@nestjs/common';

import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { buildProfileOptions } from './profile-options.js';
import type { ProfileOptions } from './profile-options.js';
import { Profile } from './profile.entity.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  get(): Promise<Profile> {
    return this.profileService.getProfile();
  }

  // Static taxonomy for the settings UI's multi-select option lists.
  @Get('options')
  options(): ProfileOptions {
    return buildProfileOptions();
  }

  @Put()
  update(@Body() dto: UpdateProfileDto): Promise<Profile> {
    return this.profileService.update(dto);
  }
}
