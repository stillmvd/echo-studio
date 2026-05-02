import { invoke } from '@tauri-apps/api/core';
import type { MemoriesFilter, MemoriesPage, MemoryWithBody } from './types';

export async function listMemories(filter: MemoriesFilter = {}): Promise<MemoriesPage> {
  return invoke<MemoriesPage>('list_memories', { filter });
}

export async function getMemory(id: string): Promise<MemoryWithBody | null> {
  return invoke<MemoryWithBody | null>('get_memory', { id });
}
