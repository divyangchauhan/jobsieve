import { Module } from '@nestjs/common';

import { AshbyAdapter } from './ashby.adapter.js';
import { CompanyCareersAdapter } from './company-careers.adapter.js';
import { GreenhouseAdapter } from './greenhouse.adapter.js';
import { HimalayasAdapter } from './himalayas.adapter.js';
import { LeverAdapter } from './lever.adapter.js';
import { RemoteOKAdapter } from './remote-ok.adapter.js';
import { RemotiveAdapter } from './remotive.adapter.js';
import { Web3CareerAdapter } from './web3career.adapter.js';
import { WwrAdapter } from './wwr.adapter.js';
import { YCombinatorAdapter } from './ycombinator.adapter.js';

export const ADAPTER_PROVIDERS = 'ADAPTER_PROVIDERS';

type AllAdapters = [
  RemoteOKAdapter,
  Web3CareerAdapter,
  GreenhouseAdapter,
  LeverAdapter,
  AshbyAdapter,
  RemotiveAdapter,
  HimalayasAdapter,
  WwrAdapter,
  YCombinatorAdapter,
  CompanyCareersAdapter,
];

@Module({
  providers: [
    RemoteOKAdapter,
    Web3CareerAdapter,
    GreenhouseAdapter,
    LeverAdapter,
    AshbyAdapter,
    RemotiveAdapter,
    HimalayasAdapter,
    WwrAdapter,
    YCombinatorAdapter,
    CompanyCareersAdapter,
    {
      provide: ADAPTER_PROVIDERS,
      useFactory: (
        remoteOK: RemoteOKAdapter,
        web3career: Web3CareerAdapter,
        greenhouse: GreenhouseAdapter,
        lever: LeverAdapter,
        ashby: AshbyAdapter,
        remotive: RemotiveAdapter,
        himalayas: HimalayasAdapter,
        wwr: WwrAdapter,
        ycombinator: YCombinatorAdapter,
        companyCareers: CompanyCareersAdapter,
      ): AllAdapters => [
        remoteOK,
        web3career,
        greenhouse,
        lever,
        ashby,
        remotive,
        himalayas,
        wwr,
        ycombinator,
        companyCareers,
      ],
      inject: [
        RemoteOKAdapter,
        Web3CareerAdapter,
        GreenhouseAdapter,
        LeverAdapter,
        AshbyAdapter,
        RemotiveAdapter,
        HimalayasAdapter,
        WwrAdapter,
        YCombinatorAdapter,
        CompanyCareersAdapter,
      ],
    },
  ],
  exports: [ADAPTER_PROVIDERS],
})
export class AdaptersModule {}
