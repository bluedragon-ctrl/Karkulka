import type { Model } from './model';
import type { TeacherChoice } from './teachers';
import type { TrainStats } from './train';
import type { Forest } from './world';

interface Common { model: Model; forest: Forest; stats: TrainStats; count: number; seed: number }
export type WorkerRequest = (Common & { kind: 'lessons'; teacher: TeacherChoice }) | (Common & { kind: 'practice' });

export type WorkerResponse =
  | { type: 'progress'; done: number; total: number; stats: TrainStats; model: Model; paths: { positions: number[]; tag: string }[] }
  | { type: 'done'; model: Model; stats: TrainStats }
  | { type: 'error'; message: string };

/** Run one training job in a Web Worker; `cancel` stops it and keeps nothing. */
export function runTraining(
  req: WorkerRequest,
  onProgress: (msg: Extract<WorkerResponse, { type: 'progress' }>) => void,
): { result: Promise<{ model: Model; stats: TrainStats }>; cancel: () => void } {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let reject: (e: Error) => void = () => {};
  const result = new Promise<{ model: Model; stats: TrainStats }>((res, rej) => {
    reject = rej;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress(msg);
      else {
        worker.terminate();
        if (msg.type === 'done') res({ model: msg.model, stats: msg.stats });
        else rej(new Error(msg.message));
      }
    };
    worker.onerror = (e) => { worker.terminate(); rej(new Error(e.message || 'Training failed')); };
  });
  worker.postMessage(req);
  return { result, cancel: () => { worker.terminate(); reject(new Error('cancelled')); } };
}
