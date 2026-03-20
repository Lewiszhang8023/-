/// <reference types="vite/client" />

declare global {
  interface Window {
    deviceApp?: {
      platform: string;
      apiBaseUrl: string;
    };
  }
}

export {};
