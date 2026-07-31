import type { DailyVerdict } from './types.ts'

export function equityWeightLabel([lo, hi]: [number, number]): string {
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`
}

const SIGNAL_LABELS: Record<DailyVerdict['signal'], { text: string; className: string }> = {
  increase: { text: '비중 확대', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  hold: { text: '유지', className: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300' },
  reduce: { text: '비중 축소', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export function signalLabel(signal: DailyVerdict['signal']) {
  return SIGNAL_LABELS[signal]
}

const STANCE_CLASSES: Record<'OW' | 'N' | 'UW', string> = {
  OW: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  N: 'bg-neutral-500/20 text-neutral-600 dark:text-neutral-300',
  UW: 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
}

export function stanceClassName(stance: 'OW' | 'N' | 'UW'): string {
  return STANCE_CLASSES[stance]
}

// 50이 중립. 낮을수록 붉게, 높을수록 푸르게.
export function scoreGaugeColor(score: number): string {
  return score >= 50 ? '#059669' : '#e11d48'
}
