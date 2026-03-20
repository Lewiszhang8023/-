import { BootstrapPayload, Equipment, StockAction, StockLog } from './shared';

const apiBaseUrl = window.deviceApp?.apiBaseUrl ?? 'http://127.0.0.1:3210';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<BootstrapPayload>('/api/bootstrap'),
  saveItem: (item: Equipment) => request<BootstrapPayload>('/api/items/save', { method: 'POST', body: JSON.stringify(item) }),
  deleteItem: (id: string) => request<BootstrapPayload>('/api/items/delete', { method: 'POST', body: JSON.stringify({ id }) }),
  importData: (payload: { items: Equipment[]; logs: StockLog[] }) => request<BootstrapPayload>('/api/items/import', { method: 'POST', body: JSON.stringify(payload) }),
  stockAction: (equipmentId: string, action: StockAction, person: string, channel: StockLog['channel']) =>
    request<BootstrapPayload>('/api/stock/action', { method: 'POST', body: JSON.stringify({ equipmentId, action, person, channel }) }),
  lookup: (code: string) => request<Equipment>('/api/lookup', { method: 'POST', body: JSON.stringify({ code }) })
};
