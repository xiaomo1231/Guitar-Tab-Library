import { describe, expect, it } from 'vitest'
import type { RehearsalDevice, RehearsalState } from '../web/lib/api'
import { freshRehearsal } from '../server/rehearsal'
import {
  LIGHT_OK_MS,
  playerShiftMs,
  referenceDevice,
  syncLight,
} from '../web/viewer/rehearsalTiming'

const dev = (deviceId: string, over: Partial<RehearsalDevice> = {}): RehearsalDevice => ({
  deviceId,
  userId: deviceId,
  label: deviceId,
  ready: false,
  audible: false,
  latencyMs: 0,
  driftMs: null,
  connected: true,
  ...over,
})

const state = (over: Partial<RehearsalState> = {}): RehearsalState => ({
  ...freshRehearsal(),
  active: true,
  speakerDevice: 'spk',
  leaderDevice: 'lead',
  devices: [dev('lead'), dev('spk', { latencyMs: 200 }), dev('other')],
  ...over,
})

describe('referenceDevice', () => {
  it('is the speaker when it is connected', () => {
    expect(referenceDevice(state())?.deviceId).toBe('spk')
  })

  it('falls back to the leader device, then the first connected device', () => {
    const away = (ids: string[]) =>
      state({ devices: state().devices.map((d) => ({ ...d, connected: !ids.includes(d.deviceId) })) })
    expect(referenceDevice(away(['spk']))?.deviceId).toBe('lead')
    expect(referenceDevice(away(['spk', 'lead']))?.deviceId).toBe('other')
    expect(referenceDevice(away(['spk', 'lead', 'other']))).toBe(null)
  })

  it('uses the leader device when there is no speaker', () => {
    expect(referenceDevice(state({ speakerDevice: null }))?.deviceId).toBe('lead')
  })
})

describe('playerShiftMs', () => {
  it('shifts silent screens by the connected speaker latency', () => {
    expect(playerShiftMs(state(), 'other')).toBe(200)
    expect(playerShiftMs(state(), 'spk')).toBe(0)
  })

  it('follows the leader device without the speaker latency when the speaker is away', () => {
    const s = state({
      devices: [
        dev('lead', { latencyMs: 30 }),
        dev('spk', { latencyMs: 200, connected: false }),
        dev('other', { audible: true, latencyMs: 50 }),
      ],
    })
    // The leader device does not sound: its latency does not count; ours does.
    expect(playerShiftMs(s, 'other')).toBe(-50)
    expect(playerShiftMs(s, 'lead')).toBe(0)
    // The disconnected speaker itself still makes sound and shifts by its own latency.
    expect(playerShiftMs(s, 'spk')).toBe(-200)
  })
})

describe('syncLight', () => {
  it('is away whenever this device is not connected', () => {
    expect(syncLight(false, true, 0)).toBe('away')
    expect(syncLight(false, false, null)).toBe('away')
  })

  it('is fixing only while playing with a drift beyond LIGHT_OK_MS', () => {
    expect(syncLight(true, true, LIGHT_OK_MS)).toBe('ok')
    expect(syncLight(true, true, -LIGHT_OK_MS)).toBe('ok')
    expect(syncLight(true, true, LIGHT_OK_MS + 1)).toBe('fixing')
    expect(syncLight(true, true, -LIGHT_OK_MS - 1)).toBe('fixing')
    expect(syncLight(true, false, 5000)).toBe('ok')
    expect(syncLight(true, true, null)).toBe('ok')
  })
})
