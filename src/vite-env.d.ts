/// <reference types="vite/client" />

declare global {
  interface Window {
    deviceApp?: {
      platform: string;
    };
  }
}

export {};
