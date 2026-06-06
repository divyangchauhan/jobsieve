import { Module } from '@nestjs/common';

import { HireWeb3Adapter } from './hireweb3.adapter.js';
import { RemoteOKAdapter } from './remote-ok.adapter.js';
import { Web3CareerAdapter } from './web3career.adapter.js';

export const ADAPTER_PROVIDERS = 'ADAPTER_PROVIDERS';

@Module({
  providers: [
    RemoteOKAdapter,
    Web3CareerAdapter,
    HireWeb3Adapter,
    {
      provide: ADAPTER_PROVIDERS,
      useFactory: (
        remoteOK: RemoteOKAdapter,
        web3career: Web3CareerAdapter,
        hireWeb3: HireWeb3Adapter,
      ): [RemoteOKAdapter, Web3CareerAdapter, HireWeb3Adapter] => [
        remoteOK,
        web3career,
        hireWeb3,
      ],
      inject: [RemoteOKAdapter, Web3CareerAdapter, HireWeb3Adapter],
    },
  ],
  exports: [ADAPTER_PROVIDERS],
})
export class AdaptersModule {}
