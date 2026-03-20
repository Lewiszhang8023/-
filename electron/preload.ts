import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('deviceApp', {
  platform: process.platform,
  apiBaseUrl: 'http://127.0.0.1:3210'
});
