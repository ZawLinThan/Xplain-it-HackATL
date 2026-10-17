import { useDemoMode } from '../demoMode'
import { FEATURES, STATUS_TEXT, statusOf, type FeatureKey } from '../features'

interface BadgeProps {
  feature: FeatureKey
  /** Show the feature's name next to the status. */
  withLabel?: boolean
}

/** Working / Simulated / Planned label, driven by the feature map in features.ts. */
export default function Badge({ feature, withLabel = false }: BadgeProps) {
  const demoMode = useDemoMode()
  const definition = FEATURES[feature]
  if (!definition) return null
  const status = statusOf(feature, demoMode)
  const { label } = definition
  return (
    <span className={`badge badge-${status}`} title={label}>
      {withLabel && <span className="badge-label">{label}: </span>}
      {STATUS_TEXT[status]}
    </span>
  )
}
