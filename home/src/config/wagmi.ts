import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: '',
  projectId: 'b17f3dfd750ddac8a6cab0f1289b5f77',
  chains: [sepolia],
  ssr: false,
});
