import { Module } from '@nestjs/common';

import { RemoteOKAdapter } from './remote-ok.adapter.js';
import { Web3CareerAdapter } from './web3career.adapter.js';

export const ADAPTER_PROVIDERS = 'ADAPTER_PROVIDERS';

@Module({
  providers: [
    RemoteOKAdapter,
    Web3CareerAdapter,
    {
      provide: ADAPTER_PROVIDERS,
      useFactory: (
        remoteOK: RemoteOKAdapter,
        web3career: Web3CareerAdapter,
      ): [RemoteOKAdapter, Web3CareerAdapter] => [remoteOK, web3career],
      inject: [RemoteOKAdapter, Web3CareerAdapter],
    },
  ],
  exports: [ADAPTER_PROVIDERS],
})
export class AdaptersModule {}
