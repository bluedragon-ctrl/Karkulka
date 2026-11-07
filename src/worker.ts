/// <reference lib="webworker" />
/** Training runs here so the page never freezes. */
import { createAdam } from './model';
import { mulberry32 } from './rng';
import { trainLessons, trainPractice } from './train';
import type { WorkerRequest, WorkerResponse } from './workerTypes';

const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const { model, forest, stats } = req;
    const rng = mulberry32(req.seed);
    const onChunk = (info: { done: number; paths: { positions: number[]; tag: string }[] }) =>
      post({ type: 'progress', done: info.done, total: req.count, stats, paths: info.paths, model });
    if (req.kind === 'lessons') trainLessons(model, createAdam(model), forest, req.teacher, req.count, stats, rng, onChunk);
    else trainPractice(model, forest, req.count, stats, rng, onChunk);
    post({ type: 'done', model, stats });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
