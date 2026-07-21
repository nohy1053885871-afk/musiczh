import type { OverviewBundle } from './types.js'

export type ParityMismatch = { path: string; raw: unknown; rollup: unknown }

function stableCombinations(bundle: OverviewBundle) {
  return [...bundle.devices.combinations].sort((a, b) =>
    `${a.browser}\u0000${a.os}\u0000${a.device_type}`.localeCompare(
      `${b.browser}\u0000${b.os}\u0000${b.device_type}`,
    ),
  )
}

export function compareOverviewBundles(raw: OverviewBundle, rollup: OverviewBundle): ParityMismatch[] {
  const mismatches: ParityMismatch[] = []
  const check = (path: string, rawValue: unknown, rollupValue: unknown) => {
    if (JSON.stringify(rawValue) !== JSON.stringify(rollupValue)) {
      mismatches.push({ path, raw: rawValue, rollup: rollupValue })
    }
  }

  for (const key of Object.keys(raw.overview) as Array<keyof typeof raw.overview>) {
    if (key === 'range' || key === 'from' || key === 'to') continue
    check(`overview.${key}`, raw.overview[key], rollup.overview[key])
  }
  check('funnel.user.steps', raw.funnel.user.steps, rollup.funnel.user.steps)
  check('funnel.file.steps', raw.funnel.file.steps, rollup.funnel.file.steps)
  check('timeseries', raw.timeseries, rollup.timeseries)
  check('devices.combinations', stableCombinations(raw), stableCombinations(rollup))
  return mismatches
}
