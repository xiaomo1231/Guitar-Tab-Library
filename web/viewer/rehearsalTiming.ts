/**
 * 排练 timing (pure): when this device starts, where its player should be, and
 * whether to correct it. Every device aligns to what the room HEARS: the 音箱's
 * sound comes out `latency` ms after its player position, so a silent screen runs
 * that much behind the 音箱's player, and a device with earphones starts earlier
 * by its own latency.
 */
import type { RehearsalDevice, RehearsalState } from '../lib/api'
import { referenceDeviceId } from '@/songs/scoreServerTypes'

/** The device whose player is the reference (see referenceDeviceId: one that is there). */
export function referenceDevice(state: RehearsalState): RehearsalDevice | null {
  const id = referenceDeviceId(state)
  return state.devices.find((d) => d.deviceId === id) ?? null
}

/** Does this device make sound? (the 音箱 always; others only with 耳机出声) */
export function makesSound(state: RehearsalState, deviceId: string): boolean {
  if (state.speakerDevice === deviceId) return true
  return state.devices.find((d) => d.deviceId === deviceId)?.audible ?? false
}

/**
 * How much later (ms) this device's player runs than the reference device's player.
 * The reference's sound is late by its latency (when it makes sound); ours too.
 */
export function playerShiftMs(state: RehearsalState, deviceId: string): number {
  const ref = referenceDevice(state)
  if (!ref || ref.deviceId === deviceId) return 0
  const refLatency = makesSound(state, ref.deviceId) ? ref.latencyMs : 0
  const me = state.devices.find((d) => d.deviceId === deviceId)
  const myLatency = me && makesSound(state, deviceId) ? me.latencyMs : 0
  return refLatency - myLatency
}

/** Local (Date.now()) time at which this device starts `state.tick`. */
export function localStartAt(state: RehearsalState, deviceId: string, offsetMs: number): number {
  return state.startAt - offsetMs + playerShiftMs(state, deviceId)
}

/**
 * Where this device's player should be now (ms, alphaTab timePosition), from the
 * reference's last report: its position then, plus the time since, minus our shift.
 */
export function expectedTimeMs(
  clock: { timeMs: number; at: number },
  serverNow: number,
  shiftMs: number,
): number {
  return clock.timeMs + (serverNow - clock.at) - shiftMs
}

/** Drift beyond which a device is put back in place (ms): tighter for devices that sound. */
export function driftLimitMs(sounding: boolean): number {
  return sounding ? 35 : 80
}

/** How this device follows the room, for the 同步 light. */
export type SyncLight = 'ok' | 'fixing' | 'away'

/** Drift (ms) that still counts as in step for the light. */
export const LIGHT_OK_MS = 120

export function syncLight(connected: boolean, playing: boolean, driftMs: number | null): SyncLight {
  if (!connected) return 'away'
  if (playing && driftMs !== null && Math.abs(driftMs) > LIGHT_OK_MS) return 'fixing'
  return 'ok'
}
