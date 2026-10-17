import { useDemoMode } from '../demoMode'
import { FEATURES, STATUS_TEXT, statusOf, type FeatureKey } from '../features'

interface BadgeProps {
  feature: FeatureKey
  /** Show the feature's name next to the status. */
  withLabel?: boolean
}

/** Working / Simulated / Planned label, driven by the feature map in features.ts. */
export default function Badge({ feature, withLabel = false }: BadgeProps) {
  const status = statusOf(feature, useDemoMode())
  const { label } = FEATURES[feature]
  return (
    <span className={`badge badge-${status}`} title={label}>
      {withLabel && <span className="badge-label">{label}: </span>}
      {STATUS_TEXT[status]}
    </span>
  )
}
