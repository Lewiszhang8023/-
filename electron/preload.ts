import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('deviceApp', {
  platform: process.platform
});
